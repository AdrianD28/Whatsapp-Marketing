# Etapa base para instalar dependencias
FROM node:20-alpine AS base
WORKDIR /app

# Instalar dependencias de sistema mínimas (opcional para node-gyp)
RUN apk add --no-cache libc6-compat

# Copiar manifests primero para aprovechar la cache
COPY package.json package-lock.json* .npmrc* ./

# Etapa de dependencias (para cacheo)
FROM base AS deps
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# Etapa de desarrollo
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Exponer el puerto por defecto de Vite
EXPOSE 5173
# Ejecutar Vite con host accesible desde fuera del contenedor
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Etapa de build de producción
FROM base AS build
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Etapa final para servir estáticos con Nginx
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
# Copiar configuración básica de Nginx para SPA (fallback a index.html)
RUN printf "server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $$uri /index.html;\n  }\n  types {\n    application/wasm wasm;\n  }\n}\n" > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
