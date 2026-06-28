// Runtime config. The Docker image overwrites this at build time from the
// API_BASE build arg (docker/fe/Dockerfile). Must NOT end with a slash.
// `/api` = same origin, production proxy under :443/api/.
window.API_BASE = '/api';
