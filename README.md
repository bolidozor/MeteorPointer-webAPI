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
- [Vývoj](#vývoj)
- [Licence](#licence)

## O projektu

`MeteorPointer-webAPI` poskytuje serverové rozhraní (REST/HTTP API) pro práci s daty
o detekovaných meteorech – jejich poloze, čase a parametrech pozorování. Slouží jako
backend, na který se napojují klientské nástroje a vizualizace.

## Požadavky

<!-- TODO: doplnit podle zvoleného technologického stacku -->

- Git
- Runtime prostředí dle implementace (např. Python 3.x / Node.js)

## Instalace

```bash
git clone https://github.com/bolidozor/MeteorPointer-webAPI.git
cd MeteorPointer-webAPI
# TODO: instalace závislostí
```

## Spuštění

```bash
# TODO: příkaz pro spuštění vývojového serveru
```

API bude standardně dostupné na `http://localhost:8000` (port upřesnit).

## Struktura repozitáře

```
MeteorPointer-webAPI/
├── README.md        # tento soubor
└── ...              # TODO: zdrojový kód, konfigurace, testy
```

## Vývoj

Příspěvky jsou vítány. Doporučený postup:

1. Vytvoř větev (`git checkout -b feature/nazev`).
2. Proveď změny a commit.
3. Otevři pull request proti větvi `main`.

## Licence

<!-- TODO: doplnit licenci (např. MIT) -->

---

Součást projektu [Bolidozor](https://github.com/bolidozor).
