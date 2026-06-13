from ninja import Router, Schema

from .documents import ConsentNotFound, load_consent

router = Router()


class ConsentOut(Schema):
    version: str
    license: str
    locale: str
    text: str
    sha256: str


@router.get("/consent", response=ConsentOut)
def get_consent(request, locale: str = "cs"):
    """Canonical consent / data-license document for a locale."""
    try:
        return load_consent(locale)
    except ConsentNotFound:
        return router.api.create_response(request, {"detail": "Unknown locale"}, status=404)
