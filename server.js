const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const OpenAI = require('openai');
const session = require('express-session');
const ConnectPgSimple = require('connect-pg-simple')(session);
const passport = require('passport');
const { discovery, buildEndSessionUrl } = require('openid-client');
const { Strategy } = require('openid-client/passport');
const memoizee = require('memoizee');
const { getStripeClient, getStripePublishableKey, getStripeSync } = require('./stripeClient');

const app = express();
const PORT = 5000;

app.set('trust proxy', 1);

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing signature' });
  try {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    const sync = await getStripeSync();
    await sync.processWebhook(req.body, sig);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: 'Webhook processing error' });
  }
});

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const openai = new OpenAI.default({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const sessionStore = new ConnectPgSimple({
  pool,
  tableName: 'sessions',
  createTableIfMissing: false,
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

const ISSUER_URL = process.env.ISSUER_URL || 'https://replit.com/oidc';
const CLIENT_ID = process.env.REPL_ID;

const getOidcConfig = memoizee(async () => {
  const config = await discovery(new URL(ISSUER_URL), CLIENT_ID);
  return config;
}, { promise: true, maxAge: 3600000 });

let authReady = false;

async function setupAuth() {
  const config = await getOidcConfig();

  const callbackURL = `https://${process.env.REPLIT_DOMAINS || 'localhost:5000'}/api/callback`;

  const strategy = new Strategy(
    {
      config,
      scope: 'openid email profile',
      callbackURL,
    },
    (tokenSet, done) => {
      const claims = tokenSet.claims();
      const user = {
        id: claims.sub,
        email: claims.email || null,
        first_name: claims.first_name || null,
        last_name: claims.last_name || null,
        profile_image_url: claims.profile_image_url || null,
      };
      done(null, user);
    }
  );

  passport.use('openid-client', strategy);
  authReady = true;
}

const ALLOWED_REDIRECTS = ['/', '/signup.html', '/client-signup.html', '/verify.html', '/creators.html', '/chat.html', '/admin.html', '/creator-settings.html', '/creator-onboarding.html'];
const ALLOWED_ACCOUNT_TYPES = ['creator', 'buyer'];

app.get('/api/login', (req, res, next) => {
  if (!authReady) {
    return res.status(503).send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Loading...</title>
      <meta http-equiv="refresh" content="2">
      <style>body{background:#121212;color:#eee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .box{text-align:center;padding:2rem;}.spinner{border:3px solid #333;border-top:3px solid #CC0033;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 1rem;}
      @keyframes spin{to{transform:rotate(360deg)}}</style></head>
      <body><div class="box"><div class="spinner"></div><h2>Setting up login...</h2><p>This page will refresh automatically in a moment.</p></div></body></html>
    `);
  }
  if (req.query.redirect && ALLOWED_REDIRECTS.includes(req.query.redirect)) {
    req.session.loginRedirect = req.query.redirect;
  }
  if (req.query.account_type && ALLOWED_ACCOUNT_TYPES.includes(req.query.account_type)) {
    req.session.accountType = req.query.account_type;
  }
  passport.authenticate('openid-client', {
    prompt: 'login consent',
  })(req, res, next);
});

app.get('/api/callback', (req, res, next) => {
  if (!authReady) {
    return res.redirect('/');
  }
  next();
},
  passport.authenticate('openid-client', { failureRedirect: '/' }),
  async (req, res) => {
    try {
      const user = req.user;
      const accountType = req.session.accountType || null;
      await pool.query(
        `INSERT INTO users (id, email, first_name, last_name, profile_image_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           profile_image_url = EXCLUDED.profile_image_url,
           updated_at = NOW()`,
        [user.id, user.email, user.first_name, user.last_name, user.profile_image_url]
      );

      if (accountType) {
        await pool.query(
          `INSERT INTO user_profiles (user_id, account_type, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             account_type = COALESCE(user_profiles.account_type, EXCLUDED.account_type),
             updated_at = NOW()`,
          [user.id, accountType]
        );
      }
    } catch (error) {
      console.error('Error upserting user:', error);
    }

    const redirect = req.session.loginRedirect || '/';
    delete req.session.loginRedirect;
    delete req.session.accountType;
    res.redirect(redirect);
  }
);

app.get('/api/logout', async (req, res) => {
  try {
    const config = await getOidcConfig();
    const idToken = req.session?.passport?.user?.id_token;
    req.logout((err) => {
      if (err) console.error('Logout error:', err);
      req.session.destroy(() => {
        const endSessionUrl = buildEndSessionUrl(config, {
          post_logout_redirect_uri: `${req.protocol}://${req.get('host')}`,
          id_token_hint: idToken,
        });
        res.redirect(endSessionUrl.href);
      });
    });
  } catch (error) {
    console.error('Logout error:', error);
    req.logout(() => {
      req.session.destroy(() => {
        res.redirect('/');
      });
    });
  }
});

app.get('/api/auth/user', async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.json(null);
  }

  try {
    const result = await pool.query(
      `SELECT u.*, 
        up.id as profile_id, up.account_type, up.stage_name, up.display_name, up.legal_first_name, up.legal_last_name,
        up.date_of_birth, up.city, up.state_province, up.country, up.zip_code, up.id_document_type,
        up.id_verified, up.verification_status, up.stripe_customer_id, up.stripe_connect_account_id,
        up.stripe_onboarding_complete, up.bio, up.specialties,
        up.onboarding_stage, up.onboarding_score, up.service_risk_level, up.content_categories,
        up.created_at as profile_created_at, up.updated_at as profile_updated_at
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    const row = result.rows[0];
    const user = {
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      profile_image_url: row.profile_image_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    let profile = null;
    if (row.profile_id) {
      profile = {
        id: row.profile_id,
        user_id: row.id,
        account_type: row.account_type,
        stage_name: row.stage_name,
        display_name: row.display_name,
        legal_first_name: row.legal_first_name,
        legal_last_name: row.legal_last_name,
        date_of_birth: row.date_of_birth,
        city: row.city,
        state_province: row.state_province,
        country: row.country,
        zip_code: row.zip_code,
        id_document_type: row.id_document_type,
        id_verified: row.id_verified,
        verification_status: row.verification_status,
        stripe_customer_id: row.stripe_customer_id,
        stripe_connect_account_id: row.stripe_connect_account_id,
        stripe_onboarding_complete: row.stripe_onboarding_complete,
        bio: row.bio,
        specialties: row.specialties,
        onboarding_stage: row.onboarding_stage,
        onboarding_score: row.onboarding_score,
        service_risk_level: row.service_risk_level,
        content_categories: row.content_categories,
        created_at: row.profile_created_at,
        updated_at: row.profile_updated_at,
      };
    }

    res.json({ user, profile });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/age-confirm', (req, res) => {
  if (req.session) {
    req.session.ageVerified = true;
  }
  res.json({ success: true });
});

app.get('/api/age-status', (req, res) => {
  res.json({ verified: req.session?.ageVerified === true });
});

function requireAgeVerification(req, res, next) {
  if (req.session?.ageVerified === true) {
    return next();
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(403).json({ error: 'Age verification required' });
}

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

async function isVerifiedUser(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT verification_status FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );
    const profile = result.rows[0];
    if (profile && (profile.verification_status === 'submitted' || profile.verification_status === 'verified')) {
      return next();
    }
    res.status(403).json({ error: 'Identity verification required' });
  } catch (error) {
    res.status(500).json({ error: 'Verification check failed' });
  }
}

const ADMIN_NAMES = [{ first: 'christopher', last: 'barr' }];

function isAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (adminIds.length > 0 && adminIds.includes(req.user.id)) {
    return next();
  }

  const firstName = (req.user.first_name || '').toLowerCase().trim();
  const lastName = (req.user.last_name || '').toLowerCase().trim();
  const match = ADMIN_NAMES.some(a => a.first === firstName && a.last === lastName);
  if (match) return next();
  res.status(403).json({ error: 'Admin access required' });
}

app.get('/api/admin/stats', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const users = await pool.query('SELECT COUNT(*) as count FROM users');
    const verified = await pool.query("SELECT COUNT(*) as count FROM user_profiles WHERE verification_status IN ('submitted', 'verified')");
    const creators = await pool.query("SELECT COUNT(*) as count FROM user_profiles WHERE account_type = 'creator'");
    const buyers = await pool.query("SELECT COUNT(*) as count FROM user_profiles WHERE account_type = 'buyer'");
    const conversations = await pool.query('SELECT COUNT(*) as count FROM conversations');
    const messages = await pool.query('SELECT COUNT(*) as count FROM messages');
    const stripeConnected = await pool.query("SELECT COUNT(*) as count FROM user_profiles WHERE stripe_onboarding_complete = true");

    res.json({
      totalUsers: parseInt(users.rows[0].count),
      verifiedUsers: parseInt(verified.rows[0].count),
      creators: parseInt(creators.rows[0].count),
      buyers: parseInt(buyers.rows[0].count),
      totalConversations: parseInt(conversations.rows[0].count),
      totalMessages: parseInt(messages.rows[0].count),
      stripeConnected: parseInt(stripeConnected.rows[0].count),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.profile_image_url, u.created_at,
        up.account_type, up.stage_name, up.verification_status, up.city, up.state, up.country,
        up.stripe_connect_account_id, up.stripe_onboarding_complete,
        (SELECT COUNT(*) FROM conversations WHERE creator_name = up.stage_name OR buyer_name = up.stage_name) as conversation_count,
        (SELECT COUNT(*) FROM messages WHERE sender_name = up.stage_name) as message_count
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.delete('/api/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove your own account' });
    }
    const profile = await pool.query('SELECT stage_name FROM user_profiles WHERE user_id = $1', [id]);
    const stageName = profile.rows[0]?.stage_name;

    if (stageName) {
      await pool.query('DELETE FROM messages WHERE sender_name = $1', [stageName]);
      await pool.query('DELETE FROM conversations WHERE creator_name = $1 OR buyer_name = $1', [stageName]);
    }
    await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

app.get('/api/admin/messages', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.creator_name, c.buyer_name, c.created_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM conversations c
      ORDER BY c.updated_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/admin/check', isAuthenticated, isAdmin, (req, res) => {
  res.json({ isAdmin: true });
});

app.get('/api/admin/review-queue', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cs.id, cs.service_type, cs.title, cs.description, cs.price, cs.risk_level, 
             cs.is_active, cs.created_at,
             up.stage_name, up.display_name, up.onboarding_score,
             up.service_risk_level as creator_risk_level,
             u.email
      FROM creator_services cs
      JOIN user_profiles up ON cs.user_id = up.user_id
      JOIN users u ON cs.user_id = u.id
      WHERE cs.risk_level = 'elevated'
      ORDER BY cs.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin review queue error:', error);
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

app.post('/api/admin/services/:id/toggle', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE creator_services SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Admin toggle service error:', error);
    res.status(500).json({ error: 'Failed to toggle service' });
  }
});

app.get('/api/creators', requireAgeVerification, async (req, res) => {
  try {
    const { search, zip_code, radius } = req.query;
    let query = `
      SELECT up.stage_name, up.display_name, up.bio, up.city, up.state_province,
             up.zip_code, up.specialties, u.profile_image_url
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      WHERE up.account_type = 'creator'
        AND up.verification_status IN ('submitted', 'verified')
    `;
    const params = [];

    if (search && search.trim()) {
      params.push('%' + search.trim().toLowerCase() + '%');
      query += ` AND (LOWER(up.stage_name) LIKE $${params.length} OR LOWER(up.display_name) LIKE $${params.length})`;
    }

    if (zip_code && zip_code.trim()) {
      params.push(zip_code.trim());
      query += ` AND up.zip_code = $${params.length}`;
    }

    query += ' ORDER BY up.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching creators:', error);
    res.status(500).json({ error: 'Failed to fetch creators' });
  }
});

app.get('/api/creators/:name', requireAgeVerification, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT up.stage_name, up.display_name, up.bio, up.city, up.state_province,
              up.zip_code, up.specialties, u.profile_image_url
       FROM user_profiles up
       JOIN users u ON u.id = up.user_id
       WHERE up.stage_name = $1 AND up.account_type = 'creator'`,
      [req.params.name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Creator not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching creator:', error);
    res.status(500).json({ error: 'Failed to fetch creator' });
  }
});

app.get('/api/profile', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.post('/api/profile', isAuthenticated, async (req, res) => {
  try {
    const {
      account_type, stage_name, display_name, legal_first_name, legal_last_name,
      date_of_birth, city, state_province, country, zip_code, bio, specialties
    } = req.body;

    const existing = await pool.query(
      'SELECT id FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE user_profiles SET
          account_type = COALESCE($2, account_type),
          stage_name = COALESCE($3, stage_name),
          legal_first_name = COALESCE($4, legal_first_name),
          legal_last_name = COALESCE($5, legal_last_name),
          date_of_birth = COALESCE($6, date_of_birth),
          city = COALESCE($7, city),
          state_province = COALESCE($8, state_province),
          country = COALESCE($9, country),
          bio = COALESCE($10, bio),
          specialties = COALESCE($11, specialties),
          zip_code = COALESCE($12, zip_code),
          display_name = COALESCE($13, display_name),
          updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [req.user.id, account_type, stage_name, legal_first_name, legal_last_name,
         date_of_birth, city, state_province, country, bio, specialties || null,
         zip_code, display_name]
      );
    } else {
      result = await pool.query(
        `INSERT INTO user_profiles (user_id, account_type, stage_name, display_name, legal_first_name, legal_last_name,
          date_of_birth, city, state_province, country, zip_code, bio, specialties)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [req.user.id, account_type || 'buyer', stage_name, display_name, legal_first_name, legal_last_name,
         date_of_birth, city, state_province, country, zip_code, bio, specialties || null]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

app.post('/api/profile/upload-id', isAuthenticated, async (req, res) => {
  try {
    const { id_document, id_document_type } = req.body;

    if (!id_document) {
      return res.status(400).json({ error: 'No document provided' });
    }

    const existing = await pool.query(
      'SELECT id FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO user_profiles (user_id, id_document_url, id_document_type, verification_status)
         VALUES ($1, $2, $3, 'submitted')`,
        [req.user.id, id_document, id_document_type || 'government_id']
      );
    } else {
      await pool.query(
        `UPDATE user_profiles SET
          id_document_url = $2,
          id_document_type = $3,
          verification_status = 'submitted',
          updated_at = NOW()
         WHERE user_id = $1`,
        [req.user.id, id_document, id_document_type || 'government_id']
      );
    }

    res.json({ success: true, verification_status: 'submitted' });
  } catch (error) {
    console.error('Error uploading ID:', error);
    res.status(500).json({ error: 'Failed to upload ID document' });
  }
});

app.get('/api/attestation', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM creator_attestations WHERE user_id = $1 ORDER BY accepted_at DESC LIMIT 1',
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching attestation:', error);
    res.status(500).json({ error: 'Failed to fetch attestation' });
  }
});

