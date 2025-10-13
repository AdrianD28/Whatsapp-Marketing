import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Blob } from 'buffer';
import { getDb, getAccountKeyFromReq, ObjectId } from './db.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();
const port = process.env.PORT || 5174;

const staticDir = process.env.STATIC_DIR || path.join(process.cwd(), 'server', 'static');
if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, staticDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${unique}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// JSON body for webhooks/APIs
app.use(express.json({ limit: '2mb' }));

// Security headers
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));

// Trust proxy if behind reverse proxy (e.g., EasyPanel/NGINX)
app.set('trust proxy', 1);

// --- Rate limiting (simplificado) ---
// Eliminamos límite para /api/auth para evitar 429 en login repetido.
// Puedes reactivar en producción usando ENABLE_RATE_LIMIT=1.
const ENABLE_RATE_LIMIT = process.env.ENABLE_RATE_LIMIT === '1';
if (ENABLE_RATE_LIMIT) {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
  const maxReq = Number(process.env.RATE_LIMIT_MAX || 1000);
  const apiLimiter = rateLimit({ windowMs, max: maxReq, standardHeaders: true, legacyHeaders: false });
  const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 8000, standardHeaders: true, legacyHeaders: false });
  app.use('/api', apiLimiter);
  app.use('/webhook', webhookLimiter);
} else {
  console.warn('[rate-limit] Desactivado (ENABLE_RATE_LIMIT no es 1)');
}

app.use('/static', express.static(staticDir));

// --- WhatsApp Webhook (verification + status logging) ---
const webhookLog = [];
app.get('/webhook/whatsapp', (req, res) => {
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'changeme';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
});
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const body = req.body || {};
    const db = await getDb();
    // Log minimal info about statuses
    const entries = body.entry || [];
    for (const e of entries) {
      const changes = e.changes || [];
      for (const c of changes) {
        const v = c.value || {};
        const statuses = v.statuses || [];
        for (const s of statuses) {
          webhookLog.push({
            time: new Date().toISOString(),
            id: s.id,
            status: s.status,
            recipient: s.recipient_id,
            errors: s.errors,
            biz: v.metadata?.display_phone_number,
          });
          // Persistir por messageId cuando sea posible; el id es el messageId
          try {
            const messageId = s.id;
            if (messageId) {
              // No conocemos el userId desde el webhook sin verificar; intentamos encontrar por send_logs
              const logDoc = await db.collection('send_logs').findOne({ messageId });
              if (logDoc?.userId) {
                const userIdObj = logDoc.userId;
                const update = {
                  status: s.status,
                  updatedAt: new Date().toISOString(),
                  lastRecipient: s.recipient_id,
                  error: Array.isArray(s.errors) && s.errors.length ? s.errors[0] : undefined,
                };
                await db.collection('message_events').updateOne(
                  { userId: userIdObj, messageId },
                  { $set: update, $setOnInsert: { createdAt: new Date().toISOString(), batchId: logDoc.batchId || null } },
                  { upsert: true }
                );
              }
            }
          } catch (perr) {
            console.warn('webhook persist failed', perr);
          }
        }
      }
    }
    // Keep last 200
    if (webhookLog.length > 200) webhookLog.splice(0, webhookLog.length - 200);
    return res.sendStatus(200);
  } catch (err) {
    return res.sendStatus(200);
  }
});
app.get('/webhook/log', (req, res) => {
  res.json(webhookLog.slice(-100));
});

// Serve frontend `dist` if it exists (SPA fallback to index.html)
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    // If request is for API routes, skip
    if (req.path.startsWith('/api') || req.path.startsWith('/upload') || req.path.startsWith('/resumable-upload') || req.path.startsWith('/upload-media') || req.path.startsWith('/create-template') || req.path.startsWith('/static') || req.path.startsWith('/webhook')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const url = `${req.protocol}://${req.get('host')}/static/${encodeURIComponent(req.file.filename)}`;
  res.json({ url });
});

// Resumable upload to Meta Graph API: expects headers x-app-id and x-access-token
app.post('/resumable-upload', upload.single('file'), async (req, res) => {
  try {
    const appId = req.headers['x-app-id'] || req.body.appId;
    const token = req.headers['x-access-token'] || req.body.accessToken;
    if (!appId || !token) return res.status(400).json({ error: 'appId and accessToken required in headers or body' });
    if (!req.file) return res.status(400).json({ error: 'file required' });

    const filePath = req.file.path;
    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;
    const fileName = req.file.originalname;
    const fileType = req.file.mimetype || 'application/octet-stream';

  const initUrl = `https://graph.facebook.com/v22.0/${appId}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${fileSize}&file_type=${encodeURIComponent(fileType)}`;
    const initRes = await fetch(initUrl, { method: 'POST', headers: { Authorization: `OAuth ${token}` } });
    if (!initRes.ok) {
      const text = await initRes.text().catch(() => '');
      return res.status(500).json({ error: 'init failed', detail: text });
    }
    const initJson = await initRes.json();
    // upload session id might be in initJson.id or initJson.upload_session_id
    const uploadId = initJson.id || initJson.upload_session_id;
    if (!uploadId) return res.status(500).json({ error: 'no upload id returned', initJson });

  const uploadUrl = `https://graph.facebook.com/v22.0/${uploadId}`;
    const fileBuffer = await fs.promises.readFile(filePath);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, file_offset: '0', 'Content-Type': 'application/octet-stream' },
      body: fileBuffer,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => '');
      return res.status(500).json({ error: 'upload failed', detail: text });
    }
    const upJson = await uploadRes.json();
    if (!upJson.h) return res.status(500).json({ error: 'no handle returned', upJson });
    return res.json({ handle: upJson.h });
  } catch (err) {
    console.error('resumable-upload error', err);
    return res.status(500).json({ error: 'server error', detail: String(err) });
  }
});

