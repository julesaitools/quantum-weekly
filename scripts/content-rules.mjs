// Content rules applied to every briefing (at build time and when importing).

// The "Possible follow-up actions" section must never appear on the site.
// Removes a `##` section whose heading mentions follow-up actions (English or Dutch),
// up to the next `##` heading or `---` rule (the method note after `---` is kept).
const FOLLOW_UP_HEADING = /^##\s+(?:\d+\.\s*)?.*(follow[- ]?up|vervolgactie)/i;

export function stripFollowUps(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (FOLLOW_UP_HEADING.test(line)) { skipping = true; continue; }
    if (skipping && (/^##\s/.test(line) || /^---\s*$/.test(line))) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Gmail wraps links as https://www.google.com/url?q=<real url>&source=gmail&...
export function unwrapGoogleRedirects(text) {
  return text.replace(/https?:\/\/www\.google\.com\/url\?q=([^\s)&"<>]+)(?:&(?:amp;)?[^\s)"<>]*)?/g, (_, target) => {
    try { return decodeURIComponent(target); } catch { return target; }
  });
}
