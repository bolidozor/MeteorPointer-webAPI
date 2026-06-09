# Legal documents

Canonical, versioned consent / data-license texts shown in the mobile app before it
connects to the API. The API serves them via `GET /v1/legal/consent?locale=cs|en`
(returns `version`, `license`, `text`, `sha256`).

- [`consent.cs.md`](consent.cs.md) — Czech
- [`consent.en.md`](consent.en.md) — English

## Rules

- **Data license: CC0 1.0** (public domain).
- These files are the **single source of truth**. The `sha256` of the exact served text
  is recorded with each device's consent as proof of what was accepted.
- **Any wording change ⇒ bump `version`.** The app then re-prompts for consent and a new
  consent record is stored (history is not overwritten).
- Localisable; current languages cs + en. Add a new `consent.<locale>.md` to extend.