// Proxy upload to /{phone_number_id}/media. Expects headers x-phone-number-id and x-access-token or body fields.
app.post('/upload-media', upload.single('file'), async (req, res) => {
  try {
    const phoneNumberId = req.headers['x-phone-number-id'] || req.body.phoneNumberId || process.env.PHONE_NUMBER_ID;
    const token = req.headers['x-access-token'] || req.body.accessToken || process.env.ACCESS_TOKEN;
    if (!phoneNumberId || !token) return res.status(400).json({ error: 'phoneNumberId and accessToken required' });
    if (!req.file) return res.status(400).json({ error: 'file required' });

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    // Adjuntar como Blob para compatibilidad total con fetch/undici
    const buffer = await fs.promises.readFile(req.file.path);
    const mime = req.file.mimetype || 'application/octet-stream';
    const blob = new Blob([buffer], { type: mime });
    form.append('file', blob, req.file.originalname);

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/media`;
    const fetchRes = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => '');
      let detail;
      try { detail = JSON.parse(text); } catch { detail = text; }
      return res.status(fetchRes.status).json({ error: 'media upload failed', status: fetchRes.status, detail });
    }
    const json = await fetchRes.json();
    return res.json(json);
  } catch (err) {
    console.error('upload-media error', err);
    return res.status(500).json({ error: 'server error', detail: String(err) });
  }
});

app.get('/', (req, res) => res.send('Static upload server running'));

// Health & version endpoints
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/version', (req, res) => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return res.json({ version: pkg.version, time: new Date().toISOString() });
  } catch {
    return res.json({ version: 'unknown', time: new Date().toISOString() });
  }
});

// Env check (no expone valores, solo si están presentes)
app.get('/env-check', (req, res) => {
  const present = (v) => (typeof v === 'string' && v.length > 0);
  res.json({
    PORT: present(process.env.PORT),
    APP_ID: present(process.env.APP_ID),
    ACCESS_TOKEN: present(process.env.ACCESS_TOKEN),
    PHONE_NUMBER_ID: present(process.env.PHONE_NUMBER_ID),
    BUSINESS_ACCOUNT_ID: present(process.env.BUSINESS_ACCOUNT_ID),
    WEBHOOK_VERIFY_TOKEN: present(process.env.WEBHOOK_VERIFY_TOKEN),
    STATIC_DIR: present(process.env.STATIC_DIR) ? process.env.STATIC_DIR : '(default /app/server/static)'
  });
});

// --- MongoDB-backed API ---
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDb();
    const ok = await db.command({ ping: 1 });
    res.json({ ok: true, mongo: ok.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'db_unavailable' });
  }
});

// --- Auth helpers ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `s1$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 's1') return false;
  const [, salt, hash] = parts;
  const verify = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
  } catch {
    return false;
  }
}
async function createAuthToken(db, userId, days = 30) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await db.collection('auth_tokens').insertOne({ token, userId: new ObjectId(userId), createdAt: now.toISOString(), expiresAt });
  return token;
}
async function getUserFromAuth(req) {
  const auth = req.headers['authorization'];
  if (!auth || typeof auth !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  const token = m[1];
  const db = await getDb();
  const t = await db.collection('auth_tokens').findOne({ token });
  if (!t) return null;
  if (t.expiresAt && new Date(t.expiresAt) <= new Date()) return null;
  const user = await db.collection('users').findOne({ _id: t.userId });
  if (!user) return null;
  return { id: String(user._id), email: user.email, name: user.name || null };
}

// Middleware de autorización: token de usuario o compatibilidad con X-Account-Key
async function requireAuth(req, res, next) {
  const user = await getUserFromAuth(req);
  if (user) {
    req.userId = user.id;
    req.user = user;
    return next();
  }
  // Fallback legacy
  const key = getAccountKeyFromReq(req);
  if (!key) return res.status(401).json({ error: 'auth_required', hint: 'Authorization: Bearer <token> o X-Account-Key' });
  req.accountKey = String(key);
  return next();
}

// Middleware que exige usuario (sin fallback a accountKey)
async function requireUser(req, res, next) {
  const user = await getUserFromAuth(req);
  if (user) {
    req.userId = user.id;
    req.user = user;
    return next();
  }
  return res.status(401).json({ error: 'auth_required', hint: 'Authorization: Bearer <token>' });
}

// --- Auth endpoints ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const db = await getDb();
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)) return res.status(400).json({ error: 'invalid_email' });
    if (String(password).length < 6) return res.status(400).json({ error: 'weak_password', hint: 'min 6 chars' });
    const exists = await db.collection('users').findOne({ email: emailNorm });
    if (exists) return res.status(409).json({ error: 'email_taken' });
    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();
    const r = await db.collection('users').insertOne({ email: emailNorm, name: name?.trim() || null, passwordHash, createdAt: now, updatedAt: now });
    const token = await createAuthToken(db, r.insertedId);
    return res.json({ token, user: { id: String(r.insertedId), email: emailNorm, name: name?.trim() || null } });
  } catch (err) {
    console.error('/api/auth/register error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const db = await getDb();
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
    const emailNorm = String(email).trim().toLowerCase();
    const user = await db.collection('users').findOne({ email: emailNorm });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    if (!verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'invalid_credentials' });
    const token = await createAuthToken(db, user._id);
    return res.json({ token, user: { id: String(user._id), email: user.email, name: user.name || null } });
  } catch (err) {
    console.error('/api/auth/login error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/auth/logout', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const auth = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(String(auth));
    if (!m) return res.json({ ok: true });
    await db.collection('auth_tokens').deleteOne({ token: m[1] });
    return res.json({ ok: true });
  } catch (err) {
    return res.json({ ok: true });
  }
});

