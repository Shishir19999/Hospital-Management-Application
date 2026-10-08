# Frontend image: build with Vite, serve with nginx. Build context: the repository root (shares code with /shared).
FROM node:24-slim AS build
WORKDIR /app
COPY shared ./shared
WORKDIR /app/Frontend
COPY Frontend/package*.json ./
RUN npm ci
COPY Frontend/ ./
# The API address is baked into the bundle. The default /api is proxied to the backend by nginx,
# so the browser only ever talks to one origin.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.30-alpine
COPY Frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/Frontend/dist /usr/share/nginx/html
EXPOSE 80
