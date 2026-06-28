# Minimal login-test frontend container (static files via nginx).
# The real frontend (MeteorPointer-FE / webUI) will replace this.
FROM nginx:1.27-alpine

# API base baked into config.js. Defaults to `/api` (production: same origin,
# proxy serves the API under :443/api/ and strips the prefix). Override per
# environment, e.g. --build-arg API_BASE=http://localhost:8000 for local dev.
# Must NOT end with a slash.
ARG API_BASE=/api

COPY frontend/ /usr/share/nginx/html/
RUN printf "window.API_BASE = '%s';\n" "$API_BASE" > /usr/share/nginx/html/config.js
EXPOSE 80
