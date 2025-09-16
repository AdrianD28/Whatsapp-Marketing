Despliegue en GitHub + Hostinger (EasyPanel)

Resumen: subiremos este proyecto a un repo en GitHub y luego desplegaremos en tu hosting de Hostinger usando EasyPanel. El servidor `server/static-server.js` sirve las imágenes subidas en `/static` y actúa también como backend para subir a Meta si configuras credenciales.

1) Preparar repo local y push a GitHub

- Inicializa git en la carpeta (si no está):
  ```powershell
  git init
  git add .
  git commit -m "Initial commit"
  git branch -M main
  git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
  git push -u origin main
  ```

2) Configuración en Hostinger / EasyPanel

- En EasyPanel crea un nuevo sitio Node.js (o usa el gestor de aplicaciones que tenga "Node.js app").
- Sube el repo desde GitHub (EasyPanel permite conectar un repo o clonar desde Git).
- Asegúrate de tener las variables de entorno configuradas en EasyPanel:
  - `PORT` (opcional, por defecto 5174)
  - `APP_ID`, `ACCESS_TOKEN`, `PHONE_NUMBER_ID` si quieres que el servidor haga operaciones con Meta (subida resumable / upload-media)
  - `BUSINESS_ACCOUNT_ID` (obligatorio si quieres que el servidor cree plantillas server-side)

- En la configuración de la app del panel, configura el comando de inicio:
  ```
  npm install
  npm run build
  npm run start
  ```
  (o simplemente `npm run start` si ya instalaste dependencias en la plataforma)

3) Archivos importantes
- `server/static-server.js`: servidor express que sirve `/static`, `/upload`, `/resumable-upload`, `/upload-media`.
- `server/static/`: carpeta donde se guardan los archivos subidos — NO debe subirse al repo (está en `.gitignore`).
 - Nuevo endpoint para creación server-side de plantillas: `POST /create-template`.
   - Recibe `metadata` (JSON) con los campos que usarías para la plantilla (`name`, `language`, `category`, `components`, `ttl`) y opcionalmente un `file` multipart para el header media.
   - El servidor intentará obtener un `handle` válido (resumable o media id) y lo inyectará en `example.header_handle` antes de llamar a Graph API con `BUSINESS_ACCOUNT_ID`.

4) Uso después de desplegar
- Sube imagen desde la UI del frontend; el backend almacenará el archivo en `server/static` y lo servirá públicamente como `https://tu-dominio/static/<archivo>`.
- Si necesitas que el servidor haga la subida reanudable o a `/{phone_number_id}/media`, configura `APP_ID`, `ACCESS_TOKEN`, `PHONE_NUMBER_ID` en las envvars del servidor. El frontend llamará a los endpoints del servidor (que ya están en el mismo dominio).

Notas de seguridad
- Nunca publiques `ACCESS_TOKEN` ni `APP_ID` en un repo público. Usa las variables de entorno en Hostinger.
- El endpoint `/upload` está pensado para entornos controlados o pruebas; para producción añade autenticación y validaciones.
