FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Imagen final: Node + Express sirviendo dist y endpoints
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Instalar solo dependencias de producción para el servidor
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# Copiar artefactos y código del servidor
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
# Puerto del servidor Express
ENV PORT=5174
EXPOSE 5174
CMD ["node", "server/static-server.js"]
