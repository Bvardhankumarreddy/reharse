/**
 * "The AI Squad" — fixed 4-character cast (5 avatar keys; KIRA has two).
 * HeyGen avatar/voice IDs come from env (created in the HeyGen dashboard).
 */
export type CharacterKey = 'byte' | 'kira_serious' | 'kira_fun' | 'atlas' | 'luna';

export const CHARACTER_KEYS: CharacterKey[] = [
  'byte', 'kira_serious', 'kira_fun', 'atlas', 'luna',
];

/** Speaker display name (KIRA's two versions share one name). */
export const SPEAKER_NAME: Record<CharacterKey, string> = {
  byte: 'BYTE',
  kira_serious: 'KIRA',
  kira_fun: 'KIRA',
  atlas: 'ATLAS',
  luna: 'LUNA',
};

export const CAST = {
  byte:         { name: 'BYTE',  role: 'The Engineer',  color: 'cyan' },
  kira_serious: { name: 'KIRA',  role: 'The Explorer (thoughtful)', color: 'gold' },
  kira_fun:     { name: 'KIRA',  role: 'The Explorer (energetic)',  color: 'gold' },
  atlas:        { name: 'ATLAS', role: 'The Skeptic',   color: 'crimson' },
  luna:         { name: 'LUNA',  role: 'The Innovator', color: 'purple' },
} as const;

/** HeyGen avatar + voice IDs per character (env-driven; empty until set). */
export function castAvatars() {
  return {
    byte: {
      avatarId: process.env.HEYGEN_AVATAR_BYTE_ID,
      voiceId: process.env.HEYGEN_VOICE_BYTE_ID,
    },
    kira_serious: {
      avatarId: process.env.HEYGEN_AVATAR_KIRA_SERIOUS_ID,
      voiceId: process.env.HEYGEN_VOICE_KIRA_ID,
    },
    kira_fun: {
      avatarId: process.env.HEYGEN_AVATAR_KIRA_FUN_ID,
      voiceId: process.env.HEYGEN_VOICE_KIRA_ID,
    },
    atlas: {
      avatarId: process.env.HEYGEN_AVATAR_ATLAS_ID,
      voiceId: process.env.HEYGEN_VOICE_ATLAS_ID,
    },
    luna: {
      avatarId: process.env.HEYGEN_AVATAR_LUNA_ID,
      voiceId: process.env.HEYGEN_VOICE_LUNA_ID,
    },
  } as Record<CharacterKey, { avatarId?: string; voiceId?: string }>;
}

export function isCharacterKey(k: string): k is CharacterKey {
  return (CHARACTER_KEYS as string[]).includes(k);
}
