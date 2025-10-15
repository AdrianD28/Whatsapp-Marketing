# 🔐 Configuración de Seguridad

## Variables de Entorno Críticas

### Super Admin

El sistema requiere las siguientes variables de entorno para crear la cuenta de super administrador:

```bash
SUPER_ADMIN_EMAIL=tu-email@ejemplo.com
SUPER_ADMIN_PASSWORD=tu-password-seguro
SUPER_ADMIN_NAME=Tu Nombre
SUPER_ADMIN_CREDITS=999999
```

⚠️ **IMPORTANTE:**
- Estas credenciales NO deben estar en el código fuente
- Cambia `SUPER_ADMIN_PASSWORD` por una contraseña segura
- Usa un gestor de secretos en producción (AWS Secrets Manager, HashiCorp Vault, etc.)
- La cuenta de super admin se crea automáticamente al iniciar el servidor si no existe

### MongoDB

```bash
MONGO_URI=mongodb://usuario:password@host:27017
MONGO_DB_NAME=nombre_base_datos
```

### WhatsApp Business API

```bash
WEBHOOK_VERIFY_TOKEN=token-secreto-webhook
```

## Configuración en Producción

### 1. Copiar archivo de ejemplo

```bash
cp .env.example .env
```

### 2. Editar variables sensibles

```bash
nano .env  # o tu editor preferido
```

### 3. Proteger el archivo .env

```bash
chmod 600 .env
```

### 4. Verificar que .env NO está en git

El archivo `.gitignore` debe incluir:

```
.env
.env.local
.env.production
```

## Checklist de Seguridad

- [ ] `SUPER_ADMIN_PASSWORD` cambiado del valor por defecto
- [ ] Variables de entorno configuradas en el servidor de producción
- [ ] Archivo `.env` con permisos 600 (solo lectura/escritura para el owner)
- [ ] `.env` incluido en `.gitignore`
- [ ] Rate limiting activado (`ENABLE_RATE_LIMIT=1`)
- [ ] HTTPS configurado en producción
- [ ] Base de datos MongoDB con autenticación habilitada
- [ ] Firewall configurado para limitar acceso a MongoDB

## Buenas Prácticas

1. **Nunca comitees credenciales reales** al repositorio
2. **Rota las credenciales regularmente** (cada 90 días mínimo)
3. **Usa contraseñas fuertes**: mínimo 16 caracteres, incluye mayúsculas, minúsculas, números y símbolos
4. **Audita los logs** regularmente para detectar accesos no autorizados
5. **Mantén backups encriptados** de la base de datos
6. **Implementa 2FA** para cuentas de administrador (próxima feature)

## Recuperación de Super Admin

Si olvidas la contraseña del super admin, puedes:

1. **Opción 1: Actualizar directamente en MongoDB**
   ```javascript
   // Genera un hash SHA256 de tu nueva contraseña
   const crypto = require('crypto');
   const newPassword = 'tu-nueva-password';
   const hash = crypto.createHash('sha256').update(newPassword).digest('hex');
   
   // Actualiza en MongoDB
   db.users.updateOne(
     { email: 'development@levitze.com' },
     { $set: { password: hash } }
   );
   ```

2. **Opción 2: Reiniciar con nueva variable de entorno**
   - Detener el servidor
   - Eliminar el usuario existente de MongoDB
   - Cambiar `SUPER_ADMIN_PASSWORD` en `.env`
   - Reiniciar el servidor (se creará automáticamente)

## Contacto de Seguridad

Para reportar vulnerabilidades de seguridad, contacta a:
- Email: security@levitze.com
- NO abras issues públicos para temas de seguridad

---

**Última actualización:** 15 de octubre de 2025
