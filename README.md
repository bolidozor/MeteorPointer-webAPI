# MeteorPointer-webAPI

[![CI](https://github.com/bolidozor/MeteorPointer-webAPI/actions/workflows/ci.yml/badge.svg)](https://github.com/bolidozor/MeteorPointer-webAPI/actions/workflows/ci.yml)
[![Release](https://github.com/bolidozor/MeteorPointer-webAPI/actions/workflows/release.yml/badge.svg)](https://github.com/bolidozor/MeteorPointer-webAPI/actions/workflows/release.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5-092E20?logo=django&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Data license: CC0-1.0](https://img.shields.io/badge/data-CC0--1.0-brightgreen)

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

## Nasazení — dvě varianty (jeden `.env`)

Obě varianty čtou stejný `.env` (proměnné specifické pro variantu jsou tam v
komentovaných sekcích).

### Varianta 1 — TLS na hostiteli / NASu (`docker-compose.prod.yml`)
API servíruje HTTP; certifikáty a TLS řeší externí/host proxy. 3 kontejnery.
```bash
docker compose -f docker-compose.prod.yml up -d
```
Host proxy nasměruj na publikovaný port API (default `:8000`; lze omezit přes
`API_BIND=127.0.0.1:8000`). Django věří `X-Forwarded-Proto`.

### Varianta 2 — HTTPS ve stacku přes Caddy (`docker-compose.tls.yml`)
Caddy získá a **automaticky obnovuje** certifikát; API je interní, ven jen proxy.
Režim řídí **`ACME_EMAIL`**:
```bash
# Lokální test — self-signed CA (ACME_EMAIL prázdné):
DOMAIN=localhost docker compose -f docker-compose.tls.yml up -d
curl -k https://localhost/healthz

# Produkce — Let's Encrypt (DOMAIN reálná a dosažitelná):
DOMAIN=api.robozor.cz ACME_EMAIL=you@robozor.cz \
  docker compose -f docker-compose.tls.yml up -d
```
`DOMAIN` se automaticky propíše do API (`ALLOWED_HOSTS` + CSRF). Certifikáty se
ukládají do volume `caddy_data` (obnova přežije restart). `PROXY_HTTP` /
`PROXY_HTTPS` umí proxy nabindovat na konkrétní IP, když je `:443` obsazené.

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
