/** Normalised job shape every adapter returns. */
export interface RawJob {
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  description: string | null;
  applyUrl: string;
  postedAt: Date | null;
  employmentType?: string | null;
  metadata?: Record<string, unknown>;
}

/** Strip HTML to plain text and clamp length (job descriptions are big). */
export function htmlToText(html: string | null | undefined, max = 12000): string | null {
  if (!html) return null;
  const txt = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return txt.slice(0, max);
}
