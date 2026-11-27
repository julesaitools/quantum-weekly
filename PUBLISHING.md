# Publishing instructions (for the weekly publishing task)

These are the standing instructions for the scheduled task that puts briefings on the site.
The briefing itself is created and emailed by the scheduled task **"Quantum weekly briefing (auto)"**
(Mondays around 07:10 Amsterdam time). That task stays as it is. This publishing task only reads the
sent email and adds it to the archive.

## Steps

1. **Update the repo.** Work on branch `main` of `julesaitools/quantum-weekly`:
   `git fetch origin main && git checkout main && git pull --ff-only origin main`.
2. **Find the emails.** Search Gmail with
   `in:sent subject:"Quantum Weekly Briefing" newer_than:21d`
   (on a first run or when there are gaps: without `newer_than`).
3. **Determine what is missing.** An email is already in the archive if a file in `briefings/` has
   `gmail_id: <message id>` in its front matter. Skip those. Nothing new? Stop without committing.
4. **Convert.** Fetch each missing email with `get_thread` and `messageFormat: FULL_CONTENT`.
   Use the HTML body if there is one, otherwise the plain text. Convert it to Markdown following the
   format and rules below.
5. **Check.** Run `npm ci && npm run build`. The build must succeed.
6. **Publish.** Commit only the new files in `briefings/`, with the message
   `Add briefing <date>`. Push to `main`. GitHub Actions then builds and publishes the site
   automatically. Change nothing else in the repo.

## Content rules

- **English only.** The whole site is in English. If the email (or part of it) is in Dutch, translate
  it into English. Translate faithfully: do not summarise, shorten or add anything.
- **Never include the "Possible follow-up actions" section** (in Dutch: "Mogelijke vervolgacties"),
  whatever number it has. Leave it out completely. The build also strips it as a safety net, but it
  must not be in the file.
- Otherwise keep every section, item, amount, date and source from the email.
- Leave out notes that are not about the content (such as "a connector needs to be reconnected") and
  leftover markup such as `]]>`.

## File format

File name: `briefings/YYYY-MM-DD.md`. The date is the day the email was sent, in Europe/Amsterdam.
If there are two briefings on one day, use `YYYY-MM-DD-2.md` for the second.

```markdown
---
title: "Quantum Weekly — 2–9 November 2026"
date: 2026-11-09
period: "2–9 November 2026"
gmail_id: 1a1bef74966c7067
---

**The essence:** first paragraph with the essence (becomes the summary in the archive).

## 1. Top signals

### 1.1 Headline of the item

*Date — [Source](https://real-url) · [Second source](https://...)*

- **What:** ...
- **Why it matters:** ...
- **Relevance:** ...

## 2. Opportunities and calls
...

## 3. Capital, companies, and talent
...
```

Rules:

- `title` = the briefing's own heading, in English with capitalised month names;
  `period` = only the date range from that heading.
- Sections as `##`, items as `###`. The source line below an item in italics on its own line.
  Lists as `-`, numbered lists as `1.`.
- **Links:** use the real URL, not the Gmail redirect (`https://www.google.com/url?q=...`).
  Take the URL from the `q=` parameter. Link text = the source name from the email.
- A closing note on method after a `---` line, in italics.
- `briefings/2026-11-09.md` is a good example of the desired result.
