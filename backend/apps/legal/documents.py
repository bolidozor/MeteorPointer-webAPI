"""Load and hash the canonical consent / data-license documents.

Source of truth = the markdown files in ``settings.LEGAL_DIR``
(repo ``docs/legal/consent.<locale>.md``). Each file has a small
``---`` frontmatter block (version, license, locale) followed by the body.
The served ``text`` is the body; ``sha256`` is computed over that body, so a
device's stored consent hash proves exactly which wording it accepted.
"""
import hashlib
from functools import lru_cache

from django.conf import settings

SUPPORTED_LOCALES = ("cs", "en")
DEFAULT_LOCALE = "cs"


class ConsentNotFound(Exception):
    pass


def _parse_frontmatter(raw: str) -> tuple[dict, str]:
    if raw.startswith("---"):
        _, _, rest = raw.partition("---\n")
        fm_block, sep, body = rest.partition("\n---")
        if sep:
            meta = {}
            for line in fm_block.splitlines():
                if ":" in line:
                    key, _, value = line.partition(":")
                    meta[key.strip()] = value.strip().strip('"').strip("'")
            return meta, body.lstrip("\n")
    return {}, raw


@lru_cache(maxsize=8)
def load_consent(locale: str) -> dict:
    """Return {version, license, locale, text, sha256} for a locale."""
    if locale not in SUPPORTED_LOCALES:
        locale = DEFAULT_LOCALE
    path = settings.LEGAL_DIR / f"consent.{locale}.md"
    if not path.exists():
        raise ConsentNotFound(locale)
    raw = path.read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(raw)
    sha256 = hashlib.sha256(body.encode("utf-8")).hexdigest()
    return {
        "version": meta.get("version", "0"),
        "license": meta.get("license", "CC0-1.0"),
        "locale": locale,
        "text": body,
        "sha256": sha256,
    }


def verify_consent(version: str, document_sha256: str, locale: str) -> bool:
    """True if the supplied version+hash match the current published document."""
    try:
        doc = load_consent(locale)
    except ConsentNotFound:
        return False
    return doc["version"] == version and doc["sha256"] == document_sha256
