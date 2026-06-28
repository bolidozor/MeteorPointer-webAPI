"""Web sign-in device flow: device-code -> approve (mobile) -> poll -> session."""
import json

import pytest
from django.test import Client

from tests.test_auth_sync import _register, _token

pytestmark = pytest.mark.django_db


def _json(client, path, body, **extra):
    return client.post(path, data=json.dumps(body), content_type="application/json", **extra)


def test_web_login_flow():
    fe = Client()      # the browser/frontend — keeps cookies
    mobile = Client()  # the mobile app

    device_id, priv = _register(mobile)
    token = _token(mobile, device_id, priv)
    auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    # 1) FE starts a login
    res = fe.post("/v1/web/device-code")
    assert res.status_code == 200, res.content
    data = res.json()
    user_code, device_code = data["user_code"], data["device_code"]

    # 2) Polling before approval -> pending
    res = _json(fe, "/v1/web/poll", {"device_code": device_code})
    assert res.json()["status"] == "pending"

    # 3) Mobile approves the shown code
    res = _json(mobile, "/v1/web/approve", {"user_code": user_code}, **auth)
    assert res.status_code == 200, res.content

    # 4) Polling now authenticates and sets the session cookie
    res = _json(fe, "/v1/web/poll", {"device_code": device_code})
    assert res.json()["status"] == "authenticated"
    assert "mp_web_session" in res.cookies

    # 5) The FE is now logged in via the cookie
    res = fe.get("/v1/web/me")
    assert res.status_code == 200
    assert res.json()["device_id"] == device_id

    res = fe.get("/v1/web/reports")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # 6) Logout revokes the session
    res = fe.post("/v1/web/logout")
    assert res.status_code == 200
    assert fe.get("/v1/web/me").status_code == 401


def test_me_requires_session():
    assert Client().get("/v1/web/me").status_code == 401


def test_approve_unknown_code():
    mobile = Client()
    device_id, priv = _register(mobile)
    token = _token(mobile, device_id, priv)
    res = _json(
        mobile,
        "/v1/web/approve",
        {"user_code": "ZZZZ-ZZZZ"},
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )
    assert res.status_code == 404
