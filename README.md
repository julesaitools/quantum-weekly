# Quantum Weekly

Minimalistische, doorzoekbare archiefsite voor de wekelijkse quantumbriefing.

**Hoe het werkt**

1. Maandag ~07:10 (Amsterdam) maakt de geplande taak *Quantum weekly briefing (auto)* de briefing en
   mailt die. Die taak is niet aangepast.
2. Maandag 09:17 en 15:17 (Amsterdam) zoekt de geplande taak *Quantum weekly → website* de verzonden
   mail op in Gmail, zet hem om naar `briefings/JJJJ-MM-DD.md` en pusht naar `main`
   (zie [PUBLISHING.md](PUBLISHING.md)). De run van 15:17 is een vangnet; staat de briefing er al,
   dan doet die niets.
3. Een push naar `main` start GitHub Actions ([.github/workflows/pages.yml](.github/workflows/pages.yml)).
   Die bouwt de site en zet hem op GitHub Pages.

**Structuur**

| Pad | Inhoud |
| --- | --- |
| `briefings/*.md` | Eén Markdown-bestand per briefing, met front matter (`title`, `date`, `period`, `gmail_id`) |
| `scripts/build.mjs` | Bouwt `dist/`: archief, één pagina per briefing, zoekindex, RSS-feed |
| `site/` | `style.css` en `search.js` (zoeken met markering, zonder externe diensten) |

**Lokaal bouwen**

```bash
npm ci
npm run build      # → dist/
npm run serve      # bouwen + bekijken op http://localhost:8080
```

**Zoeken:** alle woorden moeten voorkomen. Gebruik `"aanhalingstekens"` voor een exacte zin.
Hoofdletters en accenten maken niet uit. Druk op `/` om naar het zoekveld te springen.
Zoekresultaten zijn deelbaar via `?q=`.

**Eenmalige instelling:** in GitHub ga je naar Settings → Pages → Build and deployment →
Source: **GitHub Actions**. Voor een privé repo heb je GitHub Pro of Team nodig. De site zelf is
openbaar, maar zoekmachines worden gevraagd hem niet te indexeren (`noindex`).
