/**
 * Multi-language support for AI Squad. English is primary; Hindi + Telugu
 * are translated from it. Voice clones are per character per language
 * (env-driven; dormant until HeyGen is wired).
 */
export const SUPPORTED_LANGUAGES = {
  english: { code: 'en', name: 'English', youtubeLangCode: 'en', isPrimary: true },
  hindi:   { code: 'hi', name: 'Hindi',   youtubeLangCode: 'hi', isPrimary: false },
  telugu:  { code: 'te', name: 'Telugu',  youtubeLangCode: 'te', isPrimary: false },
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;
export const LANGUAGE_CODES: LanguageCode[] = ['english', 'hindi', 'telugu'];

export function isLanguageCode(s: string): s is LanguageCode {
  return (LANGUAGE_CODES as string[]).includes(s);
}

/** Both KIRA versions share one voice; resolve to the base character. */
function baseVoiceChar(characterKey: string): 'byte' | 'kira' | 'atlas' | 'luna' {
  if (characterKey.startsWith('kira')) return 'kira';
  if (characterKey === 'byte' || characterKey === 'atlas' || characterKey === 'luna') {
    return characterKey;
  }
  return 'byte';
}

/** voice clone id for character × language, from env. Empty until set. */
export function getVoiceId(characterKey: string, language: LanguageCode): string {
  const base = baseVoiceChar(characterKey).toUpperCase();
  const lang = SUPPORTED_LANGUAGES[language].code.toUpperCase(); // EN | HI | TE
  return process.env[`HEYGEN_VOICE_${base}_${lang}`] ?? '';
}
