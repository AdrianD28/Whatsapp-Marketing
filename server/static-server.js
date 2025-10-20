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
        
        // 🚨 NUEVO: Detectar mensajes entrantes para opt-out automático
        const messages = v.messages || [];
        for (const msg of messages) {
          try {
            const text = (msg.text?.body || '').toLowerCase().trim();
            const from = msg.from; // Número del usuario
            
            // Palabras clave de opt-out (español + inglés)
            const optOutKeywords = [
              'stop', 'baja', 'no más', 'no mas', 'cancelar', 'dejar de recibir',
              'unsubscribe', 'remove', 'salir', 'ya no', 'detener'
            ];
            
            if (optOutKeywords.some(kw => text.includes(kw))) {
              // Intentar encontrar userId desde contactos
              const contact = await db.collection('contacts').findOne({ numero: from });
              
              if (contact?.userId) {
                // Agregar a lista de opt-outs
                await db.collection('opt_outs').updateOne(
                  { userId: contact.userId, numero: from },
                  { 
                    $set: { 
                      numero: from,
                      userId: contact.userId,
                      optOutDate: new Date().toISOString(),
                      reason: 'user_request',
                      keyword: text.substring(0, 50), // Guardar keyword usado
                      source: 'webhook'
                    } 
                  },
                  { upsert: true }
                );
                
                console.log(`✅ Opt-out registered: ${from} (userId: ${contact.userId})`);
                
                // Opcional: Marcar contacto como opt-out
                await db.collection('contacts').updateMany(
                  { userId: contact.userId, numero: from },
                  { $set: { optedOut: true, optOutDate: new Date().toISOString() } }
                );
              } else {
                // Si no encontramos userId, guardar como global (por si llega de otro canal)
                await db.collection('opt_outs').updateOne(
                  { numero: from, userId: { $exists: false } },
                  { 
                    $set: { 
                      numero: from,
                      optOutDate: new Date().toISOString(),
                      reason: 'user_request_no_user',
                      keyword: text.substring(0, 50),
                      source: 'webhook'
                    } 
                  },
                  { upsert: true }
                );
                console.log(`⚠️ Opt-out registered (no userId): ${from}`);
              }
            }
          } catch (msgErr) {
            console.warn('opt-out detection failed', msgErr);
          }
        }
        
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
                
                // Agregar el estado al historial de estados
                await db.collection('message_events').updateOne(
                  { userId: userIdObj, messageId },
                  { 
                    $set: update, 
                    $setOnInsert: { createdAt: new Date().toISOString(), batchId: logDoc.batchId || null },
                    $addToSet: { statusHistory: s.status } // Rastrea todos los estados por los que pasa
                  },
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
  return { 
    id: String(user._id), 
    email: user.email, 
    name: user.name || null,
    role: user.role || 'user',      // 🚨 NUEVO
    credits: user.credits || 0      // 🚨 NUEVO
  };
}

// Middleware de autorización: token de usuario o compatibilidad con X-Account-Key
async function requireAuth(req, res, next) {
  const user = await getUserFromAuth(req);
  if (user) {
    // Verificar si el usuario está suspendido
    if (user.suspended) {
      return res.status(403).json({ error: 'account_suspended', message: 'Tu cuenta ha sido suspendida. Contacta al administrador.' });
    }
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
    // Verificar si el usuario está suspendido
    if (user.suspended) {
      return res.status(403).json({ error: 'account_suspended', message: 'Tu cuenta ha sido suspendida. Contacta al administrador.' });
    }
    req.userId = user.id;
    req.user = user;
    return next();
  }
  return res.status(401).json({ error: 'auth_required', hint: 'Authorization: Bearer <token>' });
}

// 🚨 NUEVO: Middleware que exige admin o super_admin
async function requireAdmin(req, res, next) {
  const user = await getUserFromAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'auth_required' });
  }
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return res.status(403).json({ error: 'admin_required', message: 'Esta acción requiere permisos de administrador' });
  }
  req.userId = user.id;
  req.user = user;
  return next();
}

// 🚨 NUEVO: Middleware que exige super_admin
async function requireSuperAdmin(req, res, next) {
  const user = await getUserFromAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'auth_required' });
  }
  if (user.role !== 'super_admin') {
    return res.status(403).json({ error: 'super_admin_required', message: 'Esta acción requiere permisos de super administrador' });
  }
  req.userId = user.id;
  req.user = user;
  return next();
}

// --- Auth endpoints ---
// 🚨 REGISTRO DESHABILITADO - Solo admins pueden crear cuentas
app.post('/api/auth/register', async (req, res) => {
  return res.status(403).json({ 
    error: 'registration_disabled', 
    message: 'El registro público está deshabilitado. Contacta al administrador para crear una cuenta.' 
  });
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
    return res.json({ 
      token, 
      user: { 
        id: String(user._id), 
        email: user.email, 
        name: user.name || null,
        role: user.role || 'user', // 🚨 NUEVO: role
        credits: user.credits || 0   // 🚨 NUEVO: créditos
      } 
    });
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
  // Obtener datos actualizados del usuario (incluye créditos frescos)
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    
    return res.json({ 
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name || null,
        role: user.role || 'user',
        credits: user.credits || 0,
        suspended: user.suspended || false
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'server_error' });
  }
});