app.get('/api/auth/me', requireUser, async (req, res) => {
  return res.json({ user: req.user });
});

// --- User Meta Credentials (plaintext as requested) ---
app.get('/api/user/meta-credentials', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) }, { projection: { metaCreds: 1 } });
    const metaCreds = user?.metaCreds || null;
    if (metaCreds && metaCreds.phoneNumberId && metaCreds.businessAccountId) {
      // Migración automática de datos legacy (accountKey -> userId)
      const legacyKey = `${metaCreds.phoneNumberId}:${metaCreds.businessAccountId}`;
      const userIdObj = new ObjectId(req.userId);
      try {
        const ops = ['lists','contacts','activities','sessions'];
        for (const c of ops) {
          await db.collection(c).updateMany({ accountKey: legacyKey, userId: { $exists: false } }, { $set: { userId: userIdObj } });
        }
      } catch (mErr) {
        console.warn('legacy migration (GET) failed', mErr);
      }
    }
    return res.json({ metaCreds });
  } catch (err) {
    console.error('/api/user/meta-credentials GET error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

app.put('/api/user/meta-credentials', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const { accessToken, phoneNumberId, businessAccountId, appId } = req.body || {};
    // Validaciones mínimas (permite campos vacíos si el usuario quiere guardar parcialmente)
    const metaCreds = {
      accessToken: typeof accessToken === 'string' ? accessToken : '',
      phoneNumberId: typeof phoneNumberId === 'string' ? phoneNumberId : '',
      businessAccountId: typeof businessAccountId === 'string' ? businessAccountId : '',
      appId: typeof appId === 'string' ? appId : undefined,
    };
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      { $set: { metaCreds, updatedAt: new Date().toISOString() } }
    );
    // Migrar datos legacy basados en accountKey (phoneNumberId:businessAccountId) -> userId
    if (metaCreds.phoneNumberId && metaCreds.businessAccountId) {
      const legacyKey = `${metaCreds.phoneNumberId}:${metaCreds.businessAccountId}`;
      const userIdObj = new ObjectId(req.userId);
      try {
        const ops = ['lists','contacts','activities','sessions'];
        const migrated = {};
        for (const c of ops) {
          const r = await db.collection(c).updateMany({ accountKey: legacyKey, userId: { $exists: false } }, { $set: { userId: userIdObj } });
          migrated[c] = r.modifiedCount;
        }
        // Opcional: limpiar accountKey en listas ya migradas para evitar que el índice parcial interfiera
        await db.collection('lists').updateMany({ userId: userIdObj, accountKey: { $exists: true } }, { $unset: { accountKey: '' } });
        return res.json({ ok: true, metaCreds, migrated });
      } catch (mErr) {
        console.warn('legacy migration (PUT) failed', mErr);
      }
    }
    return res.json({ ok: true, metaCreds });
  } catch (err) {
    console.error('/api/user/meta-credentials PUT error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

function isValidObjectId(id) {
  try { new ObjectId(id); return true; } catch { return false; }
}

// Listas de contactos
app.get('/api/lists', requireAuth, async (req, res) => {
  const db = await getDb();
  const scope = req.userId ? { userId: req.userId } : { accountKey: req.accountKey };
  const lists = await db.collection('lists').find(scope).sort({ createdAt: -1 }).toArray();
  res.json(lists);
});
app.post('/api/lists', requireAuth, async (req, res) => {
  const db = await getDb();
  let { name } = req.body || {};
  if (typeof name !== 'string') return res.status(400).json({ error: 'name_required' });
  name = name.trim();
  if (!name || name.length > 100) return res.status(400).json({ error: 'invalid_name' });
  const docBase = { name, createdAt: new Date().toISOString() };
  const doc = req.userId
    ? { ...docBase, userId: req.userId }
    : { ...docBase, accountKey: req.accountKey };
  try {
    const r = await db.collection('lists').insertOne(doc);
    res.json({ ...doc, _id: r.insertedId });
  } catch (e) {
    if (/E11000/.test(String(e))) return res.status(409).json({ error: 'duplicate', message: 'Ya existe una lista con ese nombre' });
    res.status(500).json({ error: 'insert_failed' });
  }
});
app.patch('/api/lists/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const id = req.params.id;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid_id' });
  let { name } = req.body || {};
  if (typeof name !== 'string') return res.status(400).json({ error: 'name_required' });
  name = name.trim();
  if (!name || name.length > 100) return res.status(400).json({ error: 'invalid_name' });
  try {
    const scope = req.userId ? { userId: req.userId } : { accountKey: req.accountKey };
    const r = await db.collection('lists').updateOne({ _id: new ObjectId(id), ...scope }, { $set: { name, updatedAt: new Date().toISOString() } });
    if (r.matchedCount === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    if (/E11000/.test(String(e))) return res.status(409).json({ error: 'duplicate', message: 'Ya existe una lista con ese nombre' });
    res.status(500).json({ error: 'update_failed' });
  }
});
app.delete('/api/lists/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const id = req.params.id;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid_id' });
  const scope = req.userId ? { userId: req.userId } : { accountKey: req.accountKey };
  await db.collection('contacts').deleteMany({ ...scope, listId: id });
  await db.collection('lists').deleteOne({ _id: new ObjectId(id), ...scope });
  res.json({ ok: true });
});

