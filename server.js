const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const OpenAI = require('openai');

const app = express();
const PORT = 5000;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const openai = new OpenAI.default({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

app.post('/api/conversations', async (req, res) => {
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

app.get('/api/conversations', async (req, res) => {
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

app.get('/api/conversations/:id/messages', async (req, res) => {
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

app.post('/api/conversations/:id/messages', async (req, res) => {
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

app.get('/signup.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/chat.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'chat.html'));
});

app.get('/messaging.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'messaging.html'));
});

app.get('/creators.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'creators.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
