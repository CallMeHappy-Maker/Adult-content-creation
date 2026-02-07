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

  passport.use(strategy);
}

const ALLOWED_REDIRECTS = ['/', '/signup.html', '/client-signup.html', '/verify.html', '/creators.html', '/chat.html', '/admin.html'];
const ALLOWED_ACCOUNT_TYPES = ['creator', 'buyer'];

app.get('/api/login', (req, res, next) => {
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

app.get('/api/callback',
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
          `INSERT INTO profiles (user_id, account_type, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             account_type = COALESCE(profiles.account_type, EXCLUDED.account_type),
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

app.get('/api/creators', async (req, res) => {
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

app.get('/api/creators/:name', async (req, res) => {
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

app.use(express.static(path.join(__dirname)));

function regexPreFilter(content) {
  const lower = content.toLowerCase();
  const patterns = [
    { regex: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, reason: "Phone number detected" },
    { regex: /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/, reason: "Phone number detected" },
    { regex: /\+\d{1,3}\s?\d{6,}/, reason: "Phone number detected" },
    { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, reason: "Email address detected" },
    { regex: /(?:https?:\/\/|www\.)[^\s]+/i, reason: "URL/link detected" },
    { regex: /@[a-zA-Z0-9_]{2,}/, reason: "Social media handle detected" },
  ];

  const keywords = [
    { terms: ["whatsapp", "telegram", "signal app", "kik me", "snapchat", "my snap", "add me on snap", "ig is", "my insta", "find me on"], reason: "Messaging/social media app reference" },
    { terms: ["text me", "call me", "dm me", "message me on", "hit me up on", "reach me at", "contact me at", "hmu on"], reason: "Off-platform contact attempt" },
    { terms: ["venmo me", "cashapp me", "paypal me", "zelle me", "send to my venmo", "send to my cashapp", "pay me directly", "pay outside"], reason: "Off-platform payment attempt" },
  ];

  for (const p of patterns) {
    if (p.regex.test(content)) {
      return { allowed: false, reason: p.reason };
    }
  }

  for (const k of keywords) {
    for (const term of k.terms) {
      if (lower.includes(term)) {
        return { allowed: false, reason: k.reason };
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
          content: `You are a strict content moderation system for an adult content creator marketplace. Your ONLY job is to detect and BLOCK any attempt to take business OFF the platform.

You MUST block messages containing:
- Phone numbers in ANY format (including spelled out like "five five five")
- Email addresses (including disguised like "user at gmail dot com")
- Social media handles or usernames
- References to external messaging apps (WhatsApp, Telegram, Signal, Kik, Snapchat, Instagram DMs, etc.)
- Payment apps for direct payment (Venmo, CashApp, PayPal, Zelle)
- Any invitation to communicate or transact outside this platform
- URLs or links to personal websites/profiles
- Coded language clearly intended to share contact info

ALLOW messages about:
- Service inquiries, pricing, scheduling on this platform
- Content requests and preferences
- In-person session logistics booked through this platform
- General friendly conversation

Respond with ONLY this exact JSON format, nothing else:
{"allowed":true}
or
{"allowed":false,"reason":"brief reason"}`
        },
        {
          role: "user",
          content: `Moderate this ${senderType} message: "${content}"`
        }
      ],
      max_completion_tokens: 100,
    });

    const result = response.choices[0]?.message?.content || '{"allowed": true}';
    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      if (result.toLowerCase().includes('"allowed":false') || result.toLowerCase().includes('"allowed": false')) {
        return { allowed: false, reason: "Potential policy violation detected" };
      }
      return { allowed: true };
    }
  } catch (error) {
    console.error('Moderation API error:', error.message);
    return { allowed: true };
  }
}

app.post('/api/conversations', isAuthenticated, isVerifiedUser, async (req, res) => {
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

app.get('/api/conversations', isAuthenticated, isVerifiedUser, async (req, res) => {
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

app.get('/api/conversations/:id/messages', isAuthenticated, isVerifiedUser, async (req, res) => {
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

app.post('/api/conversations/:id/messages', isAuthenticated, isVerifiedUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, senderType, senderName } = req.body;

    if (!content || !senderType || !senderName) {
      return res.status(400).json({ error: 'Content, senderType, and senderName are required' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Message is too long. Maximum 2000 characters.' });
    }

    const moderation = await moderateMessage(content, senderName, senderType);

    if (!moderation.allowed) {
      await pool.query(
        'INSERT INTO moderation_logs (conversation_id, message_content, sender_type, sender_name, violation_type, action_taken) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, content, senderType, senderName, moderation.reason, 'blocked']
      );

      return res.status(403).json({
        error: 'Message blocked by moderation',
        reason: moderation.reason,
        warning: 'Sharing contact information or attempting to take business off-platform is not allowed. Repeated violations may result in account restrictions.'
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

app.get('/api/stripe/publishable-key', async (req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch (error) {
    console.error('Error getting publishable key:', error);
    res.status(500).json({ error: 'Stripe not configured' });
  }
});

app.post('/api/stripe/checkout', isAuthenticated, isVerifiedUser, async (req, res) => {
  try {
    const { serviceName, creatorName, amount, description, sessionDetails } = req.body;
    const stripe = await getStripeClient();
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const creatorProfile = await pool.query(
      'SELECT stripe_connect_account_id, stripe_onboarding_complete FROM user_profiles WHERE stage_name = $1 AND account_type = $2',
      [creatorName, 'creator']
    );

    const platformFee = Math.round(amount * 0.15);

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amount),
          product_data: {
            name: serviceName,
            description: description || `Service from ${creatorName}`,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/creators.html?creator=${encodeURIComponent(creatorName)}&payment=success`,
      cancel_url: `${baseUrl}/creators.html?creator=${encodeURIComponent(creatorName)}&payment=cancelled`,
      metadata: {
        creator_name: creatorName,
        buyer_id: req.user.id,
        service_name: serviceName,
        session_details: sessionDetails ? JSON.stringify(sessionDetails) : null,
      },
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
    res.json({ url: checkoutSession.url });
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

    let accountId = profile.rows[0].stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: req.user.email,
        metadata: {
          user_id: req.user.id,
          stage_name: profile.rows[0].stage_name,
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
      refresh_url: `${baseUrl}/verify.html?stripe=refresh`,
      return_url: `${baseUrl}/verify.html?stripe=complete`,
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