// Contactos
app.get('/api/contacts', requireAuth, async (req, res) => {
  const db = await getDb();
  const { listId } = req.query;
  const filter = req.userId ? { userId: req.userId } : { accountKey: req.accountKey };
  if (listId) filter.listId = String(listId);
  const contacts = await db.collection('contacts').find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
  res.json(contacts);
});
app.post('/api/contacts/bulk', requireAuth, async (req, res) => {
  const db = await getDb();
  const { listId, contacts } = req.body || {};
  if (!listId) return res.status(400).json({ error: 'listId_required' });
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts_array_required' });
  if (contacts.length > 10000) return res.status(400).json({ error: 'too_many_contacts' });
  const seen = new Set();
  const docs = contacts.map(c => ({
    ...(req.userId ? { userId: req.userId } : { accountKey: req.accountKey }),
    listId: String(listId),
    nombre: String(c.Nombre ?? c.nombre ?? '').trim().slice(0, 120),
    numero: String((c.Numero ?? c.numero ?? '')).replace(/\D+/g, '').slice(0, 32),
    email: (c.email || c.Email) ? String(c.email || c.Email).trim().slice(0, 254) : undefined,
    createdAt: new Date().toISOString(),
  })).filter(d => d.numero && !seen.has(d.numero) && seen.add(d.numero));
  if (!docs.length) return res.status(400).json({ error: 'no_valid_contacts' });
  await db.collection('contacts').insertMany(docs, { ordered: false });
  res.json({ inserted: docs.length });
});
app.delete('/api/contacts', requireAuth, async (req, res) => {
  const db = await getDb();
  const { listId } = req.query;
  if (!listId) return res.status(400).json({ error: 'listId_required' });
  const scope = req.userId ? { userId: req.userId } : { accountKey: req.accountKey };
  const r = await db.collection('contacts').deleteMany({ ...scope, listId: String(listId) });
  res.json({ deleted: r.deletedCount });
});

// Actividades
app.get('/api/activities', requireAuth, async (req, res) => {
  const db = await getDb();
  const scope = req.userId ? { userId: req.userId } : { accountKey: req.accountKey };
  const items = await db.collection('activities').find(scope).sort({ timestamp: -1 }).limit(100).toArray();
  res.json(items);
});
app.post('/api/activities', requireAuth, async (req, res) => {
  const db = await getDb();
  const a = req.body || {};
  const doc = {
    ...(req.userId ? { userId: req.userId } : { accountKey: req.accountKey }),
    title: a.title,
    description: a.description,
    type: a.type || 'info',
    timestamp: new Date().toISOString(),
  };
  await db.collection('activities').insertOne(doc);
  res.json(doc);
});

