# Quantum Weekly

A minimalist, searchable archive site for the weekly quantum technology briefing.

**How it works**

1. On Mondays around 07:10 (Amsterdam) the scheduled task *Quantum weekly briefing (auto)* creates
   the briefing and emails it. That task is not involved in publishing.
2. On Mondays at 09:17 and 15:17 (Amsterdam) the scheduled task *Quantum weekly → website* finds the
   sent email in Gmail, converts it to `briefings/YYYY-MM-DD.md` and pushes to `main`
   (see [PUBLISHING.md](PUBLISHING.md)). The 15:17 run is a safety net; if the briefing is already
   there, it does nothing.
3. A push to `main` starts GitHub Actions ([.github/workflows/pages.yml](.github/workflows/pages.yml)),
   which builds the site and deploys it to GitHub Pages.

**Content rules:** the site is English only, and the "Possible follow-up actions" section is never
published (the build strips it as a safety net, see `scripts/content-rules.mjs`).

**Structure**

| Path | Contents |
| --- | --- |
| `briefings/*.md` | One Markdown file per briefing, with front matter (`title`, `date`, `period`, `gmail_id`) |
| `scripts/build.mjs` | Builds `dist/`: archive, one page per briefing, search index, RSS feed |
| `scripts/content-rules.mjs` | Strips the follow-up section and unwraps Gmail redirect links |
| `scripts/plate.mjs` | Generates each edition's signal plate (SVG) |
| `site/` | `style.css` (house style) and `search.js` (search with highlighting, section tracking) |

**House style (v2)**

- *Concept:* signal over noise. Paper and ink, an oscilloscope screen, one signal colour.
- *Colours:* paper `#F3EFE6`, ink `#15171F`, signal `#F0501F` (text variant `#B93A10`); dark mode inverts to `#101116` with signal `#FF6A3D`. All colours are tokens in `site/style.css`.
- *Type:* Fraunces (display), Newsreader (text), IBM Plex Mono (labels and metadata). Self-hosted from npm (`@fontsource`), so no requests to Google.
- *Mark:* a Bloch sphere with an orange state vector.
- *Signal plate:* every edition gets a generated ridgeline image. One peak per top signal; the orange trace rises with how much the edition concerns the Netherlands/Brainport (mentions per 1,000 words, fixed scale 8–30). Deterministic: an edition always keeps the same plate.
- *Editions are numbered* (No. 1 = 2 September 2026).

**Building locally**

```bash
npm ci
npm run build      # → dist/
npm run serve      # build + view at http://localhost:8080
```

**Search:** every word must match. Use `"quotes"` for an exact phrase. Case and accents are ignored.
Press `/` to jump to the search box. Search results can be shared via `?q=`.

**One-time setup:** in GitHub go to Settings → Pages → Build and deployment →
Source: **GitHub Actions**. For a private repo this requires GitHub Pro or Team. The site itself is
public, but search engines are asked not to index it (`noindex`).
