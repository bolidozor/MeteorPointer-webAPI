# MeteorPointer-webAPI

Webové API pro projekt **MeteorPointer** v rámci sítě [Bolidozor](https://bolidozor.cz) –
distribuované sítě rádiových stanic pro detekci meteorů a bolidů.

> ⚠️ Repozitář je v rané fázi. Tento popis je výchozí kostra a bude upřesněn podle
> skutečné implementace.

## Obsah

- [O projektu](#o-projektu)
- [Požadavky](#požadavky)
- [Instalace](#instalace)
- [Spuštění](#spuštění)
- [Struktura repozitáře](#struktura-repozitáře)
- [Související projekty](#související-projekty)
- [Vývoj](#vývoj)
- [Licence](#licence)

## O projektu

`MeteorPointer-webAPI` poskytuje serverové rozhraní (REST/HTTP API) pro práci s daty
o detekovaných meteorech – jejich poloze, čase a parametrech pozorování. Slouží jako
backend, na který se napojují klientské nástroje a vizualizace.

## Technologie

- **Python 3.12 · Django 5 · [django-ninja](https://django-ninja.dev/)** (REST API, auto-OpenAPI)
- **PostgreSQL 16** (psycopg 3)
- **Ed25519** identita zařízení · krátkodobé **JWT** · auth bez hesel a e-mailů
- Nasazení přes **Docker Compose**, image distribuovány přes **GHCR**

## Požadavky

- Docker + Docker Compose (doporučeno), nebo Python 3.12 pro lokální běh

## Spuštění (Docker)

```bash
git clone https://github.com/bolidozor/MeteorPointer-webAPI.git
cd MeteorPointer-webAPI
cp .env.example .env        # uprav tajné klíče
docker compose up -d
```

- API: `http://localhost:8000`
- Health check: `http://localhost:8000/healthz`
- Interaktivní dokumentace (OpenAPI): `http://localhost:8000/api/docs`

## Testy

```bash
docker compose up -d db
docker compose run --rm --entrypoint pytest api
```

## Struktura repozitáře

```
MeteorPointer-webAPI/
├── backend/
│   ├── meteorpointer/        # Django projekt (settings, asgi, api root)
│   └── apps/
│       ├── devices/          # registrace zařízení (Ed25519), recovery fráze, mazání
│       ├── auth_api/         # challenge → JWT
│       ├── ingest/           # bezpečná synchronizace měření (raw landing zone)
│       └── legal/            # servírování textů souhlasu / licence
├── docs/legal/               # kanonické texty souhlasu (cs, en)
├── docker/api/               # Dockerfile + entrypoint
├── docker-compose.yml
└── .github/workflows/        # CI (lint + test) a release (build → GHCR)
```

## Související projekty

Vývoj tohoto API probíhá v konsolidaci s dalšími repozitáři projektu MeteorPointer:

| Repozitář | Popis |
|-----------|-------|
| [MeteorPointer](https://github.com/bolidozor/MeteorPointer) | Mobilní aplikace |
| **MeteorPointer-webAPI** (tento repozitář) | Webové API / backend |
| [MeteorPointer-webUI](https://github.com/bolidozor/MeteorPointer-webUI) | Webový frontend k tomuto API |

## Vývoj

Příspěvky jsou vítány. Doporučený postup:

1. Vytvoř větev (`git checkout -b feature/nazev`).
2. Proveď změny a commit.
3. Otevři pull request proti větvi `main`.

## Licence

Naměřená pozorovací data jsou uvolňována pod **CC0 1.0** (public domain) — viz
[`docs/legal/`](docs/legal/). Licence zdrojového kódu bude doplněna.

---

Součást projektu [Bolidozor](https://github.com/bolidozor).