// Sesiones de envío (resumen)
app.get('/api/sessions', requireAuth, async (req, res) => {
  const db = await getDb();
  const scope = req.userId ? { userId: req.userId } : { accountKey: req.accountKey };
  const docs = await db.collection('sessions').find(scope).sort({ timestamp: -1 }).limit(200).toArray();
  res.json(docs);
});
app.post('/api/sessions', requireAuth, async (req, res) => {
  const db = await getDb();
  const s = req.body || {};
  const doc = {
    ...(req.userId ? { userId: req.userId } : { accountKey: req.accountKey }),
    templateName: s.templateName,
    templateCategory: s.templateCategory,
    templateBody: s.templateBody,
    timestamp: new Date().toISOString(),
    total: s.total || 0,
    success: s.success || 0,
    reached: s.reached || 0,
    campaignId: s.campaignId || null,
    campaignName: s.campaignName || null,
  };
  const r = await db.collection('sessions').insertOne(doc);
  res.json({ ...doc, _id: r.insertedId });
});

// --- Envío de plantillas vía servidor con logging detallado ---
// Guarda cada intento en la colección send_logs para depuración futura.
// Requiere usuario autenticado (usa metaCreds del usuario, no expone token en cliente durante el send).
app.post('/api/wa/send-template', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const { to, template, batchId } = req.body || {};
    if (!to || typeof to !== 'string') return res.status(400).json({ error: 'invalid_to' });
    if (!template || typeof template !== 'object') return res.status(400).json({ error: 'invalid_template' });

    const user = await db.collection('users').findOne({ _id: userIdObj }, { projection: { metaCreds: 1 } });
    const creds = user?.metaCreds || {};
    if (!creds.accessToken || !creds.phoneNumberId) {
      return res.status(400).json({ error: 'missing_meta_credentials', hint: 'Configura accessToken y phoneNumberId' });
    }

    // Construir payload mínimo válido para Graph
    const payload = {
      messaging_product: 'whatsapp',
      to: String(to),
      type: 'template',
      template: template,
    };

    const url = `https://graph.facebook.com/v22.0/${creds.phoneNumberId}/messages`;
    const gRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await gRes.text().catch(() => '');
    let graphJson;
    try { graphJson = JSON.parse(text); } catch { graphJson = { raw: text }; }

    // Insertar log
    let logId = null;
    try {
      const logDoc = {
        userId: userIdObj,
        time: new Date().toISOString(),
        to: String(to),
        templateName: template?.name,
        batchId: batchId || null,
        requestPayload: payload,
        graphStatus: gRes.status,
        graphResponse: graphJson,
        success: gRes.ok,
      };
      const ins = await db.collection('send_logs').insertOne(logDoc);
      logId = ins.insertedId;
      // Mantenimiento básico: mantener solo últimos 2000 logs por usuario
      const count = await db.collection('send_logs').countDocuments({ userId: userIdObj });
      if (count > 2000) {
        const excess = count - 2000;
        // Borrar más antiguos usando _id (orden natural)
        const old = await db.collection('send_logs').find({ userId: userIdObj }).sort({ _id: 1 }).limit(excess).project({ _id: 1 }).toArray();
        const oldIds = old.map(o => o._id);
        if (oldIds.length) await db.collection('send_logs').deleteMany({ _id: { $in: oldIds } });
      }
    } catch (logErr) {
      console.warn('send_logs insert failed', logErr);
    }

    if (!gRes.ok) {
      return res.status(gRes.status).json({ error: 'graph_error', status: gRes.status, response: graphJson, _logId: logId });
    }

    // Guardar messageId para correlación si existe
    try {
      const messageId = graphJson?.messages?.[0]?.id;
      if (messageId) {
        await db.collection('send_logs').updateOne({ _id: logId }, { $set: { messageId } });
        // crear registro base de evento si no existe
        await db.collection('message_events').updateOne(
          { userId: userIdObj, messageId },
          { $setOnInsert: { userId: userIdObj, messageId, status: 'sent', createdAt: new Date().toISOString() }, $set: { updatedAt: new Date().toISOString(), lastRecipient: String(to), batchId: batchId || null } },
          { upsert: true }
        );
      }
    } catch {}

    return res.json({ ...graphJson, _logId: logId });
  } catch (err) {
    console.error('/api/wa/send-template error', err);
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});

// Obtener últimos logs de envío (limit 50) para inspección rápida
app.get('/api/wa/send-logs', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const logs = await db.collection('send_logs')
      .find({ userId: userIdObj })
      .sort({ _id: -1 })
      .limit(50)
      .project({ requestPayload: 0 }) // ocultar request completo para respuesta ligera
      .toArray();
    return res.json(logs);
  } catch (err) {
    return res.status(500).json({ error: 'logs_error', detail: String(err) });
  }
});

