# 📱 Configuración de Chatwoot para WhatsApp con Multimedia

## 🔧 Problema Actual
Chatwoot no puede enviar archivos multimedia (audios, imágenes, videos) porque necesita configuración adicional para WhatsApp Cloud API.

## ✅ Solución: Configurar WhatsApp Cloud en Chatwoot

### 1️⃣ **Obtener tus credenciales de Meta**

Necesitas estos datos de tu cuenta de Meta Business:

- **Phone Number ID**: `816758121524057` ✅ (ya lo tienes)
- **WhatsApp Business Account ID (WABA ID)**: Ve a Meta Business Suite → Settings → WhatsApp accounts
- **Access Token**: El token que ya tienes configurado en Chatwoot

### 2️⃣ **Configurar Chatwoot**

#### Opción A: Configurar manualmente en la base de datos de Chatwoot

Si Chatwoot no muestra los campos necesarios en la UI, necesitas configurarlos directamente en la base de datos:

```sql
-- Conectar a la base de datos de Chatwoot
-- Buscar tu inbox de WhatsApp
SELECT * FROM channel_whatsapp WHERE phone_number = '+573229277495';

-- Actualizar con tus credenciales
UPDATE channel_whatsapp 
SET 
  provider = 'whatsapp_cloud',
  phone_number_id = '816758121524057',
  business_account_id = 'TU_WABA_ID_AQUI'
WHERE phone_number = '+573229277495';
```

#### Opción B: Reconfigurar el canal desde cero

1. **Elimina el canal actual** en Chatwoot
2. **Crea un nuevo canal** seleccionando "WhatsApp Cloud"
3. Durante la configuración, ingresa:
   - **Phone Number ID**: `816758121524057`
   - **Business Account ID**: Tu WABA ID
   - **API Access Token**: Tu token de Meta
   - **Webhook Callback URL**: `https://app-whatsapp-marketing-whatsapp-masivo.zlrp4i.easypanel.host/webhook/whatsapp-proxy`
   - **Webhook Verify Token**: `43c2b003bb0b4caf208e6efa47b8abb2`

### 3️⃣ **Verificar configuración en Meta**

Ve a Meta Business Suite → WhatsApp → Configuration:

1. **Webhook Configuration**:
   - URL: `https://app-whatsapp-marketing-whatsapp-masivo.zlrp4i.easypanel.host/webhook/whatsapp-proxy`
   - Verify Token: `43c2b003bb0b4caf208e6efa47b8abb2`
   - Suscríbete a: `messages`, `message_status`, `messaging_postbacks`

2. **Permissions**:
   - Asegúrate de que el Access Token tenga permisos: `whatsapp_business_messaging`, `whatsapp_business_management`

### 4️⃣ **Variables de entorno en tu servidor**

Asegúrate de tener configurado en Easypanel:

```bash
PHONE_NUMBER_ID=816758121524057
ACCESS_TOKEN=tu_token_de_meta_aqui
WEBHOOK_VERIFY_TOKEN=43c2b003bb0b4caf208e6efa47b8abb2
CHATWOOT_WEBHOOK_URL=https://levitze-chatwoot.zlrp4i.easypanel.host/webhooks/whatsapp/+573229277495
```

## 🧪 Probar la configuración

### Test 1: Enviar mensaje de texto
Desde Chatwoot, envía un mensaje de texto simple. Deberías ver en los logs del servidor:
```
✅ Mensaje enviado exitosamente desde Chatwoot: wamid.xxxxx
```

### Test 2: Enviar archivo multimedia
1. En Chatwoot, adjunta una imagen o audio
2. Envía el mensaje
3. El servidor automáticamente:
   - Descarga el archivo de Chatwoot
   - Lo sube a WhatsApp Cloud
   - Envía el mensaje con el media ID

## 🐛 Troubleshooting

### Error: "Param audio["link"] is not a valid URL"
**Causa**: Chatwoot está intentando enviar un link directo pero WhatsApp requiere un media ID.
**Solución**: Configurar correctamente el Phone Number ID y WABA ID en Chatwoot.

### Error: "Invalid OAuth access token"
**Causa**: El Access Token es inválido o expiró.
**Solución**: Generar un nuevo token permanente en Meta Business Suite.

### Los mensajes de texto funcionan pero multimedia no
**Causa**: Permisos insuficientes en el Access Token.
**Solución**: Asegúrate de que el token tenga `whatsapp_business_messaging` y `whatsapp_business_management`.

## 📚 Recursos

- [WhatsApp Cloud API - Sending Media](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media)
- [Chatwoot WhatsApp Cloud Setup](https://www.chatwoot.com/docs/product/channels/whatsapp/whatsapp-cloud)
- [Meta Business Suite](https://business.facebook.com/)

## 🆘 Si nada funciona

Como última opción, puedes usar el endpoint personalizado que creamos:

**POST** `https://app-whatsapp-marketing-whatsapp-masivo.zlrp4i.easypanel.host/api/chatwoot/send-message`

Body:
```json
{
  "to": "573123456789",
  "message": "Hola, aquí está tu archivo",
  "media_url": "https://chatwoot.com/path/to/file.jpg",
  "media_type": "image"
}
```

Pero esto requeriría configurar un webhook personalizado en Chatwoot, lo cual es más complejo.
