/**
 * Standard AetherStackAI social footer appended to the YouTube description,
 * LinkedIn, and Instagram posts. Links are fixed here (never left to the LLM)
 * so every post carries the exact, correct URLs + the lesson reference.
 */
export const SOCIAL_LINKS = {
  youtube: 'youtube.com/@aetherstackai',
  whatsapp: 'whatsapp.com/channel/0029Vb7dRgq1dAwCydDr651d',
  instagram: 'instagram.com/aetherstackai',
  linkedin: 'linkedin.com/company/115524370',
  site: 'reharse.inferix.in',
};

/** The "follow me" block + the lesson number/link, ready to append to a post. */
export function socialFooter(lessonNumber: number, lessonTitle: string): string {
  return [
    `📚 Lesson ${lessonNumber}: ${lessonTitle} — ${SOCIAL_LINKS.site}`,
    '',
    `Subscribe: ${SOCIAL_LINKS.youtube}`,
    'Follow me:',
    `💬 WhatsApp: ${SOCIAL_LINKS.whatsapp}`,
    `📸 Instagram: ${SOCIAL_LINKS.instagram}`,
    `💼 LinkedIn: ${SOCIAL_LINKS.linkedin}`,
  ].join('\n');
}
