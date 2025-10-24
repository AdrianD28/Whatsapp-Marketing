# 📱 Configuración de Chatwoot para WhatsApp con Multimedia

## 🔧 Problema
Chatwoot no puede enviar archivos multimedia (audios, imágenes, videos) porque intenta enviar links directos a WhatsApp, pero WhatsApp Cloud API requiere que los archivos se suban primero para obtener un `media_id`.

## ✅ Solución: Usar Proxy de WhatsApp API

He creado un proxy completo en tu servidor que intercepta las llamadas de Chatwoot a WhatsApp y maneja correctamente los archivos multimedia.

---

## 🚀 Configuración (5 minutos)

### **Paso 1: Acceder a la configuración de Chatwoot**

1. Ve a **Settings** → **Inboxes** → **Tu WhatsApp Inbox**
2. Click en **Settings** (el ícono de engranaje)
3. Ve a la pestaña **Configuration**

### **Paso 2: Configurar el Proxy**

Busca el campo que dice **"API Provider"** o **"WhatsApp Business Account ID"**. Dependiendo de tu versión de Chatwoot, puede estar en diferentes lugares.

#### **Opción A: Si Chatwoot permite configurar API Base URL**

Algunos Chatwoot permiten cambiar la URL base de la API. Busca un campo llamado:
- **API Base URL**
- **Custom API Endpoint**  
- **Provider URL**

Si lo encuentras, cámbialo de:
```
https://graph.facebook.com
```

A:
```
https://app-whatsapp-marketing-whatsapp-masivo.zlrp4i.easypanel.host/api/whatsapp-proxy
```

#### **Opción B: Configurar en base de datos (MÁS CONFIABLE)**

Si no encuentras esa opción en la UI, necesitas configurarlo directamente en la base de datos de Chatwoot:

```bash
# 1. Conectar al contenedor de PostgreSQL de Chatwoot
docker exec -it chatwoot-postgres psql -U chatwoot

# 2. Ver la configuración actual
SELECT id, phone_number, provider_config FROM channel_whatsapp;

# 3. Actualizar la configuración para usar el proxy
UPDATE channel_whatsapp 
SET provider_config = jsonb_set(
  provider_config,
  '{api_base_url}',
  '"https://app-whatsapp-marketing-whatsapp-masivo.zlrp4i.easypanel.host/api/whatsapp-proxy"'
)
WHERE phone_number = '+573229277495';

# 4. Verificar el cambio
SELECT phone_number, provider_config FROM channel_whatsapp;

# 5. Salir
\q
```

#### **Opción C: Modificar archivo de configuración de Chatwoot**

Si tienes acceso al archivo de configuración de Chatwoot:

```yaml
# En docker-compose.yml o .env de Chatwoot
WHATSAPP_CLOUD_BASE_URL=https://app-whatsapp-marketing-whatsapp-masivo.zlrp4i.easypanel.host/api/whatsapp-proxy
```

Luego reinicia Chatwoot:
```bash
docker-compose restart
```

---

## 🧪 Probar la Configuración

### **Test 1: Mensaje de Texto**
1. Abre una conversación en Chatwoot
2. Envía un mensaje de texto simple
3. Deberías ver en los logs de tu servidor:
   ```
   📨 Chatwoot → Proxy: Enviando mensaje
   📤 Proxy → WhatsApp: Enviando mensaje final
   ✅ Mensaje enviado exitosamente: wamid.xxxxx
   ```

### **Test 2: Imagen**
1. En Chatwoot, adjunta una imagen
2. Envía el mensaje
3. Logs esperados:
   ```
   📨 Chatwoot → Proxy: Enviando mensaje { type: 'image' }
   📎 Detectado image con link: https://chatwoot.../image.jpg
   ⬇️ Descargando archivo desde Chatwoot...
   📤 Subiendo image a WhatsApp...
   ✅ Archivo subido exitosamente, media_id: 123456789
   ✅ Mensaje enviado exitosamente
   ```

### **Test 3: Audio/Nota de Voz**
1. Graba una nota de voz en Chatwoot
2. Envía
3. Logs esperados:
   ```
   📨 Chatwoot → Proxy: Enviando mensaje { type: 'audio' }
   📎 Detectado audio con link: https://chatwoot.../audio.ogg
   ⬇️ Descargando archivo desde Chatwoot...
   📤 Subiendo audio a WhatsApp (45678 bytes)...
   ✅ Archivo subido exitosamente, media_id: 987654321
   ✅ Mensaje enviado exitosamente
   ```

---

## 🔍 Verificar que está funcionando

### Método 1: Revisar logs del servidor
```bash
# Si usas Easypanel, ve a Logs
# O si tienes acceso SSH:
docker logs -f whatsapp-marketing --tail=100
```

### Método 2: Revisar en Chatwoot
- Los mensajes multimedia deberían enviarse correctamente
- No deberías ver errores como "Param audio["link"] is not a valid URL"

---

## 🐛 Troubleshooting

### Error: "Authorization header required"
**Causa**: Chatwoot no está enviando el token correctamente al proxy.
**Solución**: Verifica que el Access Token esté configurado en Chatwoot.

### Error: "No se pudo descargar archivo"
**Causa**: El proxy no puede acceder a los archivos de Chatwoot.
**Solución**: 
1. Verifica que los archivos de Chatwoot sean accesibles públicamente
2. O configura autenticación en el proxy si Chatwoot usa URLs privadas

### Los mensajes de texto funcionan pero multimedia no
**Causa**: Chatwoot no está usando el proxy.
**Solución**: Verifica que la configuración del proxy esté correcta (Opción B - base de datos es la más confiable).

### Error: "Error subiendo a WhatsApp: 401"
**Causa**: Token inválido o expirado.
**Solución**: Regenera el Access Token en Meta Business Suite.

---

## 📊 Endpoints del Proxy

El proxy implementa estos endpoints (para compatibilidad total con WhatsApp API):

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/whatsapp-proxy/v22.0/{phone-id}/messages` | POST | Envía mensajes (con manejo de multimedia) |
| `/api/whatsapp-proxy/v22.0/{phone-id}/media` | POST | Sube archivos multimedia |
| `/api/whatsapp-proxy/v22.0/{media-id}` | GET | Obtiene info de un archivo |

---

## � Configuración Completa en Chatwoot

Tu configuración final en Chatwoot debería verse así:

```
Nombre: Whatsapp Universidad Santo Tomas
Proveedor: Nube de WhatsApp
Phone Number ID: 816758121524057
Business Account ID: [Tu WABA ID]
API Access Token: [Tu token de Meta]
API Base URL: https://app-whatsapp-marketing-whatsapp-masivo.zlrp4i.easypanel.host/api/whatsapp-proxy
Webhook URL: https://app-whatsapp-marketing-whatsapp-masivo.zlrp4i.easypanel.host/webhook/whatsapp-proxy
Webhook Verify Token: 43c2b003bb0b4caf208e6efa47b8abb2
```

---

## 🚨 Importante

- ✅ El proxy descarga archivos de Chatwoot automáticamente
- ✅ Los sube a WhatsApp y obtiene media_ids válidos
- ✅ Soporta: images, audio, video, documents
- ✅ Logs detallados para debugging
- ✅ Manejo de errores robusto

---

## 📚 Recursos

- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Chatwoot Installation](https://www.chatwoot.com/docs/self-hosted)
- [Configuración de Chatwoot](https://www.chatwoot.com/docs/product/channels/whatsapp/whatsapp-cloud)
