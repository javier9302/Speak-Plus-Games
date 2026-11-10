# Stealth Squad — one container serves the game server and the web page on $PORT.
#   docker build -t stealth-squad .
#   docker run -p 2567:2567 stealth-squad      → open http://localhost:2567/host

# --- Build: web page (Vite) + server bundle (esbuild, includes shared code) ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY server server
COPY client client
RUN npm run build

# --- Run: only the server's runtime packages + the built files ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=2567
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
EXPOSE 2567
USER node
CMD ["node", "server/dist/index.mjs"]