// ==================== ADMIN ENDPOINTS ====================
// 🚨 ADMIN: Listar todos los usuarios
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const users = await db.collection('users')
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    const total = await db.collection('users').countDocuments();
    
    const formatted = users.map(u => ({
      _id: String(u._id),
      email: u.email,
      name: u.name || '',
      role: u.role || 'user',
      credits: u.credits || 0,
      suspended: u.suspended || false,
      createdAt: u.createdAt,
      lastMessageAt: u.lastMessageAt || null
    }));
    
    return res.json({ 
      users: formatted, 
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// 🚨 ADMIN: Crear nuevo usuario
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { email, password, name, initialCredits, role } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'email_and_password_required' });
    }
    
    const db = await getDb();
    
    // Verificar que el email no existe
    const existing = await db.collection('users').findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'email_already_exists' });
    }
    
    // Solo super_admin puede crear otros admins
    const requestedRole = role || 'user';
    if ((requestedRole === 'admin' || requestedRole === 'super_admin') && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'only_super_admin_can_create_admins' });
    }
    
    // Usar la función hashPassword para consistencia
    const passwordHash = hashPassword(password);
    
    const newUser = {
      email,
      passwordHash: passwordHash, // Usar passwordHash en lugar de password
      name: name || '',
      role: requestedRole,
      credits: parseInt(initialCredits) || 0,
      createdAt: new Date().toISOString(),
      lastMessageAt: null
    };
    
    const result = await db.collection('users').insertOne(newUser);
    
    console.log(`✅ User created by admin: ${email} with ${newUser.credits} credits`);
    
    return res.json({ 
      success: true,
      user: {
        id: String(result.insertedId),
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        credits: newUser.credits
      }
    });
  } catch (err) {
    console.error('POST /api/admin/users error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// 🚨 ADMIN: Actualizar datos de usuario
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, suspended } = req.body;
    
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
    
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    
    // Solo super_admin puede cambiar roles
    if (role && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'only_super_admin_can_change_roles' });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (suspended !== undefined) updates.suspended = suspended;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no_fields_to_update' });
    }
    
    await db.collection('users').updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );
    
    console.log(`✅ User updated by admin: ${user.email}`, updates);
    
    return res.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/admin/users/:id error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// 🚨 ADMIN: Eliminar usuario
