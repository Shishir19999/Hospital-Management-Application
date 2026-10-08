# Backend image (Node 24 LTS). Build context: the repository root (the API shares code with /shared).
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY shared ./shared
WORKDIR /app/Backend
COPY Backend/package*.json ./
RUN npm ci --omit=dev
COPY Backend/ ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# HOST defaults to 0.0.0.0 in server.js so the published port works
CMD ["node", "server.js"]
