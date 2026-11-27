# Publicatie-instructies (voor de wekelijkse publicatietaak)

Dit bestand is de vaste werkinstructie voor de geplande taak die briefings op de site zet.
De briefing zelf wordt gemaakt en gemaild door de geplande taak **"Quantum weekly briefing (auto)"**
(maandag rond 07:10 Amsterdamse tijd). Die taak blijft ongewijzigd. Deze publicatietaak leest alleen
de verzonden mail en zet die in het archief.

## Stappen

1. **Repo bijwerken.** Werk op branch `main` van `julesaitools/quantum-weekly`:
   `git fetch origin main && git checkout main && git pull --ff-only origin main`.
2. **Mails zoeken.** Zoek in Gmail met
   `in:sent subject:"Quantum Weekly Briefing" newer_than:21d`
   (bij de allereerste run of als er gaten zijn: zonder `newer_than`).
3. **Ontbrekende bepalen.** Een mail staat al in het archief als een bestand in `briefings/`
   `gmail_id: <message id>` in de front matter heeft. Sla die over. Niets nieuw? Stop dan zonder commit.
4. **Omzetten.** Haal elke ontbrekende mail op met `get_thread` en `messageFormat: FULL_CONTENT`.
   Gebruik de HTML-body als die er is, anders de platte tekst. Zet hem om naar Markdown volgens het
   formaat hieronder.
5. **Controleren.** Draai `npm ci && npm run build`. De build moet slagen.
6. **Publiceren.** Commit alleen de nieuwe bestanden in `briefings/`, met als bericht
   `Briefing <datum> toevoegen`. Push naar `main`. GitHub Actions bouwt en publiceert de site dan vanzelf.
   Wijzig verder niets in de repo.

## Bestandsformaat

Bestandsnaam: `briefings/YYYY-MM-DD.md`. De datum is de dag waarop de mail is verstuurd, in
Europe/Amsterdam. Zijn er twee briefings op één dag, gebruik dan `YYYY-MM-DD-2.md` voor de tweede.

```markdown
---
title: "Quantum Weekly — 2–9 november 2026"
date: 2026-11-09
period: "2–9 november 2026"
gmail_id: 1a1bef74966c7067
---

**Kern van de week:** eerste alinea met de essentie (wordt de samenvatting in het archief).

## 1. Top signalen

### 1. Kop van het item

*Datum — [Bron](https://echte-url) · [Tweede bron](https://...)*

- **Wat:** ...
- **Waarom het telt:** ...
- **Relevantie:** ...

## 2. Kansen en calls
...
```

Regels:

- **Inhoud letterlijk overnemen.** Niets samenvatten, inkorten, vertalen of toevoegen. Behoud de taal
  van de mail (Nederlands of Engels) en alle secties, items, bedragen, datums en bronnen.
- `title` = de kop van de briefing zelf (bijv. "Quantum Weekly — 26 oktober t/m 2 november 2026");
  `period` = alleen de datumreeks uit die kop.
- Secties als `##`, items als `###`. De bronregel onder een item cursief op een eigen regel.
  Lijsten als `-`, genummerde acties als `1.`.
- **Links:** gebruik de echte URL, niet de Gmail-omleiding (`https://www.google.com/url?q=...`).
  Haal de URL uit de `q=`-parameter. Linktekst = de bronnaam uit de mail.
- Een slotnotitie over methode/verantwoording na een `---`-regel, cursief.
- Laat meldingen weg die niet over de inhoud gaan (zoals "een connector moet opnieuw verbonden worden").
- `briefings/2026-11-09.md` is een goed voorbeeld van het gewenste resultaat.