app.delete('/api/admin/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
    
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    
    // No permitir eliminar al mismo super admin
    if (String(user._id) === String(req.user._id)) {
      return res.status(403).json({ error: 'cannot_delete_yourself' });
    }
    
    await db.collection('users').deleteOne({ _id: new ObjectId(id) });
    
    console.log(`✅ User deleted by super admin: ${user.email}`);
    
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/users/:id error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// 🚨 ADMIN: Gestionar créditos (agregar o quitar)
app.post('/api/admin/credits', requireAdmin, async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    
    console.log('📋 POST /api/admin/credits request body:', req.body);
    console.log('📋 Types:', { 
      userId: typeof userId, 
      amount: typeof amount,
      userIdValue: userId,
      amountValue: amount
    });
    console.log('👤 Admin user:', req.user);
    console.log('🆔 Admin userId:', req.userId);
    
    // Validar que userId exista y no sea vacío
    if (!userId || userId === '' || typeof userId !== 'string') {
      console.error('❌ userId invalid:', { userId, type: typeof userId });
      return res.status(400).json({ 
        error: 'userId_and_amount_required',
        details: 'userId is missing or invalid',
        received: { userId, amount }
      });
    }
    
    // Validar que amount sea un número válido
    const parsedAmount = typeof amount === 'string' ? parseInt(amount, 10) : amount;
    if (typeof parsedAmount !== 'number' || isNaN(parsedAmount)) {
      console.error('❌ amount invalid:', { amount, parsedAmount, type: typeof amount });
      return res.status(400).json({ 
        error: 'userId_and_amount_required',
        details: 'amount must be a valid number',
        received: { userId, amount }
      });
    }
    
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    
    if (!user) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'user_not_found' });
    }
    
    const currentCredits = user.credits || 0;
    const newCredits = Math.max(0, currentCredits + parsedAmount);
    
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { credits: newCredits, updatedAt: new Date().toISOString() } }
    );
    
    // Log de transacción
    try {
      await db.collection('credit_logs').insertOne({
        userId: new ObjectId(userId),
        adminId: new ObjectId(req.userId),
        amount: parsedAmount,
        previousCredits: currentCredits,
        newCredits,
        reason: reason || 'manual_adjustment',
        createdAt: new Date().toISOString()
      });
    } catch (logErr) {
      console.warn('⚠️  Failed to log credit transaction:', logErr.message);
    }
    
    console.log(`💳 Credits ${parsedAmount > 0 ? 'added' : 'removed'}: ${user.email} now has ${newCredits} credits (${parsedAmount > 0 ? '+' : ''}${parsedAmount})`);
    
    return res.json({ 
      success: true,
      credits: newCredits,
      change: parsedAmount
    });
  } catch (err) {
    console.error('❌ POST /api/admin/credits error:', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// ==================== END ADMIN ENDPOINTS ====================

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
  const { listId, contacts, optInSource } = req.body || {};
  if (!listId) return res.status(400).json({ error: 'listId_required' });
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts_array_required' });
  if (contacts.length > 10000) return res.status(400).json({ error: 'too_many_contacts' });
  
  const now = new Date().toISOString();
  const seen = new Set();
  const docs = contacts.map(c => {
    // Extraer Numero (normalizado)
    const numero = String((c.Numero ?? c.numero ?? '')).replace(/\D+/g, '').slice(0, 32);
    
    // Crear objeto con todas las columnas dinámicas (excepto Numero que ya lo procesamos)
    const data = { ...c };
    delete data.Numero;
    delete data.numero;
    
    return {
      ...(req.userId ? { userId: req.userId } : { accountKey: req.accountKey }),
      listId: String(listId),
      numero,
      data, // Guardar TODAS las columnas adicionales aquí
      // Opt-in por defecto al importar (asumimos consentimiento si usuario los sube)
      optInDate: c.optInDate || now,
      optInSource: c.optInSource || optInSource || 'bulk_import',
      optedOut: false,
      createdAt: now,
    };
  }).filter(d => d.numero && !seen.has(d.numero) && seen.add(d.numero));
  
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

// 🚨 NUEVO: Actualizar opt-in de contactos
app.patch('/api/contacts/:id/opt-in', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid_id' });
    
    const { optInSource } = req.body || {};
    const scope = req.userId ? { userId: req.userId } : { accountKey: req.accountKey };
    
    const update = {
      optInDate: new Date().toISOString(),
      optInSource: optInSource || 'manual',
      optedOut: false
    };
    
    const result = await db.collection('contacts').updateOne(
      { _id: new ObjectId(id), ...scope },
      { $set: update, $unset: { optOutDate: '' } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'contact_not_found' });
    }
    
    return res.json({ ok: true });
  } catch (err) {
    console.error('/api/contacts/:id/opt-in error', err);
    return res.status(500).json({ error: 'server_error' });
  }
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

    const user = await db.collection('users').findOne({ _id: userIdObj }, { projection: { metaCreds: 1, credits: 1 } });
    const creds = user?.metaCreds || {};
    if (!creds.accessToken || !creds.phoneNumberId) {
      return res.status(400).json({ error: 'missing_meta_credentials', hint: 'Configura accessToken y phoneNumberId' });
    }

    // 💰 VALIDAR CRÉDITOS
    const userCredits = user?.credits || 0;
    if (userCredits < 1) {
      return res.status(402).json({ 
        error: 'insufficient_credits',
        message: 'No tienes créditos suficientes para enviar mensajes',
        available: userCredits
      });
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

    // 💰 DESCONTAR CRÉDITO DESPUÉS DE ENVÍO EXITOSO
    try {
      console.log('💰 Iniciando descuento de crédito...');
      console.log('💰 User ID Object:', userIdObj);
      console.log('💰 Log ID:', logId);
      
      const updateResult = await db.collection('users').updateOne(
        { _id: userIdObj },
        { $inc: { credits: -1 } }
      );
      
      console.log('💰 Resultado de actualización de créditos:', {
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        acknowledged: updateResult.acknowledged
      });
      
      // Verificar créditos actuales del usuario
      const updatedUser = await db.collection('users').findOne({ _id: userIdObj }, { projection: { credits: 1, email: 1 } });
      console.log('💰 Usuario después del descuento:', updatedUser);
      
      // Registrar en log que se descontó crédito
      await db.collection('send_logs').updateOne(
        { _id: logId },
        { $set: { creditDeducted: true } }
      );
      
      console.log('💰 ✅ Crédito descontado exitosamente');
    } catch (creditErr) {
      console.error('💰 ❌ Error al descontar crédito:', creditErr);
      console.warn('credit deduction failed', creditErr);
    }

    // Guardar messageId para correlación si existe
    try {
      const messageId = graphJson?.messages?.[0]?.id;
      if (messageId) {
        await db.collection('send_logs').updateOne({ _id: logId }, { $set: { messageId } });
        // crear registro base de evento si no existe
        await db.collection('message_events').updateOne(
          { userId: userIdObj, messageId },
          { 
            $setOnInsert: { userId: userIdObj, messageId, status: 'sent', createdAt: new Date().toISOString() }, 
            $set: { updatedAt: new Date().toISOString(), lastRecipient: String(to), batchId: batchId || null },
            $addToSet: { statusHistory: 'sent' }
          },
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

// --- NUEVO: Sistema de envío en background para campañas grandes ---
// Permite enviar miles de mensajes sin depender del navegador abierto

// Map para trackear campañas activas en memoria (persiste en DB también)
const activeCampaigns = new Map();

// Función helper para enviar un mensaje individual
async function sendSingleMessage(db, userId, to, template, batchId, creds) {
  // 🚨 CRÍTICO: Validar créditos ANTES de enviar
  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
  if (!user) {
    return { success: false, error: 'user_not_found', skipped: true };
  }
  
  const credits = user.credits || 0;
  if (credits <= 0) {
    console.warn(`❌ No credits: user ${userId} has ${credits} credits`);
    return { 
      success: false, 
      error: 'insufficient_credits', 
      skipped: true,
      message: 'Sin créditos suficientes'
    };
  }

  // 🚨 CRÍTICO: Validar opt-out antes de enviar
  const optOut = await db.collection('opt_outs').findOne({ 
    numero: to,
    $or: [
      { userId: new ObjectId(userId) },
      { userId: { $exists: false } }
    ]
  });
  
  if (optOut) {
    return { 
      success: false, 
      error: 'contact_opted_out', 
      skipped: true 
    };
  }

  // 🚨 CRÍTICO: Validar frecuencia 24h (evitar spam)
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentMessage = await db.collection('send_logs').findOne({
    userId: new ObjectId(userId),
    to: to,
    time: { $gte: last24h },
    success: true
  });
  
  if (recentMessage) {
    console.warn(`⚠️ Frequency limit: ${to} already received message in last 24h`);
    return { 
      success: false, 
      error: 'frequency_limit_24h', 
      skipped: true,
      lastMessageTime: recentMessage.time
    };
  }

  // 🚨 OPCIONAL: Validar opt-in (solo si contact existe)
  // Comentado por defecto, descomentar para enforcement estricto
  /*
  const contact = await db.collection('contacts').findOne({ 
    userId: new ObjectId(userId), 
    numero: to 
  });
  
  if (contact && !contact.optInDate) {
    console.warn(`⚠️ Opt-in missing: ${to}`);
    return { 
      success: false, 
      error: 'opt_in_required', 
      skipped: true 
    };
  }
  */

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

  // 🚨 CRÍTICO: Descontar 1 crédito SOLO si envío fue exitoso
  if (gRes.ok) {
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { 
        $inc: { credits: -1 },
        $set: { lastMessageAt: new Date().toISOString() }
      }
    );
    console.log(`💳 Credit deducted: user ${userId} sent message to ${to} (${credits - 1} credits remaining)`);
  }

  // Log del envío
  const logDoc = {
    userId: new ObjectId(userId),
    time: new Date().toISOString(),
    to: String(to),
    templateName: template?.name,
    batchId: batchId || null,
    requestPayload: payload,
    graphStatus: gRes.status,
    graphResponse: graphJson,
    success: gRes.ok,
    messageId: graphJson?.messages?.[0]?.id || null,
    creditDeducted: gRes.ok ? 1 : 0, // 🚨 NUEVO: track credit usage
  };
  
  await db.collection('send_logs').insertOne(logDoc);

  // Si fue exitoso, crear evento inicial
  if (gRes.ok && logDoc.messageId) {
    await db.collection('message_events').updateOne(
      { userId: new ObjectId(userId), messageId: logDoc.messageId },
      { 
        $setOnInsert: { userId: new ObjectId(userId), messageId: logDoc.messageId, status: 'sent', createdAt: new Date().toISOString() }, 
        $set: { updatedAt: new Date().toISOString(), lastRecipient: String(to), batchId: batchId || null },
        $addToSet: { statusHistory: 'sent' }
      },
      { upsert: true }
    );
  }

  return { success: gRes.ok, messageId: logDoc.messageId, response: graphJson };
}

// Procesar campaña en background
async function processCampaignBackground(campaignId) {
  const db = await getDb();
  let campaign = await db.collection('campaigns').findOne({ _id: new ObjectId(campaignId) });
  
  if (!campaign) {
    console.error(`Campaign ${campaignId} not found`);
    return;
  }

  try {
    // Marcar como procesando
    await db.collection('campaigns').updateOne(
      { _id: campaign._id },
      { $set: { status: 'processing', startedAt: new Date().toISOString() } }
    );

    const user = await db.collection('users').findOne({ _id: campaign.userId });
    const creds = user?.metaCreds || {};
    
    if (!creds.accessToken || !creds.phoneNumberId) {
      await db.collection('campaigns').updateOne(
        { _id: campaign._id },
        { $set: { status: 'failed', error: 'missing_credentials', completedAt: new Date().toISOString() } }
      );
      return;
    }

    // 🚨 CRÍTICO: Filtrar contactos con opt-out ANTES de empezar
    const allContacts = campaign.contacts || [];
    const optOuts = await db.collection('opt_outs')
      .find({ 
        $or: [
          { userId: campaign.userId },
          { userId: { $exists: false } } // Opt-outs globales
        ]
      })
      .toArray();
    
    const optOutNumbers = new Set(optOuts.map(o => o.numero));
    const contacts = allContacts.filter(c => !optOutNumbers.has(c.numero));
    
    // Log de contactos filtrados
    const skippedOptOutsCount = allContacts.length - contacts.length;
    if (skippedOptOutsCount > 0) {
      console.log(`⚠️ Campaign ${campaignId}: Skipped ${skippedOptOutsCount} contacts with opt-out`);
      await db.collection('campaigns').updateOne(
        { _id: campaign._id },
        { $set: { skippedOptOuts: skippedOptOutsCount } }
      );
    }

    if (contacts.length === 0) {
      await db.collection('campaigns').updateOne(
        { _id: campaign._id },
        { $set: { status: 'completed', error: 'all_contacts_opted_out', completedAt: new Date().toISOString() } }
      );
      console.warn(`Campaign ${campaignId} completed: all contacts have opted out`);
      return;
    }

    // 💰 VALIDAR CRÉDITOS ANTES DE INICIAR CAMPAÑA
    const userCredits = user?.credits || 0;
    const requiredCredits = contacts.length;
    if (userCredits < requiredCredits) {
      await db.collection('campaigns').updateOne(
        { _id: campaign._id },
        { 
          $set: { 
            status: 'failed', 
            error: 'insufficient_credits',
            errorDetails: {
              required: requiredCredits,
              available: userCredits,
              missing: requiredCredits - userCredits
            },
            completedAt: new Date().toISOString() 
          } 
        }
      );
      console.warn(`Campaign ${campaignId} failed: insufficient credits (${userCredits}/${requiredCredits})`);
      return;
    }

    const template = campaign.template;
    const batchId = campaign.batchId;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0; // 🚨 NUEVO: Contar skipped (opt-out, frecuencia)

    // Trackear en memoria
    activeCampaigns.set(String(campaign._id), {
      total: contacts.length,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      status: 'processing'
    });

    for (let i = 0; i < contacts.length; i++) {
      // Verificar si la campaña fue pausada
      campaign = await db.collection('campaigns').findOne({ _id: campaign._id });
      if (campaign.status === 'paused') {
        activeCampaigns.set(String(campaign._id), {
          ...activeCampaigns.get(String(campaign._id)),
          status: 'paused'
        });
        console.log(`Campaign ${campaignId} paused at message ${i}`);
        return; // Salir sin marcar como completada
      }

      const contact = contacts[i];
      
      try {
        // 🚨 CRÍTICO: Validar que no haya hecho opt-out durante la campaña
        const recentOptOut = await db.collection('opt_outs').findOne({ numero: contact.numero });
        if (recentOptOut) {
          console.log(`⚠️ Skipping ${contact.numero}: opted out during campaign`);
          skippedCount++;
          continue; // Saltar este contacto
        }

        const result = await sendSingleMessage(
          db,
          String(campaign.userId),
          contact.numero,
          template,
          batchId,
          creds
        );

        if (result.skipped) {
          skippedCount++;
          console.log(`⚠️ Skipped ${contact.numero}: ${result.error}`);
        } else if (result.success) {
          successCount++;
        } else {
          failedCount++;
        }

        // Actualizar progreso en DB cada 10 mensajes
        if (i % 10 === 0 || i === contacts.length - 1) {
          await db.collection('campaigns').updateOne(
            { _id: campaign._id },
            { 
              $set: { 
                processed: i + 1,
                successCount,
                failedCount,
                skippedCount, // 🚨 NUEVO
                lastProcessedAt: new Date().toISOString()
              } 
            }
          );

          // Actualizar en memoria
          activeCampaigns.set(String(campaign._id), {
            total: contacts.length,
            processed: i + 1,
            success: successCount,
            failed: failedCount,
            skipped: skippedCount, // 🚨 NUEVO
            status: 'processing'
          });
        }

        // Delay progresivo basado en volumen
        const delay = i < 100 ? 1200 : i < 500 ? 800 : i < 2000 ? 600 : 400;
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (err) {
        console.error(`Error sending to ${contact.numero}:`, err);
        failedCount++;
        
        // Si hay muchos errores seguidos, pausar para investigar
        if (failedCount > 50 && failedCount > successCount * 0.5) {
          await db.collection('campaigns').updateOne(
            { _id: campaign._id },
            { 
              $set: { 
                status: 'paused',
                error: 'too_many_failures',
                processed: i + 1,
                successCount,
                failedCount,
                skippedCount, // 🚨 NUEVO
                pausedAt: new Date().toISOString()
              } 
            }
          );
          console.warn(`Campaign ${campaignId} auto-paused due to high failure rate`);
          return;
        }
      }
    }

    // Marcar como completada
    await db.collection('campaigns').updateOne(
      { _id: campaign._id },
      { 
        $set: { 
          status: 'completed',
          processed: contacts.length,
          successCount,
          failedCount,
          skippedCount, // 🚨 NUEVO
          completedAt: new Date().toISOString()
        } 
      }
    );

    // Remover de memoria
    activeCampaigns.delete(String(campaign._id));
    console.log(`Campaign ${campaignId} completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`);

  } catch (err) {
    console.error(`Campaign ${campaignId} processing error:`, err);
    await db.collection('campaigns').updateOne(
      { _id: campaign._id },
      { 
        $set: { 
          status: 'failed',
          error: String(err),
          completedAt: new Date().toISOString()
        } 
      }
    );
    activeCampaigns.delete(String(campaign._id));
  }
}

// Crear campaña en background
app.post('/api/campaigns/create', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const { contacts, template, campaignName, batchId } = req.body || {};

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'contacts_required' });
    }

    if (contacts.length > 10000) {
      return res.status(400).json({ error: 'too_many_contacts', max: 10000 });
    }

    if (!template || typeof template !== 'object') {
      return res.status(400).json({ error: 'template_required' });
    }

    // Verificar credenciales
    const user = await db.collection('users').findOne({ _id: userIdObj });
    const creds = user?.metaCreds || {};
    if (!creds.accessToken || !creds.phoneNumberId) {
      return res.status(400).json({ error: 'missing_meta_credentials' });
    }

    // 💰 VALIDAR CRÉDITOS ANTES DE CREAR CAMPAÑA
    const userCredits = user?.credits || 0;
    const requiredCredits = contacts.length;
    
    if (userCredits < requiredCredits) {
      return res.status(402).json({ 
        error: 'insufficient_credits',
        message: `Necesitas ${requiredCredits} créditos pero solo tienes ${userCredits}`,
        required: requiredCredits,
        available: userCredits,
        missing: requiredCredits - userCredits
      });
    }

    // Crear documento de campaña
    const campaign = {
      userId: userIdObj,
      campaignName: campaignName || `Campaña ${new Date().toLocaleString('es-CO')}`,
      batchId: batchId || crypto.randomBytes(16).toString('hex'),
      template,
      contacts,
      status: 'pending',
      processed: 0,
      successCount: 0,
      failedCount: 0,
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection('campaigns').insertOne(campaign);
    const campaignId = String(result.insertedId);

    // Iniciar procesamiento en background (no bloquea la respuesta)
    setImmediate(() => processCampaignBackground(campaignId));

    return res.json({
      ok: true,
      campaignId,
      status: 'pending',
      total: contacts.length,
      message: 'Campaña creada y procesándose en segundo plano'
    });

  } catch (err) {
    console.error('/api/campaigns/create error', err);
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});

// Obtener estado de una campaña
app.get('/api/campaigns/:id/status', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const campaignId = req.params.id;
    
    // Primero verificar en memoria (más rápido)
    const memStatus = activeCampaigns.get(campaignId);
    
    // Luego obtener de DB (fuente de verdad)
    const campaign = await db.collection('campaigns').findOne(
      { _id: new ObjectId(campaignId), userId: new ObjectId(req.userId) },
      { projection: { contacts: 0 } } // No enviar lista completa de contactos
    );

    if (!campaign) {
      return res.status(404).json({ error: 'campaign_not_found' });
    }

    return res.json({
      ...campaign,
      inMemory: memStatus || null,
      _id: String(campaign._id),
      userId: String(campaign.userId)
    });

  } catch (err) {
    console.error('/api/campaigns/:id/status error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Listar campañas del usuario
app.get('/api/campaigns', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const status = req.query.status ? String(req.query.status) : null;
    
    const filter = { userId: new ObjectId(req.userId) };
    if (status) filter.status = status;

    const campaigns = await db.collection('campaigns')
      .find(filter, { projection: { contacts: 0, template: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return res.json({
      data: campaigns.map(c => ({
        ...c,
        _id: String(c._id),
        userId: String(c.userId),
        contactsCount: c.contacts?.length || 0
      }))
    });

  } catch (err) {
    console.error('/api/campaigns error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Pausar campaña
app.post('/api/campaigns/:id/pause', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const campaignId = req.params.id;

    const campaign = await db.collection('campaigns').findOne({
      _id: new ObjectId(campaignId),
      userId: new ObjectId(req.userId)
    });

    if (!campaign) {
      return res.status(404).json({ error: 'campaign_not_found' });
    }

    if (campaign.status !== 'processing' && campaign.status !== 'pending') {
      return res.status(400).json({ error: 'campaign_not_active' });
    }

    await db.collection('campaigns').updateOne(
      { _id: campaign._id },
      { $set: { status: 'paused', pausedAt: new Date().toISOString() } }
    );

    return res.json({ ok: true, status: 'paused' });

  } catch (err) {
    console.error('/api/campaigns/:id/pause error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Reanudar campaña
app.post('/api/campaigns/:id/resume', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const campaignId = req.params.id;

    const campaign = await db.collection('campaigns').findOne({
      _id: new ObjectId(campaignId),
      userId: new ObjectId(req.userId)
    });

    if (!campaign) {
      return res.status(404).json({ error: 'campaign_not_found' });
    }

    if (campaign.status !== 'paused') {
      return res.status(400).json({ error: 'campaign_not_paused' });
    }

    // Reanudar desde donde se quedó
    const remainingContacts = campaign.contacts.slice(campaign.processed || 0);
    
    await db.collection('campaigns').updateOne(
      { _id: campaign._id },
      { 
        $set: { 
          status: 'pending',
          contacts: remainingContacts,
          resumedAt: new Date().toISOString()
        } 
      }
    );

    // Reiniciar procesamiento
    setImmediate(() => processCampaignBackground(campaignId));

    return res.json({ ok: true, status: 'processing', remaining: remainingContacts.length });

  } catch (err) {
    console.error('/api/campaigns/:id/resume error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Cancelar campaña
app.post('/api/campaigns/:id/cancel', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const campaignId = req.params.id;

    const campaign = await db.collection('campaigns').findOne({
      _id: new ObjectId(campaignId),
      userId: new ObjectId(req.userId)
    });

    if (!campaign) {
      return res.status(404).json({ error: 'campaign_not_found' });
    }

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      return res.status(400).json({ error: 'campaign_already_finished' });
    }

    await db.collection('campaigns').updateOne(
      { _id: campaign._id },
      { $set: { status: 'cancelled', cancelledAt: new Date().toISOString() } }
    );

    activeCampaigns.delete(campaignId);

    return res.json({ ok: true, status: 'cancelled' });

  } catch (err) {
    console.error('/api/campaigns/:id/cancel error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Recuperar campañas pendientes al reiniciar el servidor
(async function recoverPendingCampaigns() {
  try {
    const db = await getDb();
    const pending = await db.collection('campaigns')
      .find({ status: { $in: ['pending', 'processing'] } })
      .toArray();
    
    for (const campaign of pending) {
      const campaignId = String(campaign._id);
      console.log(`Recovering campaign ${campaignId}...`);
      setImmediate(() => processCampaignBackground(campaignId));
    }
    
    if (pending.length > 0) {
      console.log(`Recovered ${pending.length} pending campaigns`);
    }
  } catch (err) {
    console.error('Error recovering campaigns:', err);
  }
})();

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

// --- 🚨 ENDPOINTS DE OPT-OUT (Gestión de lista de exclusión) ---
// Listar contactos con opt-out
app.get('/api/opt-outs', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const limit = Math.min(Number(req.query.limit || 100), 500);
    
    const optOuts = await db.collection('opt_outs')
      .find({ 
        $or: [
          { userId: userIdObj },
          { userId: { $exists: false } } // Incluir globales
        ]
      })
      .sort({ optOutDate: -1 })
      .limit(limit)
      .toArray();
    
    return res.json({ data: optOuts, total: optOuts.length });
  } catch (err) {
    console.error('/api/opt-outs GET error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Agregar opt-out manualmente (por si usuario lo solicita por otro canal)
app.post('/api/opt-outs', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const { numero, reason } = req.body || {};
    
    if (!numero || typeof numero !== 'string') {
      return res.status(400).json({ error: 'numero_required' });
    }
    
    const numeroClean = String(numero).replace(/\D+/g, '');
    if (!numeroClean) {
      return res.status(400).json({ error: 'invalid_numero' });
    }
    
    await db.collection('opt_outs').updateOne(
      { userId: userIdObj, numero: numeroClean },
      { 
        $set: { 
          numero: numeroClean,
          userId: userIdObj,
          optOutDate: new Date().toISOString(),
          reason: reason || 'manual_entry',
          source: 'manual'
        } 
      },
      { upsert: true }
    );
    
    // Marcar contacto como opt-out
    await db.collection('contacts').updateMany(
      { userId: userIdObj, numero: numeroClean },
      { $set: { optedOut: true, optOutDate: new Date().toISOString() } }
    );
    
    return res.json({ ok: true, numero: numeroClean });
  } catch (err) {
    console.error('/api/opt-outs POST error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Remover opt-out (si usuario solicita reactivación y da consentimiento nuevamente)
app.delete('/api/opt-outs/:numero', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const numero = String(req.params.numero).replace(/\D+/g, '');
    
    if (!numero) {
      return res.status(400).json({ error: 'invalid_numero' });
    }
    
    const result = await db.collection('opt_outs').deleteOne({ userId: userIdObj, numero });
    
    // Actualizar contactos
    await db.collection('contacts').updateMany(
      { userId: userIdObj, numero },
      { $set: { optedOut: false }, $unset: { optOutDate: '' } }
    );
    
    return res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('/api/opt-outs DELETE error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Verificar si un número tiene opt-out
app.get('/api/opt-outs/check/:numero', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const numero = String(req.params.numero).replace(/\D+/g, '');
    
    if (!numero) {
      return res.status(400).json({ error: 'invalid_numero' });
    }
    
    const optOut = await db.collection('opt_outs').findOne({
      numero,
      $or: [
        { userId: userIdObj },
        { userId: { $exists: false } }
      ]
    });
    
    return res.json({ hasOptOut: !!optOut, optOut: optOut || null });
  } catch (err) {
    console.error('/api/opt-outs/check error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// --- 🚨 QUALITY RATING & TIER LIMITS ---
// Consultar Quality Rating y límites de la cuenta WhatsApp
app.get('/api/wa/quality-rating', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    const creds = user?.metaCreds || {};
    
    if (!creds.phoneNumberId || !creds.accessToken) {
      return res.status(400).json({ error: 'missing_meta_credentials' });
    }

    // Consultar información del phone number (incluye quality_rating)
    const url = `https://graph.facebook.com/v22.0/${creds.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status`;
    const r = await fetch(url, { 
      headers: { Authorization: `Bearer ${creds.accessToken}` } 
    });
    
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      let detail;
      try { detail = JSON.parse(text); } catch { detail = text; }
      return res.status(r.status).json({ error: 'graph_error', detail });
    }

    const data = await r.json();
    
    // Guardar en DB para histórico y alertas
    await db.collection('quality_checks').insertOne({
      userId: new ObjectId(req.userId),
      phoneNumberId: creds.phoneNumberId,
      quality_rating: data.quality_rating || 'UNKNOWN',
      messaging_limit_tier: data.messaging_limit_tier || 'TIER_NOT_SET',
      display_phone_number: data.display_phone_number,
      verified_name: data.verified_name,
      checkedAt: new Date().toISOString()
    });

    // 🚨 ALERTAS AUTOMÁTICAS si quality no es GREEN
    if (data.quality_rating && data.quality_rating !== 'GREEN') {
      await db.collection('activities').insertOne({
        userId: new ObjectId(req.userId),
        title: `⚠️ Quality Rating: ${data.quality_rating}`,
        description: `Tu Quality Rating está en ${data.quality_rating}. Revisa tus mensajes para evitar que Meta limite tu cuenta.`,
        type: 'warning',
        timestamp: new Date().toISOString(),
        metadata: { quality_rating: data.quality_rating, source: 'auto_check' }
      });
    }

    return res.json({
      ...data,
      tierLimits: {
        TIER_NOT_SET: '50 conversaciones/día (nuevo)',
        TIER_1: '1,000 conversaciones/día',
        TIER_2: '10,000 conversaciones/día',
        TIER_3: '100,000 conversaciones/día',
        TIER_4: 'Unlimited (nivel enterprise)'
      },
      qualityInfo: {
        GREEN: '✅ Excelente - Sin restricciones',
        YELLOW: '⚠️ Advertencia - Revisa contenido',
        RED: '🚨 Crítico - Límites severos o baneo cercano',
        UNKNOWN: '❓ No disponible - Verificar credenciales'
      }
    });

  } catch (err) {
    console.error('/api/wa/quality-rating error', err);
    return res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});

// Histórico de quality checks
app.get('/api/wa/quality-history', requireUser, async (req, res) => {
  try {
    const db = await getDb();
    const userIdObj = new ObjectId(req.userId);
    const limit = Math.min(Number(req.query.limit || 50), 200);
    
    const history = await db.collection('quality_checks')
      .find({ userId: userIdObj })
      .sort({ checkedAt: -1 })
      .limit(limit)
      .toArray();
    
    return res.json({ data: history });
  } catch (err) {
    console.error('/api/wa/quality-history error', err);
    return res.status(500).json({ error: 'server_error' });
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
    // IMPORTANTE: Usamos statusHistory para contar delivered correctamente
    // Un mensaje que fue delivered Y luego read debe contar en AMBOS
    for (const c of campaigns) {
      const match = { userId: userIdObj, ...(c.campaignId ? { batchId: c.campaignId } : {}) };
      
      // Contar mensajes que ALGUNA VEZ fueron delivered (incluso si ahora están read)
      const deliveredCount = await db.collection('message_events').countDocuments({
        ...match,
        statusHistory: 'delivered'
      });
      
      // Contar mensajes que ALGUNA VEZ fueron read
      const readCount = await db.collection('message_events').countDocuments({
        ...match,
        statusHistory: 'read'
      });
      
      // Contar mensajes con error
      const failedCount = await db.collection('message_events').countDocuments({
        ...match,
        $or: [
          { statusHistory: 'failed' },
          { statusHistory: 'undelivered' }
        ]
      });
      
      // Total de mensajes en esta campaña
      const totalCount = await db.collection('message_events').countDocuments(match);
      
      c['counts'] = {
        delivered: deliveredCount,
        read: readCount,
        failed: failedCount,
        total: totalCount
      };
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
    // Totales usando statusHistory para contar correctamente
    const deliveredCount = await db.collection('message_events').countDocuments({
      userId: userIdObj,
      batchId: id,
      statusHistory: 'delivered'
    });
    
    const readCount = await db.collection('message_events').countDocuments({
      userId: userIdObj,
      batchId: id,
      statusHistory: 'read'
    });
    
    const failedCount = await db.collection('message_events').countDocuments({
      userId: userIdObj,
      batchId: id,
      $or: [
        { statusHistory: 'failed' },
        { statusHistory: 'undelivered' }
      ]
    });
    
    const totalCount = await db.collection('message_events').countDocuments({
      userId: userIdObj,
      batchId: id
    });
    
    const counts = {
      delivered: deliveredCount,
      read: readCount,
      failed: failedCount,
      total: totalCount
    };
    
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

app.listen(port, async () => {
  console.log(`Static server listening on http://localhost:${port}`);
  
  try {
    const db = await getDb();
    
    // 🚨 MIGRACIÓN: Asignar rol "user" a usuarios sin rol
    console.log('🔧 Verificando roles de usuarios...');
    const usersWithoutRole = await db.collection('users').find({ 
      $or: [
        { role: { $exists: false } },
        { role: null }
      ]
    }).toArray();
    
    if (usersWithoutRole.length > 0) {
      console.log(`📋 Encontrados ${usersWithoutRole.length} usuarios sin rol. Asignando rol "user"...`);
      
      for (const user of usersWithoutRole) {
        await db.collection('users').updateOne(
          { _id: user._id },
          { 
            $set: { 
              role: 'user',
              updatedAt: new Date().toISOString()
            } 
          }
        );
        console.log(`   ✅ ${user.email} → role: "user"`);
      }
    } else {
      console.log('✅ Todos los usuarios tienen rol asignado');
    }
    
    // 🚨 CRÍTICO: Inicializar super admin al arrancar el servidor
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@example.com';
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
    
    if (!superAdminPassword) {
      console.warn('⚠️  SUPER_ADMIN_PASSWORD no está configurado. Super admin NO será creado.');
      return;
    }
    
    const existing = await db.collection('users').findOne({ email: superAdminEmail });
    
    if (!existing) {
      // Usar la misma función de hash que usa el sistema de login
      const passwordHash = hashPassword(superAdminPassword);
      
      const superAdminCredits = parseInt(process.env.SUPER_ADMIN_CREDITS) || 999999;
      
      await db.collection('users').insertOne({
        email: superAdminEmail,
        name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
        passwordHash: passwordHash, // 🚨 Usar passwordHash, no password
        role: 'super_admin', // 🚨 Rol máximo
        credits: superAdminCredits, // 🚨 Créditos configurables
        createdAt: new Date().toISOString(),
        lastMessageAt: null,
      });
      
      console.log(`✅ Super admin created: ${superAdminEmail} with ${superAdminCredits} credits`);
    } else {
      console.log(`✅ Super admin already exists: ${superAdminEmail} (role: ${existing.role})`);
    }
  } catch (err) {
    console.error('❌ Error initializing server:', err);
  }
});

