"""Ed25519 device identity helpers and recovery-phrase generation.

Auth model (Návrh 2):
  * The device generates an Ed25519 key pair on the phone and registers only
    the PUBLIC key (base64, raw 32 bytes). The private key never leaves the
    device.
  * To prove identity the device signs a server-issued challenge nonce; the
    server verifies the signature with the stored public key.

Recovery (R1):
  * On registration the server returns a one-time recovery phrase (shown once).
    Only its SHA-256 hash is stored, so the plaintext cannot be recovered from
    the database.
"""
import base64
import hashlib
import secrets

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def public_key_is_valid(public_key_b64: str) -> bool:
    try:
        raw = base64.b64decode(public_key_b64, validate=True)
        Ed25519PublicKey.from_public_bytes(raw)
        return True
    except (ValueError, InvalidSignature, Exception):  # noqa: BLE001
        return False


def verify_signature(public_key_b64: str, message: bytes, signature_b64: str) -> bool:
    """Verify that ``signature_b64`` is a valid Ed25519 signature over ``message``."""
    try:
        pub = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64, validate=True))
        pub.verify(base64.b64decode(signature_b64, validate=True), message)
        return True
    except (InvalidSignature, ValueError):
        return False


# --- Recovery phrase ---

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # Crockford-ish, no ambiguous chars


def generate_recovery_phrase(groups: int = 6, group_len: int = 4) -> str:
    """Generate a high-entropy, human-transcribable recovery phrase.

    Default = 6 groups of 4 chars from a 32-symbol alphabet ≈ 120 bits.
    """
    chunks = [
        "".join(secrets.choice(_ALPHABET) for _ in range(group_len)) for _ in range(groups)
    ]
    return "-".join(chunks)


def hash_recovery_phrase(phrase: str) -> str:
    """SHA-256 of the normalised phrase (uppercased, stripped)."""
    normalised = phrase.strip().upper()
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()