app.post('/api/attestation', isAuthenticated, async (req, res) => {
  try {
    const { is_18_plus, owns_content_rights, services_comply_with_laws, no_third_party_without_consent } = req.body;

    if (!is_18_plus || !owns_content_rights || !services_comply_with_laws || !no_third_party_without_consent) {
      return res.status(400).json({ error: 'All attestation checkboxes must be accepted' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const version = 'v1';

    await pool.query(
      `INSERT INTO creator_attestations (user_id, attestation_version, is_18_plus, owns_content_rights, services_comply_with_laws, no_third_party_without_consent, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, attestation_version) DO UPDATE SET
         is_18_plus = $3, owns_content_rights = $4, services_comply_with_laws = $5, no_third_party_without_consent = $6,
         ip_address = $7, user_agent = $8, accepted_at = NOW()`,
      [req.user.id, version, is_18_plus, owns_content_rights, services_comply_with_laws, no_third_party_without_consent, ip, userAgent]
    );

    res.json({ success: true, version });
  } catch (error) {
    console.error('Error saving attestation:', error);
    res.status(500).json({ error: 'Failed to save attestation' });
  }
});

app.get('/api/creator-settings', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM creator_settings WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching creator settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/creator-settings', isAuthenticated, async (req, res) => {
  try {
    const { availability_days, availability_start_time, availability_end_time, cancellation_buffer_hours, require_booking_approval, auto_block_after_violations } = req.body;

    const existing = await pool.query('SELECT id FROM creator_settings WHERE user_id = $1', [req.user.id]);

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE creator_settings SET
          availability_days = COALESCE($2, availability_days),
          availability_start_time = COALESCE($3, availability_start_time),
          availability_end_time = COALESCE($4, availability_end_time),
          cancellation_buffer_hours = COALESCE($5, cancellation_buffer_hours),
          require_booking_approval = COALESCE($6, require_booking_approval),
          auto_block_after_violations = COALESCE($7, auto_block_after_violations),
          updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [req.user.id, availability_days, availability_start_time, availability_end_time,
         cancellation_buffer_hours, require_booking_approval, auto_block_after_violations]
      );
    } else {
      result = await pool.query(
        `INSERT INTO creator_settings (user_id, availability_days, availability_start_time, availability_end_time, cancellation_buffer_hours, require_booking_approval, auto_block_after_violations)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.user.id, availability_days || 'mon,tue,wed,thu,fri', availability_start_time || '10:00',
         availability_end_time || '18:00', cancellation_buffer_hours || 48,
         require_booking_approval || false, auto_block_after_violations || 0]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving creator settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.get('/api/creators/:name/settings', requireAgeVerification, async (req, res) => {
  try {
    const profile = await pool.query(
      'SELECT user_id FROM user_profiles WHERE stage_name = $1 AND account_type = $2',
      [req.params.name, 'creator']
    );
    if (profile.rows.length === 0) {
      return res.json(null);
    }
    const result = await pool.query(
      'SELECT availability_days, availability_start_time, availability_end_time, cancellation_buffer_hours, require_booking_approval FROM creator_settings WHERE user_id = $1',
      [profile.rows[0].user_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching creator settings:', error);
    res.status(500).json({ error: 'Failed to fetch creator settings' });
  }
});

// === Creator Onboarding Routes ===

app.get('/api/onboarding/status', isAuthenticated, async (req, res) => {
  try {
    const profile = await pool.query(
      'SELECT onboarding_stage, onboarding_score, service_risk_level, content_categories, stage_name, display_name, bio, date_of_birth, country, city, state_province, zip_code, account_type, verification_status, stripe_connect_account_id, stripe_onboarding_complete FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );
    const p = profile.rows[0] || {};

    const attestation = await pool.query(
      'SELECT id FROM creator_attestations WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );

    const services = await pool.query(
      'SELECT COUNT(*) as count FROM creator_services WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      stage: p.onboarding_stage || 0,
      score: p.onboarding_score || 0,
      riskLevel: p.service_risk_level || 'standard',
      hasAttestation: attestation.rows.length > 0,
      hasStripe: p.stripe_onboarding_complete || false,
      servicesCount: parseInt(services.rows[0].count),
      profile: p,
    });
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding status' });
  }
});

app.post('/api/onboarding/stage1', isAuthenticated, async (req, res) => {
  try {
    const { date_of_birth, country } = req.body;
    if (!date_of_birth || !country) {
      return res.status(400).json({ error: 'Date of birth and country are required' });
    }

    const dob = new Date(date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (age < 18) {
      return res.status(400).json({ error: 'You must be at least 18 years old' });
    }

    const existing = await pool.query('SELECT id, onboarding_stage FROM user_profiles WHERE user_id = $1', [req.user.id]);

    let result;
    if (existing.rows.length > 0) {
      const currentStage = existing.rows[0].onboarding_stage || 0;
      const newScore = currentStage < 1 ? 20 : null;
      result = await pool.query(
        `UPDATE user_profiles SET
          account_type = 'creator',
          date_of_birth = $2,
          country = $3,
          onboarding_stage = GREATEST(COALESCE(onboarding_stage, 0), 1),
          onboarding_score = CASE WHEN COALESCE(onboarding_stage, 0) < 1 THEN 20 ELSE onboarding_score END,
          updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [req.user.id, date_of_birth, country]
      );
    } else {
      result = await pool.query(
        `INSERT INTO user_profiles (user_id, account_type, date_of_birth, country, onboarding_stage, onboarding_score)
         VALUES ($1, 'creator', $2, $3, 1, 20)
         RETURNING *`,
        [req.user.id, date_of_birth, country]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving stage 1:', error);
    res.status(500).json({ error: 'Failed to save account basics' });
  }
});

app.post('/api/onboarding/stage2', isAuthenticated, async (req, res) => {
  try {
    const { stage_name, bio, display_name, content_categories, city, state_province, zip_code } = req.body;
    if (!stage_name || !bio) {
      return res.status(400).json({ error: 'Stage name and bio are required' });
    }

    if (stage_name.length > 50 || bio.length > 500) {
      return res.status(400).json({ error: 'Stage name max 50 chars, bio max 500 chars' });
    }

    const profile = await pool.query('SELECT onboarding_stage, account_type FROM user_profiles WHERE user_id = $1', [req.user.id]);
    if (profile.rows.length === 0 || (profile.rows[0].onboarding_stage || 0) < 1) {
      return res.status(400).json({ error: 'Complete stage 1 first' });
    }

    const duplicate = await pool.query(
      'SELECT id FROM user_profiles WHERE stage_name = $1 AND user_id != $2',
      [stage_name, req.user.id]
    );
    if (duplicate.rows.length > 0) {
      return res.status(400).json({ error: 'Stage name is already taken' });
    }

    const result = await pool.query(
      `UPDATE user_profiles SET
        stage_name = $2,
        bio = $3,
        display_name = COALESCE($4, display_name),
        content_categories = $5,
        city = COALESCE($6, city),
        state_province = COALESCE($7, state_province),
        zip_code = COALESCE($8, zip_code),
        onboarding_stage = GREATEST(COALESCE(onboarding_stage, 0), 2),
        onboarding_score = CASE WHEN COALESCE(onboarding_stage, 0) < 2 THEN 40 ELSE onboarding_score END,
        verification_status = 'submitted',
        updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [req.user.id, stage_name, bio, display_name || null, content_categories || null, city || null, state_province || null, zip_code || null]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Profile not found. Complete stage 1 first.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving stage 2:', error);
    res.status(500).json({ error: 'Failed to save profile setup' });
  }
});

app.post('/api/onboarding/stage3', isAuthenticated, async (req, res) => {
  try {
    const { is_18_plus, owns_content_rights, services_comply_with_laws, no_third_party_without_consent } = req.body;

    if (!is_18_plus || !owns_content_rights || !services_comply_with_laws || !no_third_party_without_consent) {
      return res.status(400).json({ error: 'All attestation checkboxes must be accepted' });
    }

    const profile = await pool.query('SELECT onboarding_stage FROM user_profiles WHERE user_id = $1', [req.user.id]);
    if (profile.rows.length === 0 || (profile.rows[0].onboarding_stage || 0) < 2) {
      return res.status(400).json({ error: 'Complete profile setup first' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const version = 'v1';

    await pool.query(
      `INSERT INTO creator_attestations (user_id, attestation_version, is_18_plus, owns_content_rights, services_comply_with_laws, no_third_party_without_consent, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, attestation_version) DO UPDATE SET
         is_18_plus = $3, owns_content_rights = $4, services_comply_with_laws = $5, no_third_party_without_consent = $6,
         ip_address = $7, user_agent = $8, accepted_at = NOW()`,
      [req.user.id, version, is_18_plus, owns_content_rights, services_comply_with_laws, no_third_party_without_consent, ip, userAgent]
    );

    await pool.query(
      `UPDATE user_profiles SET
        onboarding_stage = GREATEST(COALESCE(onboarding_stage, 0), 3),
        onboarding_score = CASE WHEN COALESCE(onboarding_stage, 0) < 3 THEN 60 ELSE onboarding_score END,
        updated_at = NOW()
       WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving stage 3:', error);
    res.status(500).json({ error: 'Failed to save attestation' });
  }
});

app.post('/api/onboarding/services', isAuthenticated, async (req, res) => {
  try {
    const { service_type, title, price, description } = req.body;
    if (!service_type || !title || price == null) {
      return res.status(400).json({ error: 'Service type, title, and price are required' });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 5.00 || parsedPrice > 10000) {
      return res.status(400).json({ error: 'Price must be between $5.00 and $10,000.00' });
    }

    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }

    if (description && description.length > 300) {
      return res.status(400).json({ error: 'Description must be 300 characters or less' });
    }

    const validTypes = ['custom-video', 'custom-photos', 'video-call', 'in-person'];
    if (!validTypes.includes(service_type)) {
      return res.status(400).json({ error: 'Invalid service type' });
    }

    const profile = await pool.query('SELECT onboarding_stage FROM user_profiles WHERE user_id = $1', [req.user.id]);
    if (profile.rows.length === 0 || (profile.rows[0].onboarding_stage || 0) < 3) {
      return res.status(400).json({ error: 'Complete attestation first' });
    }

    const riskLevel = service_type === 'in-person' ? 'elevated' : 'standard';
    const requiresApproval = service_type === 'in-person';

    const result = await pool.query(
      `INSERT INTO creator_services (user_id, service_type, title, description, price, risk_level, requires_approval)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, service_type, title.substring(0, 200), (description || '').substring(0, 300) || null, parsedPrice, riskLevel, requiresApproval]
    );

    const highestRisk = await pool.query(
      `SELECT CASE WHEN EXISTS(SELECT 1 FROM creator_services WHERE user_id = $1 AND risk_level = 'elevated') THEN 'elevated' ELSE 'standard' END as max_risk`,
      [req.user.id]
    );

    await pool.query(
      `UPDATE user_profiles SET
        onboarding_stage = GREATEST(COALESCE(onboarding_stage, 0), 4),
        onboarding_score = CASE WHEN COALESCE(onboarding_stage, 0) < 4 THEN 80 ELSE onboarding_score END,
        service_risk_level = $2,
        updated_at = NOW()
       WHERE user_id = $1`,
      [req.user.id, highestRisk.rows[0].max_risk]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving service:', error);
    res.status(500).json({ error: 'Failed to save service' });
  }
});

app.delete('/api/onboarding/services/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM creator_services WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

app.get('/api/onboarding/services', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM creator_services WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.post('/api/onboarding/stage5', isAuthenticated, async (req, res) => {
  try {
    const profile = await pool.query('SELECT onboarding_stage FROM user_profiles WHERE user_id = $1', [req.user.id]);
    if (profile.rows.length === 0 || (profile.rows[0].onboarding_stage || 0) < 4) {
      return res.status(400).json({ error: 'Complete service setup first' });
    }

    await pool.query(
      `UPDATE user_profiles SET
        onboarding_stage = GREATEST(COALESCE(onboarding_stage, 0), 5),
        onboarding_score = 100,
        updated_at = NOW()
       WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving stage 5:', error);
    res.status(500).json({ error: 'Failed to update payout stage' });
  }
});

app.use(express.static(path.join(__dirname)));

const SEVERITY_LEVELS = {
  off_platform: 'medium',
  harassment: 'high',
  coercion: 'severe',
  illegal_request: 'severe',
  threats: 'severe',
  spam: 'low',
};

const HARD_BLOCK_CATEGORIES = ['coercion', 'illegal_request', 'threats', 'harassment'];
const WARNINGS_BEFORE_BLOCK = 2;

function regexPreFilter(content) {
  const lower = content.toLowerCase();
  const patterns = [
    { regex: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, reason: "Phone number detected", category: "off_platform" },
    { regex: /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/, reason: "Phone number detected", category: "off_platform" },
    { regex: /\+\d{1,3}\s?\d{6,}/, reason: "Phone number detected", category: "off_platform" },
    { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, reason: "Email address detected", category: "off_platform" },
    { regex: /(?:https?:\/\/|www\.)[^\s]+/i, reason: "URL/link detected", category: "off_platform" },
    { regex: /@[a-zA-Z0-9_]{2,}/, reason: "Social media handle detected", category: "off_platform" },
  ];

  const keywords = [
    { terms: ["whatsapp", "telegram", "signal app", "kik me", "snapchat", "my snap", "add me on snap", "ig is", "my insta", "find me on"], reason: "Messaging/social media app reference", category: "off_platform" },
    { terms: ["text me", "call me", "dm me", "message me on", "hit me up on", "reach me at", "contact me at", "hmu on"], reason: "Off-platform contact attempt", category: "off_platform" },
    { terms: ["venmo me", "cashapp me", "paypal me", "zelle me", "send to my venmo", "send to my cashapp", "pay me directly", "pay outside"], reason: "Off-platform payment attempt", category: "off_platform" },
  ];

  for (const p of patterns) {
    if (p.regex.test(content)) {
      return { allowed: false, reason: p.reason, category: p.category, severity: SEVERITY_LEVELS[p.category] || 'medium' };
    }
  }

  for (const k of keywords) {
    for (const term of k.terms) {
      if (lower.includes(term)) {
        return { allowed: false, reason: k.reason, category: k.category, severity: SEVERITY_LEVELS[k.category] || 'medium' };
      }
    }
  }

  return null;
}

async function moderateMessage(content, senderName, senderType) {
  const regexResult = regexPreFilter(content);
  if (regexResult) {
    return regexResult;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are a content moderation system for an adult content creator marketplace. Detect policy violations across multiple categories.

VIOLATION CATEGORIES (use these exact category names):

1. "off_platform" — Attempts to take business off the platform:
   - Phone numbers (any format, including spelled out)
   - Email addresses (including disguised)
   - Social media handles or external messaging apps
   - Payment apps for direct payment (Venmo, CashApp, PayPal, Zelle)
   - URLs or links to personal websites/profiles
   - Coded language to share contact info

2. "harassment" — Hostile, abusive, or degrading behavior:
   - Insults, name-calling, or personal attacks
   - Unwanted sexual advances after being declined
   - Persistent unwanted contact or pressure
   - Discriminatory language based on protected characteristics

3. "coercion" — Attempts to pressure, manipulate, or force:
   - Threats to leave bad reviews unless demands are met
   - Pressuring someone to lower prices or do free work
   - Emotional manipulation or guilt-tripping
   - Blackmail or leverage threats
   - Pressuring to do something outside stated boundaries

4. "illegal_request" — Requests for illegal activities:
   - Requests involving minors in any capacity
   - Drug-related requests
   - Requests for non-consensual acts
   - Any clearly illegal activity

5. "threats" — Direct or implied threats:
   - Physical violence threats
   - Stalking behavior or language
   - Doxxing threats
   - Intimidation

ALLOW messages about:
- Service inquiries, pricing, scheduling on this platform
- Content requests and preferences within legal bounds
- In-person session logistics booked through this platform
- General friendly conversation
- Negotiation within platform boundaries

Respond with ONLY this exact JSON format:
{"allowed":true}
or
{"allowed":false,"reason":"brief reason","category":"category_name"}`
        },
        {
          role: "user",
          content: `Moderate this ${senderType} message: "${content}"`
        }
      ],
      max_completion_tokens: 150,
    });

    const result = response.choices[0]?.message?.content || '{"allowed": true}';
    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.allowed && parsed.category) {
        parsed.severity = SEVERITY_LEVELS[parsed.category] || 'medium';
      }
      return parsed;
    } catch {
      if (result.toLowerCase().includes('"allowed":false') || result.toLowerCase().includes('"allowed": false')) {
        return { allowed: false, reason: "Potential policy violation detected", category: "off_platform", severity: "medium" };
      }
      return { allowed: true };
    }
  } catch (error) {
    console.error('Moderation API error:', error.message);
    return { allowed: true };
  }
}

async function getUserWarningCount(userName) {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM user_warnings WHERE user_name = $1',
      [userName]
    );
    return parseInt(result.rows[0].count);
  } catch {
    return 0;
  }
}

async function addUserWarning(userName, conversationId, category, reason) {
  try {
    await pool.query(
      'INSERT INTO user_warnings (user_name, conversation_id, violation_category, violation_reason) VALUES ($1, $2, $3, $4)',
      [userName, conversationId, category, reason]
    );
  } catch (err) {
    console.error('Error adding warning:', err);
  }
}

app.post('/api/conversations', isAuthenticated, isVerifiedUser, requireAgeVerification, async (req, res) => {
  try {
    const { creatorName, buyerName, buyerEmail } = req.body;
    if (!creatorName || !buyerName) {
      return res.status(400).json({ error: 'Creator name and buyer name are required' });
    }

    const existing = await pool.query(
      'SELECT * FROM conversations WHERE creator_name = $1 AND buyer_name = $2',
      [creatorName, buyerName]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    const result = await pool.query(
      'INSERT INTO conversations (creator_name, buyer_name, buyer_email) VALUES ($1, $2, $3) RETURNING *',
      [creatorName, buyerName, buyerEmail || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.get('/api/conversations', isAuthenticated, isVerifiedUser, requireAgeVerification, async (req, res) => {
  try {
    const { user, role } = req.query;
    if (!user || !role) {
      return res.status(400).json({ error: 'User and role are required' });
    }

    let query;
    if (role === 'creator') {
      query = await pool.query(
        `SELECT c.*, 
          (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
          (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
         FROM conversations c WHERE c.creator_name = $1 ORDER BY c.updated_at DESC`,
        [user]
      );
    } else {
      query = await pool.query(
        `SELECT c.*, 
          (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
          (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
         FROM conversations c WHERE c.buyer_name = $1 ORDER BY c.updated_at DESC`,
        [user]
      );
    }

    res.json(query.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversations/:id/messages', isAuthenticated, isVerifiedUser, requireAgeVerification, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/conversations/:id/messages', isAuthenticated, isVerifiedUser, requireAgeVerification, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, senderType, senderName } = req.body;

    if (!content || !senderType || !senderName) {
      return res.status(400).json({ error: 'Content, senderType, and senderName are required' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Message is too long. Maximum 2000 characters.' });
    }

    const conv = await pool.query('SELECT creator_name, buyer_name FROM conversations WHERE id = $1', [id]);
    if (conv.rows.length > 0) {
      const creatorName = conv.rows[0].creator_name;
      const isBuyer = senderName === conv.rows[0].buyer_name;

      if (isBuyer) {
        const creatorProfile = await pool.query(
          'SELECT user_id FROM user_profiles WHERE stage_name = $1 AND account_type = $2',
          [creatorName, 'creator']
        );

        if (creatorProfile.rows.length > 0) {
          const settings = await pool.query(
            'SELECT auto_block_after_violations FROM creator_settings WHERE user_id = $1',
            [creatorProfile.rows[0].user_id]
          );

          if (settings.rows.length > 0 && settings.rows[0].auto_block_after_violations > 0) {
            const threshold = settings.rows[0].auto_block_after_violations;
            const senderWarnings = await getUserWarningCount(senderName);
            if (senderWarnings >= threshold) {
              return res.status(403).json({
                error: 'You have been blocked from messaging this creator due to repeated policy violations.',
                warning: 'Your message history with this creator has been restricted.',
                action: 'auto_blocked'
              });
            }
          }
        }
      }
    }

    const moderation = await moderateMessage(content, senderName, senderType);

    if (!moderation.allowed) {
      const category = moderation.category || 'off_platform';
      const severity = moderation.severity || SEVERITY_LEVELS[category] || 'medium';
      const isSevere = HARD_BLOCK_CATEGORIES.includes(category) || severity === 'severe';
      const warningCount = await getUserWarningCount(senderName);

      await pool.query(
        'INSERT INTO moderation_logs (conversation_id, message_content, sender_type, sender_name, violation_type, action_taken, violation_category, severity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, content, senderType, senderName, moderation.reason, isSevere || warningCount >= WARNINGS_BEFORE_BLOCK ? 'blocked' : 'warned', category, severity]
      );

      if (isSevere) {
        await addUserWarning(senderName, parseInt(id), category, moderation.reason);
        return res.status(403).json({
          error: 'Message blocked by moderation',
          reason: moderation.reason,
          category: category,
          action: 'blocked',
          warning: 'This message has been blocked due to a serious policy violation. Continued violations will result in account suspension.'
        });
      }

      if (warningCount >= WARNINGS_BEFORE_BLOCK) {
        await addUserWarning(senderName, parseInt(id), category, moderation.reason);
        return res.status(403).json({
          error: 'Message blocked by moderation',
          reason: moderation.reason,
          category: category,
          action: 'blocked',
          warning: `You have received multiple warnings. This message has been blocked. Please review our community guidelines.`
        });
      }

      await addUserWarning(senderName, parseInt(id), category, moderation.reason);

      const result = await pool.query(
        'INSERT INTO messages (conversation_id, sender_type, sender_name, content) VALUES ($1, $2, $3, $4) RETURNING *',
        [id, senderType, senderName, content]
      );

      await pool.query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      return res.status(201).json({
        ...result.rows[0],
        softWarning: true,
        warningMessage: `Heads up: Your message may violate our guidelines (${moderation.reason}). This is warning ${warningCount + 1} of ${WARNINGS_BEFORE_BLOCK}. After ${WARNINGS_BEFORE_BLOCK} warnings, messages will be blocked.`,
        warningCategory: category,
        warningsRemaining: WARNINGS_BEFORE_BLOCK - warningCount - 1
      });
    }

    const result = await pool.query(
      'INSERT INTO messages (conversation_id, sender_type, sender_name, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, senderType, senderName, content]
    );

    await pool.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.get('/api/moderation-logs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM moderation_logs ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching moderation logs:', error);
    res.status(500).json({ error: 'Failed to fetch moderation logs' });
  }
});

app.post('/api/messages/:messageId/report', isAuthenticated, isVerifiedUser, requireAgeVerification, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { reason, details, reporterName, reporterRole } = req.body;

    if (!reason || !reporterName) {
      return res.status(400).json({ error: 'Reason and reporter name are required' });
    }

    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const msg = msgResult.rows[0];

    const existing = await pool.query(
      'SELECT id FROM message_reports WHERE message_id = $1 AND reporter_name = $2',
      [messageId, reporterName]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You have already reported this message' });
    }

    await pool.query(
      'INSERT INTO message_reports (message_id, conversation_id, reporter_name, reporter_role, reported_user_name, reason, details) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [messageId, msg.conversation_id, reporterName, reporterRole || 'unknown', msg.sender_name, reason, details || null]
    );

    await pool.query(
      'INSERT INTO moderation_logs (conversation_id, message_content, sender_type, sender_name, violation_type, action_taken, violation_category, severity) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [msg.conversation_id, msg.content, msg.sender_type, msg.sender_name, `User report: ${reason}`, 'reported', 'user_report', 'medium']
    );

    res.json({ success: true, message: 'Report submitted. Our team will review it.' });
  } catch (error) {
    console.error('Error reporting message:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

app.get('/api/admin/reports', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM message_reports ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

app.get('/api/stripe/publishable-key', async (req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch (error) {
    console.error('Error getting publishable key:', error);
    res.status(500).json({ error: 'Stripe not configured' });
  }
});

app.post('/api/booking-disclaimer', isAuthenticated, isVerifiedUser, requireAgeVerification, async (req, res) => {
  try {
    const { serviceType, creatorName, bookingRef } = req.body;
    if (!serviceType || !creatorName) {
      return res.status(400).json({ error: 'Service type and creator name are required' });
    }
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    await pool.query(
      'INSERT INTO booking_disclaimers (user_id, booking_ref, service_type, creator_name, disclaimer_version, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.id, bookingRef || null, serviceType, creatorName, 'v1', ip]
    );
    res.json({ success: true, disclaimer_version: 'v1' });
  } catch (error) {
    console.error('Error logging booking disclaimer:', error);
    res.status(500).json({ error: 'Failed to log disclaimer acceptance' });
  }
});

app.get('/api/platform-settings/:key', async (req, res) => {
  try {
    const result = await pool.query('SELECT value FROM platform_settings WHERE key = $1', [req.params.key]);
    if (result.rows.length === 0) {
      return res.json({ value: null });
    }
    res.json({ value: result.rows[0].value });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

app.post('/api/admin/platform-settings', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Setting key is required' });

    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3`,
      [key, value, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating platform setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

app.post('/api/stripe/checkout', isAuthenticated, isVerifiedUser, requireAgeVerification, async (req, res) => {
  try {
    const { serviceName, creatorName, amount, description, sessionDetails, serviceType } = req.body;
    const stripe = await getStripeClient();
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const isTimeBased = serviceType === 'in-person';

    if (isTimeBased) {
      const killSwitch = await pool.query("SELECT value FROM platform_settings WHERE key = 'pause_availability_bookings'");
      if (killSwitch.rows.length > 0 && killSwitch.rows[0].value === 'true') {
        return res.status(403).json({ error: 'Availability bookings are temporarily paused. Please try again later.' });
      }

      const disclaimerCheck = await pool.query(
        'SELECT id FROM booking_disclaimers WHERE user_id = $1 AND creator_name = $2 AND accepted_at > NOW() - INTERVAL \'24 hours\'',
        [req.user.id, creatorName]
      );
      if (disclaimerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'You must accept the booking disclaimer before proceeding.' });
      }
    }

    const creatorProfile = await pool.query(
      'SELECT user_id, stripe_connect_account_id, stripe_onboarding_complete FROM user_profiles WHERE stage_name = $1 AND account_type = $2',
      [creatorName, 'creator']
    );

    if (creatorProfile.rows.length > 0) {
      const creatorUserId = creatorProfile.rows[0].user_id;
      const attestation = await pool.query(
        'SELECT id FROM creator_attestations WHERE user_id = $1 AND is_18_plus = true AND has_content_rights = true AND agrees_legal_compliance = true AND agrees_consent_practices = true',
        [creatorUserId]
      );
      if (attestation.rows.length === 0) {
        return res.status(403).json({ error: 'This creator has not completed required legal attestations. Payment cannot be processed.' });
      }

      const profileCheck = await pool.query(
        'SELECT legal_first_name, legal_last_name, date_of_birth, location FROM user_profiles WHERE user_id = $1',
        [creatorUserId]
      );
      if (profileCheck.rows.length === 0 || !profileCheck.rows[0].legal_first_name || !profileCheck.rows[0].date_of_birth) {
        return res.status(403).json({ error: 'This creator has not completed identity verification. Payment cannot be processed.' });
      }
    }

    const platformFee = Math.round(amount * 0.15);
    const bookingRef = `bk_${Date.now()}`;

    const neutralServiceName = serviceName
      .replace(/\b(sex|sexual|nude|naked|explicit)\b/gi, 'custom')
      .replace(/\b(escort|escorting)\b/gi, 'appearance');
    const neutralDescription = (description || `Service booking from ${creatorName}`)
      .replace(/\b(sex|sexual|nude|naked|explicit)\b/gi, 'custom')
      .replace(/\b(escort|escorting)\b/gi, 'appearance');

    const metadata = {
      creator_name: creatorName,
      buyer_id: req.user.id,
      booking_ref: bookingRef,
    };

    if (isTimeBased) {
      metadata.service_type = 'time_based_booking';
      if (sessionDetails && sessionDetails.city) {
        metadata.city = sessionDetails.city;
      }
      if (sessionDetails && sessionDetails.duration) {
        metadata.duration_minutes = String(sessionDetails.duration);
      }
    } else {
      metadata.service_type = 'digital_service';
    }

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amount),
          product_data: {
            name: neutralServiceName,
            description: neutralDescription,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/creators.html?creator=${encodeURIComponent(creatorName)}&payment=success`,
      cancel_url: `${baseUrl}/creators.html?creator=${encodeURIComponent(creatorName)}&payment=cancelled`,
      metadata,
    };

    if (creatorProfile.rows.length > 0 && creatorProfile.rows[0].stripe_connect_account_id && creatorProfile.rows[0].stripe_onboarding_complete) {
      sessionParams.payment_intent_data = {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: creatorProfile.rows[0].stripe_connect_account_id,
        },
      };
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: checkoutSession.url, bookingRef });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.post('/api/stripe/connect-onboarding', isAuthenticated, async (req, res) => {
  try {
    const stripe = await getStripeClient();
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const profile = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (profile.rows.length === 0 || profile.rows[0].account_type !== 'creator') {
      return res.status(400).json({ error: 'Only creators can set up payment receiving' });
    }

    if (!profile.rows[0].verification_status || !['submitted', 'verified'].includes(profile.rows[0].verification_status)) {
      return res.status(400).json({ error: 'You must complete identity verification before setting up payments' });
    }

    const attestation = await pool.query(
      'SELECT id FROM creator_attestations WHERE user_id = $1 AND is_18_plus = true AND owns_content_rights = true AND services_comply_with_laws = true AND no_third_party_without_consent = true',
      [req.user.id]
    );
    if (attestation.rows.length === 0) {
      return res.status(400).json({ error: 'You must complete the legal self-attestation before setting up payments' });
    }

    let accountId = profile.rows[0].stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: req.user.email,
        settings: {
          payouts: {
            schedule: {
              delay_days: 3,
              interval: 'daily',
            },
          },
        },
        metadata: {
          user_id: req.user.id,
          platform_creator_ref: profile.rows[0].stage_name,
        },
      });
      accountId = account.id;

      await pool.query(
        'UPDATE user_profiles SET stripe_connect_account_id = $2, updated_at = NOW() WHERE user_id = $1',
        [req.user.id, accountId]
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/creator-onboarding.html?stripe=refresh`,
      return_url: `${baseUrl}/creator-onboarding.html?stripe=complete`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('Error creating Connect onboarding:', error);
    res.status(500).json({ error: 'Failed to start payment setup' });
  }
});

app.get('/api/stripe/connect-status', isAuthenticated, async (req, res) => {
  try {
    const profile = await pool.query(
      'SELECT stripe_connect_account_id, stripe_onboarding_complete FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (profile.rows.length === 0 || !profile.rows[0].stripe_connect_account_id) {
      return res.json({ connected: false, onboarding_complete: false });
    }

    const stripe = await getStripeClient();
    const account = await stripe.accounts.retrieve(profile.rows[0].stripe_connect_account_id);

    const isComplete = account.charges_enabled && account.payouts_enabled;

    if (isComplete && !profile.rows[0].stripe_onboarding_complete) {
      await pool.query(
        'UPDATE user_profiles SET stripe_onboarding_complete = true, updated_at = NOW() WHERE user_id = $1',
        [req.user.id]
      );
    }

    res.json({
      connected: true,
      onboarding_complete: isComplete,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    });
  } catch (error) {
    console.error('Error checking Connect status:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

async function initStripe() {
  try {
    const { runMigrations } = await import('stripe-replit-sync');
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl: process.env.DATABASE_URL });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();
    const webhookBaseUrl = `https://${(process.env.REPLIT_DOMAINS || '').split(',')[0]}`;
    if (webhookBaseUrl !== 'https://') {
      const { webhook } = await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
      console.log('Stripe webhook configured');
    }

    stripeSync.syncBackfill().then(() => {
      console.log('Stripe data synced');
    }).catch((err) => {
      console.error('Stripe backfill error:', err.message);
    });
  } catch (error) {
    console.error('Stripe initialization error:', error.message);
  }
}

async function startServer() {
  try {
    await setupAuth();
    console.log('Auth setup complete');
  } catch (err) {
    console.error('Auth setup failed:', err.message);
  }

  try {
    await initStripe();
  } catch (err) {
    console.error('Stripe setup failed:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
