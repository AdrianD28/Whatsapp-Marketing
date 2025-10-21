import { useState, useCallback } from 'react';
import { ApiCredentials, Template } from '../types';
import toast from 'react-hot-toast';

const META_GRAPH_URL = 'https://graph.facebook.com/v22.0/';

export function useApi(credentials: ApiCredentials | null) {
  const resumableUpload = useCallback(async (file: File): Promise<string> => {
    if (!credentials?.appId) throw new Error('Falta App ID para subida reanudable');
    const token = credentials.accessToken;
    console.debug('[useApi] resumableUpload start', { name: file.name, size: file.size, type: file.type });
  const initUrl = `https://graph.facebook.com/v22.0/${credentials.appId}/uploads?file_name=${encodeURIComponent(file.name)}&file_length=${file.size}&file_type=${encodeURIComponent(file.type || 'application/octet-stream')}`;
    const initRes = await fetch(initUrl, { method: 'POST', headers: { Authorization: `OAuth ${token}` } });
    if (!initRes.ok) {
      const t = await initRes.text().catch(() => '');
      console.error('[useApi] resumableUpload init failed', { status: initRes.status, text: t });
      throw new Error(`Fallo al iniciar subida reanudable: ${t || initRes.status}`);
    }
    const initJson = await initRes.json();
    console.debug('[useApi] resumableUpload init response', initJson);
    const uploadId = initJson.id as string; // 'upload:<UPLOAD_SESSION_ID>'
  const uploadUrl = `https://graph.facebook.com/v22.0/${uploadId}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, 'file_offset': '0' },
      body: file,
    });
    if (!uploadRes.ok) {
      const t = await uploadRes.text().catch(() => '');
      console.error('[useApi] resumableUpload upload failed', { status: uploadRes.status, text: t });
      throw new Error(`Fallo al subir archivo: ${t || uploadRes.status}`);
    }
    const upJson = await uploadRes.json();
    console.debug('[useApi] resumableUpload finish response', upJson);
    // upJson.h is Uploaded File Handle; templates expect handle in example.header_handle
    const handle = upJson.h as string; // e.g., '2:...' or '4:...'
    return handle;
  }, [credentials]);
  const [loading, setLoading] = useState(false);

  const makeRequest = useCallback(async (inputUrl: string, options: RequestInit = {}) => {
    if (!credentials) {
      throw new Error('Credenciales de API no configuradas');
    }

    const method = String(options.method || 'GET').toUpperCase();
    const isGraph = inputUrl.startsWith('https://graph.facebook.com/');
    let finalUrl = inputUrl;
    const headers: Record<string, string> = { ...(options.headers as any) };

    if (method === 'GET') {
      // Evitar preflight CORS con Graph: no enviar Authorization ni Content-Type en GET.
      // En su lugar, pasar el token como query param 'access_token'.
      if (isGraph) {
        // No dupliques access_token si ya viene en la URL (por ejemplo, paging.next de Graph)
        if (!/([?&])access_token=/.test(finalUrl)) {
          const sep = finalUrl.includes('?') ? '&' : '?';
          finalUrl = `${finalUrl}${sep}access_token=${encodeURIComponent(credentials.accessToken)}`;
        }
      } else {
        headers['Authorization'] = `Bearer ${credentials.accessToken}`;
      }
      // No establecer Content-Type en GET
      if (headers['Content-Type']) delete headers['Content-Type'];
    } else {
      // Para POST/DELETE/etc mantenemos Authorization
      if (!headers['Authorization']) headers['Authorization'] = `Bearer ${credentials.accessToken}`;
      // Solo establecer Content-Type si el body no es FormData y no está ya definido
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      if (!isFormData && options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(finalUrl, {
      ...options,
      headers,
      // Asegurar método normalizado
      method,
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      let authExpired = false;
      let errorDetail = null;
      try {
        const json = await response.json();
        const e = json.error || {};
        
        // Si el error viene del servidor con detail, guardarlo
        if (json.detail) {
          errorDetail = json.detail;
        }
        
        const parts = [e.message];
        if (e.error_user_title || e.error_user_msg) {
          parts.push(`${e.error_user_title ?? 'Error'}: ${e.error_user_msg ?? ''}`.trim());
        }
        if (e.error_subcode) parts.push(`subcode: ${e.error_subcode}`);
        if (e.type) parts.push(`type: ${e.type}`);
        if (e.error_data?.details) parts.push(`details: ${e.error_data.details}`);
        message = parts.filter(Boolean).join(' | ') || message;
        // Detectar expiración de token (code 190, subcode 463) o mensaje
        if (e.code === 190 || e.error_subcode === 463 || /Session has expired/i.test(e.message || '')) {
          authExpired = true;
        }
      } catch {
        // ignore parse error
      }
      const err: any = new Error(message);
      if (authExpired) err.authExpired = true;
      if (errorDetail) err.detail = errorDetail;
      throw err;
    }

    return response.json();
  }, [credentials]);

  const fetchTemplates = useCallback(async (): Promise<Template[]> => {
    if (!credentials) return [];
    
    setLoading(true);
    try {
      // 1) Intentar directo a Graph (comportamiento anterior)
      try {
        const url = `${META_GRAPH_URL}${credentials.businessAccountId}/message_templates?fields=name,status,category,language,components&limit=200`;
        const data = await makeRequest(url);
        let items: Template[] = data.data || [];
        const next = data.paging?.next as string | undefined;
        if (next && items.length < 200) {
          try {
            const more = await makeRequest(next);
            if (Array.isArray(more?.data)) items = items.concat(more.data);
          } catch { /* ignorar */ }
        }
        return items;
      } catch (directErr) {
        // 2) Si directo falla (CORS/red/bloqueadores), intentar vía backend para evitar CORS
        try {
          const proxyUrl = `/api/meta/templates?limit=200&accessToken=${encodeURIComponent(credentials.accessToken)}&businessAccountId=${encodeURIComponent(credentials.businessAccountId)}`;
          const proxyRes = await fetch(proxyUrl);
          if (proxyRes.ok) {
            const pData = await proxyRes.json();
            let items: Template[] = pData.data || [];
            const nextUrl = pData.paging?.next as string | undefined;
            if (nextUrl && items.length < 200) {
              try {
                const after = encodeURIComponent(pData.paging.cursors?.after || '');
                const nextRes = await fetch(`/api/meta/templates?limit=200&after=${after}&accessToken=${encodeURIComponent(credentials.accessToken)}&businessAccountId=${encodeURIComponent(credentials.businessAccountId)}`);
                if (nextRes.ok) {
                  const more = await nextRes.json();
                  if (Array.isArray(more?.data)) items = items.concat(more.data);
                }
              } catch {}
            }
            return items;
          } else {
            const t = await proxyRes.text().catch(() => '');
            console.warn('[useApi] backend /api/meta/templates no disponible', proxyRes.status, t);
            throw directErr; // forzar manejo por el catch externo
          }
        } catch (proxyErr) {
          console.warn('[useApi] proxy backend también falló', proxyErr);
          throw directErr; // re-lanzar el error original
        }
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      // Si el token expiró no mostramos toast aquí; dejamos que la capa superior fuerce re-login sin ruido.
      if ((error as any)?.authExpired) {
        console.warn('[useApi] Token expirado detectado en fetchTemplates');
        throw error; // Propagar para que App.tsx maneje logout silencioso
      }
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al cargar plantillas: ${msg}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, [credentials, makeRequest]);

  const uploadMediaFromUrl = useCallback(async (url: string, mimeHint?: string): Promise<string> => {
    if (!credentials) throw new Error('Credenciales no configuradas');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('link', url);
    const ext = url.toLowerCase();
    const hint = mimeHint || (ext.endsWith('.jpg') || ext.endsWith('.jpeg') ? 'image/jpeg' : ext.endsWith('.png') ? 'image/png' : ext.endsWith('.mp4') ? 'video/mp4' : ext.endsWith('.pdf') ? 'application/pdf' : undefined);
    if (hint) form.append('type', hint);

    const res = await fetch(`${META_GRAPH_URL}${credentials.phoneNumberId}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
      body: form,
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try { const j = await res.json(); message = j.error?.message || message; } catch {}
      throw new Error(`Fallo al subir imagen: ${message}`);
    }
    const json = await res.json();
    return json.id as string;
  }, [credentials]);

  const uploadMediaFromFile = useCallback(async (file: File): Promise<string> => {
    if (!credentials) throw new Error('Credenciales no configuradas');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', file, file.name);
    const res = await fetch(`${META_GRAPH_URL}${credentials.phoneNumberId}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
      body: form,
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try { const j = await res.json(); message = j.error?.message || message; } catch {}
      throw new Error(`Fallo al subir imagen: ${message}`);
    }
    const json = await res.json();
    return json.id as string;
  }, [credentials]);

  const createTemplate = useCallback(async (templateData: any) => {
    if (!credentials) throw new Error('Credenciales no configuradas');
    
    setLoading(true);
    try {
      const url = `${META_GRAPH_URL}${credentials.businessAccountId}/message_templates`;

      // Clonar datos de entrada para poder mutar
      let payload = { ...templateData };
      console.debug('[useApi] createTemplate input data', payload);

      // Normalizar TTL
      if (payload.ttl) {
        payload.message_send_ttl_seconds = payload.ttl;
        delete payload.ttl;
      }

      // Intentar PRIMERO vía servidor `/create-template` para mantener secretos del lado servidor
      // - Si hay archivo: enviar multipart con `metadata` y `file`
      // - Si no hay archivo: enviar solo `metadata`
      try {
  const serverForm = new FormData();
  const hasFile = Boolean(payload.headerMediaFile?.file);
  // Remover hints locales que el servidor no espera (conservamos headerMediaUrl para que el server la procese)
  const metadataOnly = { ...payload };
  if (metadataOnly.headerMediaFile) delete (metadataOnly as any).headerMediaFile;
        serverForm.append('metadata', JSON.stringify(metadataOnly));
        if (hasFile) {
          const { file } = payload.headerMediaFile as { file: File, format: 'IMAGE'|'VIDEO'|'DOCUMENT' };
          serverForm.append('file', file, file.name);
        }
        // Añadir credenciales como campos para el servidor (multi-tenant)
        serverForm.append('accessToken', credentials.accessToken);
        serverForm.append('businessAccountId', credentials.businessAccountId);
        if (credentials.appId) serverForm.append('appId', credentials.appId);
        serverForm.append('phoneNumberId', credentials.phoneNumberId);
        const serverRes = await fetch('/create-template', {
          method: 'POST',
          body: serverForm,
          headers: {
            'x-access-token': credentials.accessToken,
            'x-business-account-id': credentials.businessAccountId,
            ...(credentials.appId ? { 'x-app-id': credentials.appId } : {}),
            'x-phone-number-id': credentials.phoneNumberId,
          }
        });
        if (!serverRes.ok) {
          const txt = await serverRes.text().catch(() => '');
          throw new Error(`Servidor respondió ${serverRes.status}: ${txt}`);
        }
        const serverJson = await serverRes.json();
        console.debug('[useApi] server /create-template response', serverJson);
        toast.success('Plantilla creada exitosamente');
        return serverJson;
      } catch (serverErr) {
        console.warn('[useApi] servidor /create-template falló, se usa fallback cliente:', serverErr);
      }

      // FALLBACK CLIENTE: comportamiento anterior
      // 1) Si hay archivo, obtener handle con resumable o /media y adjuntar en example.header_handle
      if (payload.headerMediaFile) {
        const { file, format } = payload.headerMediaFile as { file: File, format: 'IMAGE'|'VIDEO'|'DOCUMENT' };
        let handleOrId: string | null = null;
        try {
          handleOrId = await resumableUpload(file);
          console.debug('[useApi] resumableUpload returned handle', handleOrId);
        } catch (e) {
          console.warn('[useApi] resumableUpload failed, falling back to media upload:', e);
          handleOrId = await uploadMediaFromFile(file);
          console.debug('[useApi] uploadMediaFromFile returned id', handleOrId);
        }
        payload.components = (payload.components || []).map((c: any) => {
          if (c.type === 'HEADER' && c.format === format) {
            return { ...c, example: { header_handle: [handleOrId] } };
          }
          return c;
        });
        delete (payload as any).headerMediaFile;
      } else if (payload.headerMediaUrl) {
        // 2) Si hay URL, subirla a /media y adjuntar id
        const { url: mediaUrl, format } = payload.headerMediaUrl as { url: string, format: 'IMAGE'|'VIDEO'|'DOCUMENT' };
        const mime = format === 'IMAGE' ? undefined : format === 'VIDEO' ? 'video/mp4' : 'application/pdf';
        const mediaId = await uploadMediaFromUrl(mediaUrl, mime);
        console.debug('[useApi] uploadMediaFromUrl returned id', mediaId);
        payload.components = (payload.components || []).map((c: any) => {
          if (c.type === 'HEADER' && c.format === format) {
            return { ...c, example: { header_handle: [mediaId] } };
          }
          return c;
        });
        delete (payload as any).headerMediaUrl;
      }

      console.debug('[useApi] createTemplate payload (fallback)', payload);
      const result = await makeRequest(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      console.debug('[useApi] createTemplate response', result);
      toast.success('Plantilla creada exitosamente');
      return result;
    } catch (error: any) {
      const raw = error instanceof Error ? error.message : String(error ?? 'Error desconocido');
      const normalized = raw || 'Error desconocido';
      
      // Extraer información detallada del error si viene del servidor
      let errorDetail = null;
      try {
        // Si el error es del servidor /create-template
        if (error.message && error.message.includes('Servidor respondió')) {
          const match = error.message.match(/(\d+): (.+)/);
          if (match) {
            try {
              errorDetail = JSON.parse(match[2]);
            } catch {}
          }
        }
        // Si el error ya tiene detail (makeRequest lo agregó)
        if (error.detail) {
          errorDetail = error.detail;
        }
      } catch {}
      
      if (/2388023/.test(normalized) || /Se está eliminando el idioma/i.test(normalized) || /Spanish \(SPA\)/i.test(normalized)) {
        toast.error('Meta bloquea re-crear el mismo idioma de una plantilla en eliminación. Usa otro nombre (p. ej. _v2) u otro locale (es_MX/es_LA) o espera 4 semanas.');
      } else {
        // No mostramos toast aquí, dejamos que la capa superior maneje el error
        console.error('[useApi] createTemplate error:', error, errorDetail);
      }
      
      // Lanzar error con detalles para que la UI pueda mostrarlo
      throw errorDetail ? { ...error, detail: errorDetail } : error;
    } finally {
      setLoading(false);
    }
  }, [credentials, makeRequest, uploadMediaFromUrl, uploadMediaFromFile]);

  const sendMessage = useCallback(async (to: string, templateName: string, language: string, parameters?: any[], namespace?: string, options?: { batchId?: string }) => {
    if (!credentials) throw new Error('Credenciales no configuradas');

    // Construir objeto de plantilla con la forma mínima que Meta espera.
    // Importante: NO incluir 'policy' ni 'recipient_type' pues pueden causar rechazo silencioso en algunas cuentas.
    const templateObj: any = {
      name: templateName,
      language: { code: language }, // 'policy' no es necesario para envío
    };
    if (namespace) templateObj.namespace = namespace;

    // Soporta parameters para body/header/button.
    // Parámetros de entrada vienen en formato interno (header-text, image, text, button...).
    if (Array.isArray(parameters) && parameters.length > 0) {
      const headerParams: any[] = [];
      const bodyParams: any[] = [];
      const buttonComps: any[] = [];
      for (const p of parameters) {
        try {
          if (p?.type === 'image' && (p.image?.link || p.image?.id)) {
            const img: any = {};
            if (p.image.link) img.link = p.image.link;
            if (p.image.id) img.id = p.image.id;
            headerParams.push({ type: 'image', image: img });
          } else if (p?.type === 'header-text' && typeof p.text === 'string') {
            headerParams.push({ type: 'text', text: p.text });
          } else if (p?.type === 'text' && typeof p.text === 'string') {
            bodyParams.push({ type: 'text', text: p.text });
          } else if (p?.type === 'button' && p.sub_type === 'url' && (p.text || (p.parameters && p.parameters[0]?.text))) {
            const index = String(p.index ?? 0);
            const paramText = p.text ?? p.parameters[0]?.text;
            buttonComps.push({ type: 'button', sub_type: 'url', index, parameters: [{ type: 'text', text: paramText }] });
          }
        } catch (e) {
          console.warn('[sendMessage] parámetro ignorado por formato inesperado', p, e);
        }
      }
      const components: any[] = [];
      if (headerParams.length > 0) components.push({ type: 'header', parameters: headerParams });
      if (bodyParams.length > 0) components.push({ type: 'body', parameters: bodyParams });
      for (const b of buttonComps) components.push(b);
      if (components.length > 0) templateObj.components = components; // Solo incluir si no está vacío
    }

    const messagePayload: any = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: templateObj,
    };

    // Debug opcional (no afecta producción, se puede quitar luego)
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[sendMessage] payload', JSON.stringify(messagePayload));
    }
    // 1) Intentar vía backend para logging centralizado y evitar exponer detalles en el cliente.
    try {
      const userToken = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (userToken) {
        const backendRes = await fetch('/api/wa/send-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
          body: JSON.stringify({ to, template: templateObj, batchId: options?.batchId })
        });
        if (backendRes.ok) {
          return backendRes.json();
        } else {
          const txt = await backendRes.text().catch(() => '');
          console.warn('[sendMessage] backend /api/wa/send-template fallo, fallback directo', backendRes.status, txt);
          if (/missing_meta_credentials/.test(txt)) throw new Error('Credenciales Meta faltantes en servidor');
        }
      } else {
        console.warn('[sendMessage] No hay auth_token de usuario, salto backend y uso Graph directo');
      }
    } catch (e) {
      console.warn('[sendMessage] error usando backend, fallback a Graph directo', e);
    }

    // 2) Fallback directo (mismo formato anterior)
    const url = `${META_GRAPH_URL}${credentials.phoneNumberId}/messages`;
    return makeRequest(url, {
      method: 'POST',
      body: JSON.stringify(messagePayload),
    });
  }, [credentials, makeRequest]);

  return {
    loading,
    fetchTemplates,
    createTemplate,
    deleteTemplate: useCallback(async (tpl: { id?: string; name: string }) => {
      if (!credentials) throw new Error('Credenciales no configuradas');
      setLoading(true);
      try {
        // Solo usar endpoint oficial por nombre
        const userToken = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const r = await fetch(`/api/meta/templates?name=${encodeURIComponent(tpl.name)}&accessToken=${encodeURIComponent(credentials.accessToken)}&businessAccountId=${encodeURIComponent(credentials.businessAccountId)}`, {
          method: 'DELETE',
          headers: userToken ? { Authorization: `Bearer ${userToken}` } : {}
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.detail?.error?.message || 'Error al eliminar plantilla');
        toast.success('Plantilla eliminada');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        toast.error(`Error al eliminar plantilla: ${message}`);
        throw error;
      } finally {
        setLoading(false);
      }
    }, [credentials]),
    sendMessage,
  };
}