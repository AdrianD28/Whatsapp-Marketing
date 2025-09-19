import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Blob } from 'buffer';

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

app.use('/static', express.static(staticDir));

// Serve frontend `dist` if it exists (SPA fallback to index.html)
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    // If request is for API routes, skip
    if (req.path.startsWith('/api') || req.path.startsWith('/upload') || req.path.startsWith('/resumable-upload') || req.path.startsWith('/upload-media') || req.path.startsWith('/create-template') || req.path.startsWith('/static')) return next();
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

    const initUrl = `https://graph.facebook.com/v19.0/${appId}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${fileSize}&file_type=${encodeURIComponent(fileType)}`;
    const initRes = await fetch(initUrl, { method: 'POST', headers: { Authorization: `OAuth ${token}` } });
    if (!initRes.ok) {
      const text = await initRes.text().catch(() => '');
      return res.status(500).json({ error: 'init failed', detail: text });
    }
    const initJson = await initRes.json();
    // upload session id might be in initJson.id or initJson.upload_session_id
    const uploadId = initJson.id || initJson.upload_session_id;
    if (!uploadId) return res.status(500).json({ error: 'no upload id returned', initJson });

    const uploadUrl = `https://graph.facebook.com/v19.0/${uploadId}`;
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

    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/media`;
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
    STATIC_DIR: present(process.env.STATIC_DIR) ? process.env.STATIC_DIR : '(default /app/server/static)'
  });
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
          const initUrl = `https://graph.facebook.com/v19.0/${appId}/uploads?file_name=${encodeURIComponent(req.file.originalname)}&file_length=${stat.size}&file_type=${encodeURIComponent(req.file.mimetype || 'application/octet-stream')}`;
          const initRes = await fetch(initUrl, { method: 'POST', headers: { Authorization: `OAuth ${accessToken}` } });
          if (initRes.ok) {
            const initJson = await initRes.json();
            const uploadId = initJson.id || initJson.upload_session_id;
            if (uploadId) {
              const uploadUrl = `https://graph.facebook.com/v19.0/${uploadId}`;
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
      const initUrl = `https://graph.facebook.com/v19.0/${appId}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${buffer.length}&file_type=${encodeURIComponent(guessed)}`;
      const initRes = await fetch(initUrl, { method: 'POST', headers: { Authorization: `OAuth ${accessToken}` } });
      if (!initRes.ok) {
        const text = await initRes.text().catch(() => '');
        return res.status(500).json({ error: 'resumable_init_failed', detail: text || initRes.status });
      }
      const initJson = await initRes.json();
      const uploadId = initJson.id || initJson.upload_session_id;
      if (!uploadId) return res.status(500).json({ error: 'no_upload_id_returned', initJson });
      const uploadUrl = `https://graph.facebook.com/v19.0/${uploadId}`;
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
    const createUrl = `https://graph.facebook.com/v19.0/${businessAccountId}/message_templates`;
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
