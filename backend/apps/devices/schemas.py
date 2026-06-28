from ninja import Schema


class ConsentIn(Schema):
    version: str
    license: str
    document_sha256: str
    locale: str
    app_version: str = ""
    accepted_at: str  # ISO-8601 timestamp from the device


class DeviceRegisterIn(Schema):
    public_key: str           # base64 Ed25519 public key
    label: str = ""
    consent: ConsentIn


class DeviceRegisterOut(Schema):
    device_id: str
    recovery_phrase: str      # shown once, never returned again


class DeviceRecoverIn(Schema):
    recovery_phrase: str
    public_key: str           # new key for the new device
    label: str = ""
    consent: ConsentIn


class DeviceRecoverOut(Schema):
    device_id: str


class DeviceLabelIn(Schema):
    label: str


class SimpleOk(Schema):
    ok: bool = True
