"""Ninja auth class that resolves the web session cookie to a Device."""
from django.conf import settings
from django.utils import timezone
from ninja.security import APIKeyCookie

from .models import WebSession
from .util import hash_token


class WebSessionAuth(APIKeyCookie):
    param_name = settings.WEB_COOKIE_NAME

    def authenticate(self, request, key):
        if not key:
            return None
        session = (
            WebSession.objects.select_related("device")
            .filter(token_hash=hash_token(key), revoked_at__isnull=True)
            .first()
        )
        if session is None or session.expires_at < timezone.now():
            return None
        request.web_device = session.device
        request.web_session = session
        return session


# csrf=False: the session cookie is SameSite=Lax (it blocks cross-site POSTs, so
# it already provides CSRF protection) and the cross-origin frontend cannot read
# a Django CSRF token anyway. Without this, cookie-authed POSTs (e.g. logout)
# are rejected with "CSRF check Failed".
web_auth = WebSessionAuth(csrf=False)