// Diagnostics: Verify WA token + assets
app.get('/diag/wa', async (req, res) => {
  try {
    const accessToken = req.headers['x-access-token'] || req.query.accessToken || process.env.ACCESS_TOKEN;
    const phoneNumberId = req.headers['x-phone-number-id'] || req.query.phoneNumberId || process.env.PHONE_NUMBER_ID;
    const businessAccountId = req.headers['x-business-account-id'] || req.query.businessAccountId || process.env.BUSINESS_ACCOUNT_ID;
    if (!accessToken) return res.status(400).json({ error: 'access_token_required' });
    const out = {};
    if (phoneNumberId) {
  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,whatsapp_business_account`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      out.phoneNumber = { status: r.status, data: await r.json().catch(() => ({})) };
    } else {
      out.phoneNumber = { warning: 'no phoneNumberId provided' };
    }
    if (businessAccountId) {
  const url2 = `https://graph.facebook.com/v22.0/${businessAccountId}?fields=id,name,verification_status,owned_whatsapp_business_accounts{id,name}`;
      const r2 = await fetch(url2, { headers: { Authorization: `Bearer ${accessToken}` } });
      out.business = { status: r2.status, data: await r2.json().catch(() => ({})) };
    } else {
      out.business = { warning: 'no businessAccountId provided' };
    }
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: 'diag_failed', detail: String(err) });
  }
});

// --- Meta Graph proxy: obtener plantillas desde el servidor (evita CORS y bloqueadores) ---
app.get('/api/meta/templates', async (req, res) => {
  try {
    const accessToken = req.headers['x-access-token'] || req.query.accessToken || process.env.ACCESS_TOKEN;
    const businessAccountId = req.headers['x-business-account-id'] || req.query.businessAccountId || process.env.BUSINESS_ACCOUNT_ID;
    const limit = Number(req.query.limit || 200);
    const after = req.query.after ? String(req.query.after) : undefined;
    if (!accessToken || !businessAccountId) return res.status(400).json({ error: 'missing_credentials', message: 'ACCESS_TOKEN and BUSINESS_ACCOUNT_ID required' });

  const params = new URLSearchParams();
  // Añadimos id para poder eliminar por id (más fiable que por nombre)
  params.set('fields', 'id,name,status,category,language,components');
    params.set('limit', String(limit));
    if (after) params.set('after', after);
    // Pasar el token como query param para evitar variaciones en encabezados (compatibilidad máxima)
    params.set('access_token', String(accessToken));
    const url = `https://graph.facebook.com/v22.0/${businessAccountId}/message_templates?${params.toString()}`;
    const r = await fetch(url);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!r.ok) {
      console.warn('/api/meta/templates graph_error', { status: r.status, json });
      return res.status(r.status).json({ error: 'graph_error', status: r.status, detail: json });
    }
    return res.json(json);
  } catch (err) {
    console.error('/api/meta/templates error', err);
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});



