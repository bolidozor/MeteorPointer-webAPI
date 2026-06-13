from ninja import Schema


class ChallengeIn(Schema):
    device_id: str


class ChallengeOut(Schema):
    nonce: str
    expires_at: str


class TokenIn(Schema):
    device_id: str
    nonce: str
    signature: str  # base64 Ed25519 signature over the nonce bytes


class TokenOut(Schema):
    access_token: str
    token_type: str
    expires_in: int
