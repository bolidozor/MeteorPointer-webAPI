#!/bin/sh
set -e

# Apply database migrations before starting the server.
python manage.py migrate --noinput

exec "$@"
