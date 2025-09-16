import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
const port = process.env.PORT || 5174;

const staticDir = path.join(process.cwd(), 'server', 'static');
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
    const phoneNumberId = req.headers['x-phone-number-id'] || req.body.phoneNumberId;
    const token = req.headers['x-access-token'] || req.body.accessToken;
    if (!phoneNumberId || !token) return res.status(400).json({ error: 'phoneNumberId and accessToken required' });
    if (!req.file) return res.status(400).json({ error: 'file required' });

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);

    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/media`;
    const fetchRes = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => '');
      return res.status(500).json({ error: 'media upload failed', detail: text });
    }
    const json = await fetchRes.json();
    return res.json(json);
  } catch (err) {
    console.error('upload-media error', err);
    return res.status(500).json({ error: 'server error', detail: String(err) });
  }
});

app.get('/', (req, res) => res.send('Static upload server running'));

// Create template server-side: recibe metadata + file opcional y crea la plantilla en Graph API
// Requiere en el servidor: BUSINESS_ACCOUNT_ID y ACCESS_TOKEN (en env vars)
app.post('/create-template', upload.single('file'), async (req, res) => {
  try {
    const accessToken = process.env.ACCESS_TOKEN;
    const businessAccountId = process.env.BUSINESS_ACCOUNT_ID;
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
      if (process.env.APP_ID) {
        try {
          const stat = await fs.promises.stat(filePath);
          const initUrl = `https://graph.facebook.com/v19.0/${process.env.APP_ID}/uploads?file_name=${encodeURIComponent(req.file.originalname)}&file_length=${stat.size}&file_type=${encodeURIComponent(req.file.mimetype || 'application/octet-stream')}`;
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

      // 2) si no handle, subir a /{phone_number_id}/media si PHONE_NUMBER_ID está en env
      if (!handle && process.env.PHONE_NUMBER_ID) {
        try {
          const form = new FormData();
          form.append('messaging_product', 'whatsapp');
          form.append('file', fs.createReadStream(filePath), req.file.originalname);
          const url = `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/media`;
          const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
          if (r.ok) {
            const j = await r.json(); if (j?.id) handle = j.id;
          }
        } catch (err) { console.warn('upload-media server attempt failed', err); }
      }

      // 3) si tenemos handle, inyectarlo en el componente HEADER correspondiente
      if (handle) {
        payload.components = payload.components.map((c) => {
          if (c.type === 'HEADER') return Object.assign({}, c, { example: { header_handle: [handle] } });
          return c;
        });
      } else {
        // fallback: servir URL static y adjuntar preview
        const publicUrl = `${req.protocol}://${req.get('host')}/static/${encodeURIComponent(req.file.filename)}`;
        payload.components = payload.components.map((c) => {
          if (c.type === 'HEADER') return Object.assign({}, c, { example: { header_handle_preview_url: publicUrl } });
          return c;
        });
      }
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