// Eliminar plantilla por nombre (fallback)
app.delete('/api/meta/templates', async (req, res) => {
  try {
    const accessToken = req.headers['x-access-token'] || req.query.accessToken || process.env.ACCESS_TOKEN;
    const businessAccountId = req.headers['x-business-account-id'] || req.query.businessAccountId || process.env.BUSINESS_ACCOUNT_ID;
    const name = req.query.name ? String(req.query.name) : '';
    if (!accessToken || !businessAccountId || !name) return res.status(400).json({ error: 'missing_params', message: 'accessToken, businessAccountId y name requeridos' });
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(businessAccountId)}/message_templates?name=${encodeURIComponent(name)}&access_token=${encodeURIComponent(accessToken)}`;
    const r = await fetch(url, { method: 'DELETE' });
    const text = await r.text().catch(() => '');
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (!r.ok) {
      console.warn('/api/meta/templates delete_by_name_error', { status: r.status, json });
      return res.status(r.status).json({ error: 'graph_error', status: r.status, detail: json });
    }
    return res.json({ ok: true, result: json });
  } catch (err) {
    console.error('/api/meta/templates delete_by_name server_error', err);
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});

// --- Reportes ---
// Resumen por campaña (batchId) con conteos por estado
app.get('/api/reports/campaigns', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    // Obtener últimas campañas desde sessions o send_logs
    const sessionFilter = { userId: userIdObj };
    if (from || to) {
      sessionFilter['timestamp'] = {};
      if (from) sessionFilter['timestamp'].$gte = from.toISOString();
      if (to) sessionFilter['timestamp'].$lte = to.toISOString();
    }
    const sessions = await db.collection('sessions').find(sessionFilter).sort({ timestamp: -1 }).limit(200).toArray();
    const byCampaign = new Map();
    for (const s of sessions) {
      const key = s.campaignId || (s._id ? String(s._id) : s.timestamp);
      byCampaign.set(key, { campaignId: key, campaignName: s.campaignName, templateName: s.templateName, timestamp: s.timestamp, total: s.total, success: s.success, reached: s.reached });
    }
    // Agregar desde send_logs por batchId si existe
    const logsFilter = { userId: userIdObj };
    if (from || to) {
      logsFilter['time'] = {};
      if (from) logsFilter['time'].$gte = from.toISOString();
      if (to) logsFilter['time'].$lte = to.toISOString();
    }
    const logs = await db.collection('send_logs').find(logsFilter).sort({ time: -1 }).limit(2000).project({ batchId: 1, time: 1, templateName: 1 }).toArray();
    for (const l of logs) {
      if (!l.batchId) continue;
      if (!byCampaign.has(l.batchId)) byCampaign.set(l.batchId, { campaignId: l.batchId, templateName: l.templateName, timestamp: l.time });
    }
  const campaigns = Array.from(byCampaign.values()).sort((a, b) => (+new Date(b.timestamp)) - (+new Date(a.timestamp))).slice(0, limit);
    // Para cada campaña, contar estados desde message_events
    for (const c of campaigns) {
      const match = { userId: userIdObj, ...(c.campaignId ? { batchId: c.campaignId } : {}) };
      const pipeline = [
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ];
      const agg = await db.collection('message_events').aggregate(pipeline).toArray();
      const counts = Object.fromEntries(agg.map(x => [x._id || 'unknown', x.count]));
      c['counts'] = counts;
    }
    return res.json({ data: campaigns });
  } catch (err) {
    console.error('/api/reports/campaigns error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Detalle de campaña por batchId (o por sessionId) con lista de mensajes recientes
app.get('/api/reports/campaigns/:id', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const id = String(req.params.id);
    const limit = Math.min(Number(req.query.limit || 200), 1000);
    const skip = Math.max(Number(req.query.skip || 0), 0);
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const status = req.query.status ? String(req.query.status) : '';
    const q = req.query.q ? String(req.query.q).trim() : '';
    // Buscar eventos por batchId con filtros
    const evFilter = { userId: userIdObj, batchId: id };
    if (status) evFilter['status'] = status;
    if (from || to) {
      evFilter['updatedAt'] = {};
      if (from) evFilter['updatedAt'].$gte = from.toISOString();
      if (to) evFilter['updatedAt'].$lte = to.toISOString();
    }
    if (q) evFilter['lastRecipient'] = { $regex: q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), $options: 'i' };
    const cursor = db.collection('message_events').find(evFilter).sort({ updatedAt: -1 }).skip(skip).limit(limit);
    const events = await cursor.toArray();
    // Totales
    const pipeline = [
      { $match: { userId: userIdObj, batchId: id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ];
    const agg = await db.collection('message_events').aggregate(pipeline).toArray();
    const counts = Object.fromEntries(agg.map(x => [x._id || 'unknown', x.count]));
    // Intentar recuperar metadata de la sesión
    const session = await db.collection('sessions').findOne({ userId: req.userId, campaignId: id });
    const meta = session ? {
      campaignName: session.campaignName,
      templateName: session.templateName,
      templateCategory: session.templateCategory,
      templateBody: session.templateBody,
      timestamp: session.timestamp,
      total: session.total,
      success: session.success,
      reached: session.reached,
    } : null;
    return res.json({ batchId: id, counts, events, meta });
  } catch (err) {
    console.error('/api/reports/campaigns/:id error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Create template server-side: recibe metadata + file opcional y crea la plantilla en Graph API
// Requiere en el servidor: BUSINESS_ACCOUNT_ID y ACCESS_TOKEN (en env vars)
app.post('/create-template', upload.single('file'), async (req, res) => {
  try {
    const accessToken = req.headers['x-access-token'] || req.body.accessToken || process.env.ACCESS_TOKEN;
    const businessAccountId = req.headers['x-business-account-id'] || req.body.businessAccountId || process.env.BUSINESS_ACCOUNT_ID;
    if (!accessToken || !businessAccountId) return res.status(500).json({ error: 'server missing ACCESS_TOKEN or BUSINESS_ACCOUNT_ID env' });

  // Esperamos metadata en body.metadata como JSON string o en campos individuales
    const metadataRaw = req.body.metadata || '{}';
    const metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;

    let payload = { ...metadata };

  // Si hay archivo adjunto y es un header MEDIA, intentamos subirlo y agregar example.header_handle
    if (req.file && payload.components && Array.isArray(payload.components)) {
      const filePath = req.file.path;
  let handle = null;

      // 1) resumable con APP_ID si está en env
      const appId = req.headers['x-app-id'] || req.body.appId || process.env.APP_ID;
      if (appId) {
        try {
          const stat = await fs.promises.stat(filePath);
          const initUrl = `https://graph.facebook.com/v22.0/${appId}/uploads?file_name=${encodeURIComponent(req.file.originalname)}&file_length=${stat.size}&file_type=${encodeURIComponent(req.file.mimetype || 'application/octet-stream')}`;
          const initRes = await fetch(initUrl, { method: 'POST', headers: { Authorization: `OAuth ${accessToken}` } });
          if (initRes.ok) {
            const initJson = await initRes.json();
            const uploadId = initJson.id || initJson.upload_session_id;
            if (uploadId) {
              const uploadUrl = `https://graph.facebook.com/v22.0/${uploadId}`;
              const buffer = await fs.promises.readFile(filePath);
              const upRes = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: `OAuth ${accessToken}`, file_offset: '0', 'Content-Type': 'application/octet-stream' }, body: buffer });
              if (upRes.ok) {
                const upJson = await upRes.json();
                if (upJson.h) handle = upJson.h;
              }
            }
          }
        } catch (err) {
          console.warn('resumable server attempt failed', err);
        }
      }

      // 2) NO usar media ID como handle (no es válido para creación de plantillas)
      // Si no hay handle, se usará preview URL más abajo.

      // 3) si tenemos handle, inyectarlo en el componente HEADER correspondiente
      if (handle) {
        payload.components = payload.components.map((c) => {
          if (c.type === 'HEADER') return Object.assign({}, c, { example: { header_handle: [handle] } });
          return c;
        });
      } else {
        return res.status(400).json({ error: 'header_media_example_required', detail: 'No fue posible generar handle desde archivo. Proporciona una URL pública en headerMediaUrl.' });
      }
    }

    // Si viene headerMediaUrl (URL pública) descargar y usar subida reanudable a APP_ID para obtener handle válido
    if (payload.headerMediaUrl && payload.components && Array.isArray(payload.components)) {
      const appId = req.headers['x-app-id'] || req.body.appId || process.env.APP_ID;
      if (!appId) return res.status(400).json({ error: 'app_id_required', detail: 'Se requiere APP_ID para crear handle de ejemplo desde URL' });
      const urlStr = payload.headerMediaUrl.url;
      const fmt = (payload.headerMediaUrl.format || '').toUpperCase();
      if (!/^https?:\/\//i.test(urlStr)) return res.status(400).json({ error: 'invalid_url' });
      // Descargar contenido
      const dlRes = await fetch(urlStr, { redirect: 'follow' });
      if (!dlRes.ok) {
        const t = await dlRes.text().catch(() => '');
        return res.status(400).json({ error: 'download_failed', detail: t || dlRes.status });
      }
      const ab = await dlRes.arrayBuffer();
      const buffer = Buffer.from(ab);
      const guessed = (() => {
        const ct = (dlRes.headers.get('content-type') || '').toLowerCase();
        if (ct) return ct;
        const lower = String(urlStr).toLowerCase();
        if (fmt === 'IMAGE') return lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        if (fmt === 'VIDEO') return lower.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
        if (fmt === 'DOCUMENT') return lower.endsWith('.pdf') ? 'application/pdf' : lower.endsWith('.doc') ? 'application/msword' : lower.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : lower.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream';
        return 'application/octet-stream';
      })();
      // Derivar nombre
      let fileName = 'media';
      try {
        const u = new URL(urlStr);
        const base = u.pathname.split('/').pop();
        if (base) fileName = base;
      } catch {}
      // Iniciar subida reanudable
  const initUrl = `https://graph.facebook.com/v22.0/${appId}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${buffer.length}&file_type=${encodeURIComponent(guessed)}`;
      const initRes = await fetch(initUrl, { method: 'POST', headers: { Authorization: `OAuth ${accessToken}` } });
      if (!initRes.ok) {
        const text = await initRes.text().catch(() => '');
        return res.status(500).json({ error: 'resumable_init_failed', detail: text || initRes.status });
      }
      const initJson = await initRes.json();
      const uploadId = initJson.id || initJson.upload_session_id;
      if (!uploadId) return res.status(500).json({ error: 'no_upload_id_returned', initJson });
  const uploadUrl = `https://graph.facebook.com/v22.0/${uploadId}`;
      const upRes = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: `OAuth ${accessToken}`, file_offset: '0', 'Content-Type': 'application/octet-stream' }, body: buffer });
      if (!upRes.ok) {
        const text = await upRes.text().catch(() => '');
        return res.status(500).json({ error: 'resumable_upload_failed', detail: text || upRes.status });
      }
      const upJson = await upRes.json();
      const handle = upJson.h;
      if (!handle) return res.status(500).json({ error: 'no_handle_returned', upJson });
      payload.components = payload.components.map((c) => {
        if (c.type === 'HEADER') return Object.assign({}, c, { example: { header_handle: [handle] } });
        return c;
      });
      delete payload.headerMediaUrl;
    }

    // Llamar a Graph API para crear la plantilla
  const createUrl = `https://graph.facebook.com/v22.0/${businessAccountId}/message_templates`;
    const resp = await fetch(createUrl, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const jsonResp = await resp.json();
    if (!resp.ok) return res.status(500).json({ error: 'create_template_failed', detail: jsonResp });
    return res.json(jsonResp);
  } catch (err) {
    console.error('/create-template error', err);
    return res.status(500).json({ error: 'server error', detail: String(err) });
  }
});

app.listen(port, () => console.log(`Static server listening on http://localhost:${port}`));
