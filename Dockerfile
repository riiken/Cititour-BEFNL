FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:${PORT:-5000}/health || exit 1
CMD ["node", "server.js"]
