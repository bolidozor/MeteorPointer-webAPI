"""End-to-end tests: consent → register → challenge/token → batch sync."""
import base64
import json

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.test import Client

pytestmark = pytest.mark.django_db


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def _new_keypair():
    priv = Ed25519PrivateKey.generate()
    pub_raw = priv.public_key().public_bytes_raw()
    return priv, _b64(pub_raw)


def _consent(client) -> dict:
    res = client.get("/v1/legal/consent?locale=cs")
    assert res.status_code == 200
    doc = res.json()
    return {
        "version": doc["version"],
        "license": doc["license"],
        "document_sha256": doc["sha256"],
        "locale": "cs",
        "app_version": "0.1.0",
        "accepted_at": "2026-06-09T20:00:00Z",
    }


def _register(client) -> tuple[str, Ed25519PrivateKey]:
    priv, pub_b64 = _new_keypair()
    body = {"public_key": pub_b64, "label": "test", "consent": _consent(client)}
    res = client.post("/v1/devices", data=json.dumps(body), content_type="application/json")
    assert res.status_code == 201, res.content
    return res.json()["device_id"], priv


def _token(client, device_id: str, priv: Ed25519PrivateKey) -> str:
    res = client.post(
        "/v1/auth/challenge",
        data=json.dumps({"device_id": device_id}),
        content_type="application/json",
    )
    assert res.status_code == 200, res.content
    nonce = res.json()["nonce"]
    signature = _b64(priv.sign(nonce.encode("utf-8")))
    res = client.post(
        "/v1/auth/token",
        data=json.dumps({"device_id": device_id, "nonce": nonce, "signature": signature}),
        content_type="application/json",
    )
    assert res.status_code == 200, res.content
    return res.json()["access_token"]


def test_healthz():
    assert Client().get("/healthz").json() == {"status": "ok"}


def test_consent_has_hash():
    doc = Client().get("/v1/legal/consent?locale=cs").json()
    assert doc["license"] == "CC0-1.0"
    assert len(doc["sha256"]) == 64


def test_register_rejects_stale_consent():
    client = Client()
    _, pub_b64 = _new_keypair()
    consent = _consent(client)
    consent["document_sha256"] = "0" * 64  # wrong hash
    body = {"public_key": pub_b64, "consent": consent}
    res = client.post("/v1/devices", data=json.dumps(body), content_type="application/json")
    assert res.status_code == 409


def test_full_sync_flow_with_idempotency():
    client = Client()
    device_id, priv = _register(client)
    token = _token(client, device_id, priv)
    auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    batch = {
        "reports": [
            {"client_key": "report-1", "payload": {"alt": 42.0, "az": 100.0}},
            {"client_key": "report-2", "payload": {"alt": 10.0, "az": 270.0}},
        ]
    }

    res = client.post(
        "/v1/reports", data=json.dumps(batch), content_type="application/json", **auth
    )
    assert res.status_code == 202, res.content
    assert res.json()["accepted"] == 2

    # Re-upload of the same batch must dedupe, not duplicate or fail.
    res = client.post(
        "/v1/reports", data=json.dumps(batch), content_type="application/json", **auth
    )
    assert res.status_code == 202
    assert res.json()["duplicates"] == 2

    res = client.get("/v1/reports", **auth)
    assert len(res.json()) == 2


def test_reports_require_auth():
    res = Client().get("/v1/reports")
    assert res.status_code == 401
