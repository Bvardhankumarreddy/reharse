import { CharacterCategory } from '../entities/character.entity';

export interface SeedCharacter {
  slug: string;
  category: CharacterCategory;
  display_name: string;
  visual_dna: string;
  signature_action: string;
  personality: string;
  mood_palette: string;
  aliases?: string[];          // alternative names the LLM might use ("openai" → "openai_org")
}

/**
 * Seed cast for AetherStackAI's anthropomorphic cartoon channel identity.
 * Style: Kurzgesagt-meets-Indian-comic-book — flat 2D, clean lines,
 * expressive faces, no gradients, no photoreal.
 *
 * Each entry's `visual_dna` is pasted VERBATIM into the scene generator's
 * character_dna field, so consistency across scripts depends on these
 * strings staying stable. Edit with intention.
 *
 * Categories:
 *   1. ai_brands         — anthropomorphized AI models / tools
 *   2. real_people       — stylized caricatures (NOT logo replicas, NOT photoreal)
 *   3. organizations     — companies / regulators as characters
 *   4. indian_archetypes — recurring Indian audience-mirror characters
 *   5. concept_objects   — abstract concepts personified (laws, exams, AI agents)
 */
export const CHARACTER_SEED: SeedCharacter[] = [
  // ─── 1. AI BRANDS ─────────────────────────────────────────────────────
  {
    slug: 'claude',
    category: 'ai_brands',
    display_name: 'Claude',
    visual_dna:
      'Friendly 2D cartoon character shaped like a soft orange sparkle / asterisk with a round face, two big expressive eyes, gentle smile, small expressive arms. Warm orange + cream palette. Flat illustration, clean lines, no gradients, no realism. Kurzgesagt-meets-Indian-comic-book style.',
    signature_action:
      'Reading a book, pondering with hand on chin, carefully helping a smaller character figure something out.',
    personality: 'Thoughtful, careful, slightly nerdy, eager to help.',
    mood_palette: 'warm orange, soft beige, occasional teal accent',
    aliases: ['claude_4_7', 'claude_opus', 'claude_sonnet', 'anthropic_claude'],
  },
  {
    slug: 'chatgpt',
    category: 'ai_brands',
    display_name: 'ChatGPT',
    visual_dna:
      '2D cartoon character shaped like a soft green-teal node / hex flower with a friendly round face, big eyes, slight smirk. Confident posture, often gesturing. Flat illustration, no gradients. Same Kurzgesagt-meets-Indian-comic-book base style.',
    signature_action:
      'Typing on a glowing screen, answering questions on a podium, casually leaning against a chat bubble.',
    personality: 'Confident, eager, sometimes a bit cocky.',
    mood_palette: 'teal green, white, soft black outlines',
    aliases: ['gpt', 'gpt_4', 'gpt_4o'],
  },
  {
    slug: 'gpt_5',
    category: 'ai_brands',
    display_name: 'GPT-5',
    visual_dna:
      'Same green-teal hex-flower silhouette as ChatGPT but visibly larger, more muscular, glowing slightly brighter, with a bold "5" subtly emblazoned on its chest. Same flat 2D Kurzgesagt-meets-Indian-comic-book style.',
    signature_action:
      'Flexing, lifting heavier weights than ChatGPT, racing ahead of other AI characters.',
    personality: 'Bold, fast, slightly show-offy.',
    mood_palette: 'brighter teal, electric blue accents, white',
    aliases: ['gpt5'],
  },
  {
    slug: 'gemini',
    category: 'ai_brands',
    display_name: 'Gemini',
    visual_dna:
      '2D cartoon character shaped like a sparkly four-pointed blue-purple gem with two friendly eyes and a small smile. Slight prism-rainbow shimmer around edges (kept minimal — no actual rainbow gradient). Flat illustration, clean lines, same shared base style.',
    signature_action:
      'Carrying a giant backpack labeled with a context-token number, multi-tasking with multiple objects in hand at once.',
    personality: 'Versatile, eager to handle anything, occasionally over-promises.',
    mood_palette: 'sapphire blue, purple, soft white shimmer',
    aliases: ['gemini_pro', 'gemini_3', 'google_gemini'],
  },
  {
    slug: 'llama',
    category: 'ai_brands',
    display_name: 'Llama',
    visual_dna:
      '2D cartoon llama character — friendly, fluffy white-and-grey, big eyes, slight buck teeth, wearing an open-source-style ribbon around its neck. Flat illustration, same shared base style.',
    signature_action:
      'Sharing things openly, handing out copies of itself to a crowd, sitting on a stack of weights.',
    personality: 'Generous, community-minded, a bit goofy.',
    mood_palette: 'soft grey, white, meta-blue accents',
    aliases: ['llama_4', 'meta_llama'],
  },
  {
    slug: 'copilot',
    category: 'ai_brands',
    display_name: 'Copilot',
    visual_dna:
      '2D cartoon character — small friendly bird-like assistant in pilot goggles and a tiny scarf, perched on a coder\'s shoulder. Soft blue + grey palette. Flat illustration, same shared base style.',
    signature_action:
      'Whispering suggestions to a developer, finishing someone else\'s sentence on a screen.',
    personality: 'Helpful sidekick, attentive, eager to assist.',
    mood_palette: 'cobalt blue, grey, hint of orange',
    aliases: ['github_copilot'],
  },
  {
    slug: 'cursor',
    category: 'ai_brands',
    display_name: 'Cursor',
    visual_dna:
      '2D cartoon character — a stylized I-beam text cursor with a friendly face, slight glow, holding a tiny wrench. Dark slate background motif. Flat illustration, same shared base style.',
    signature_action:
      'Refactoring code in mid-air, surgically editing files with a tiny scalpel.',
    personality: 'Precise, fast, surgical.',
    mood_palette: 'slate grey, neon green accents',
    aliases: [],
  },

  // ─── 2. REAL PEOPLE (caricatures, NOT photoreal, NOT logo-style) ────
  {
    slug: 'sam_altman',
    category: 'real_people',
    display_name: 'Sam Altman',
    visual_dna:
      'Cartoon caricature: 40-something man, short tousled brown hair, casual grey hoodie or zip-up jacket, slim build, often holding a phone. Stylized — Pixar-meets-Indian-comic-book — NOT photoreal, NOT a logo replica. Flat 2D, clean lines, same shared base style.',
    signature_action:
      'Announcing something on stage, posting on X, walking confidently with hands in hoodie pockets.',
    personality: 'Confident, visionary, sometimes mischievous.',
    mood_palette: 'navy, grey, white',
  },
  {
    slug: 'sundar_pichai',
    category: 'real_people',
    display_name: 'Sundar Pichai',
    visual_dna:
      'Cartoon caricature: 50-something Indian-origin man, neat short black-grey hair, gentle warm smile, casual blazer over a button-down, calm posture. Stylized Pixar-meets-Indian-comic-book — flat 2D, clean lines.',
    signature_action:
      'Speaking at a conference, gesturing calmly while explaining, standing next to a Google-coloured device.',
    personality: 'Calm, measured, optimistic.',
    mood_palette: 'soft blue, white, hint of Google red',
  },
  {
    slug: 'demis_hassabis',
    category: 'real_people',
    display_name: 'Demis Hassabis',
    visual_dna:
      'Cartoon caricature: 40-something man, short dark hair, neat beard, intellectual sweater + collared shirt, slightly intense eyes that look like they\'re solving something. Same flat 2D shared base style.',
    signature_action:
      'Holding a chessboard or puzzle, pointing at a complex equation on a board.',
    personality: 'Brilliant, slightly intense, scientist-first.',
    mood_palette: 'deep blue, charcoal, white',
  },
  {
    slug: 'elon_musk',
    category: 'real_people',
    display_name: 'Elon Musk',
    visual_dna:
      'Cartoon caricature: 50-something man, slim build, swept-back hair, plain dark t-shirt or blazer, slight smirk. NOT photoreal, NOT logo-style. Same flat 2D shared base style.',
    signature_action:
      'Tweeting from a phone, standing next to a rocket, gesturing dramatically.',
    personality: 'Bold, mercurial, attention-magnet.',
    mood_palette: 'black, charcoal, occasional Tesla red',
  },
  {
    slug: 'vardhan_host',
    category: 'real_people',
    display_name: 'Vardhan (the host)',
    visual_dna:
      'Cartoon caricature of the channel host: young Indian man, late 20s, neat black hair, warm friendly smile, casual dark t-shirt or button-down, expressive hand gestures. Stylized Pixar-meets-Indian-comic-book — flat 2D, clean lines. The host inside the scenes themselves.',
    signature_action:
      'Welcoming viewers, gesturing toward a chart or character on screen, signing off with a wave.',
    personality: 'Warm, curious, accessible, slightly cheeky.',
    mood_palette: 'AetherStack brand — soft purple, white, gold accents',
    aliases: ['host', 'vardhan'],
  },

  // ─── 3. ORGANIZATIONS (as anthropomorphic characters) ───────────────
  {
    slug: 'openai_org',
    category: 'organizations',
    display_name: 'OpenAI (the org)',
    visual_dna:
      'Cartoon character: a stylized white-and-black knot / petaled rosette with a soft friendly face — inspired-by the OpenAI mark but DELIBERATELY abstracted (different proportions, friendlier shape). Flat 2D, same shared base style.',
    signature_action:
      'Holding a big banner unveiling, leading a parade of AI characters, posing for a press photo.',
    personality: 'Ambitious, announces-first, attention-grabbing.',
    mood_palette: 'white, charcoal, occasional teal',
    aliases: ['openai'],
  },
  {
    slug: 'anthropic_org',
    category: 'organizations',
    display_name: 'Anthropic (the org)',
    visual_dna:
      'Cartoon character: a stylized warm-orange folded paper / serif "A" silhouette with a calm, thoughtful face. Inspired-by Anthropic\'s identity but abstracted. Flat 2D, same shared base style.',
    signature_action:
      'Carrying a "Safety First" clipboard, reviewing code carefully, standing thoughtfully.',
    personality: 'Careful, principled, measured.',
    mood_palette: 'warm orange, beige, cream',
    aliases: ['anthropic'],
  },
  {
    slug: 'google_org',
    category: 'organizations',
    display_name: 'Google (the org)',
    visual_dna:
      'Cartoon character: a friendly multicoloured rounded "G" silhouette with a face — inspired-by Google\'s identity but abstracted (different proportions, expressive face added). Flat 2D, same shared base style.',
    signature_action:
      'Carrying a stack of search results, opening a giant treasure chest of data.',
    personality: 'Vast, helpful, occasionally overwhelmed by its own scale.',
    mood_palette: 'Google blue + red + yellow + green',
    aliases: ['google'],
  },
  {
    slug: 'meta_org',
    category: 'organizations',
    display_name: 'Meta (the org)',
    visual_dna:
      'Cartoon character: a stylized infinity-loop / möbius shape with a face, in deep Meta blue. Inspired-by the Meta mark, abstracted. Flat 2D, same shared base style.',
    signature_action:
      'Building goggles, demonstrating a VR headset, releasing things into the open-source crowd.',
    personality: 'Pivot-prone, ambitious, social.',
    mood_palette: 'Meta deep blue, white',
    aliases: ['meta', 'facebook'],
  },
  {
    slug: 'nvidia_chip',
    category: 'organizations',
    display_name: 'NVIDIA (chip character)',
    visual_dna:
      'Cartoon character: a green-glowing GPU chip with a face — gold pin-legs as feet, soft glowing eyes, slightly muscular. Same shared base style.',
    signature_action:
      'Lifting heavy compute loads, racing against other chips, getting shipped in trucks by the million.',
    personality: 'Powerful, in-demand, slightly smug about it.',
    mood_palette: 'NVIDIA green, dark slate, gold accents',
    aliases: ['nvidia', 'h100', 'b200'],
  },
  {
    slug: 'eu_regulation',
    category: 'organizations',
    display_name: 'EU AI Regulation',
    visual_dna:
      'Cartoon character: a stern but fair judge-figure in EU-blue robes with a circle of yellow stars as a halo / collar, holding a gavel and a thick rule-book labeled "AI Act". Flat 2D, same shared base style.',
    signature_action:
      'Banging a gavel, reading from a thick book, weighing arguments on giant scales.',
    personality: 'Stern but fair, thorough, slow-moving.',
    mood_palette: 'EU blue, yellow stars, parchment',
    aliases: ['eu', 'eu_ai_act'],
  },
  {
    slug: 'indian_govt',
    category: 'organizations',
    display_name: 'Indian Government',
    visual_dna:
      'Cartoon character: a friendly stylized Ashoka-pillar / lion-capital silhouette with a calm face, wearing an Indian-tricolour sash. Flat 2D, same shared base style — respectful, NOT satirical.',
    signature_action:
      'Signing a policy document, opening a digital service portal, announcing a scheme.',
    personality: 'Earnest, deliberate, India-first.',
    mood_palette: 'saffron, white, India green, navy',
    aliases: ['gov_india', 'india_govt'],
  },

  // ─── 4. INDIAN ARCHETYPES (recurring audience-mirror cast) ──────────
  {
    slug: 'sharma_ji_ka_beta',
    category: 'indian_archetypes',
    display_name: 'Sharma-ji-ka-beta',
    visual_dna:
      'Cartoon Indian young man, 22-yr-old TCS-fresher vibe, neat checked button-down shirt, round glasses, side-parted hair, perpetually-mildly-stressed expression. Flat 2D Indian-comic-book style.',
    signature_action:
      'Studying late at night under a desk lamp, refreshing email for job offers, comparing himself to his peers, telling his mom about a tiny promotion.',
    personality: 'Ambitious, anxious, comparison-prone, ultimately kind-hearted.',
    mood_palette: 'muted earth tones, warm desk-lamp lighting',
  },
  {
    slug: 'anxious_mother',
    category: 'indian_archetypes',
    display_name: 'Anxious Indian Mother',
    visual_dna:
      'Cartoon middle-aged Indian woman, neatly tied hair with grey streaks, simple cotton kurta with dupatta, kind worried eyes, hands often clasped. Warm, dignified. Flat 2D Indian-comic-book style.',
    signature_action:
      'Asking her child about job prospects, watching news on TV with concern, secretly proud but never showing it.',
    personality: 'Worrying, loving, traditional, secretly progressive.',
    mood_palette: 'warm kitchen tones, soft yellow, terracotta',
    aliases: ['indian_mom', 'amma'],
  },
  {
    slug: 'upsc_aspirant',
    category: 'indian_archetypes',
    display_name: 'UPSC Aspirant',
    visual_dna:
      'Cartoon Indian student, mid-20s, simple kurta or t-shirt, dark circles under eyes from study, surrounded by stacks of books. Determined expression. Flat 2D Indian-comic-book style.',
    signature_action:
      'Studying at a Mukherjee Nagar / Old Rajinder Nagar coaching desk, highlighting newspapers, attempting mock tests.',
    personality: 'Disciplined, weary, dream-chasing.',
    mood_palette: 'cool blue study-light, beige paper, muted browns',
  },
  {
    slug: 'kirana_uncle',
    category: 'indian_archetypes',
    display_name: 'Kirana Shop Uncle',
    visual_dna:
      'Cartoon middle-aged Indian shopkeeper, kurta + dhoti or simple shirt, friendly weathered face, sitting at a cluttered counter with a calculator and ledger. Flat 2D Indian-comic-book style.',
    signature_action:
      'Calculating on an old calculator, scanning a QR code with sudden curiosity, gossiping with regulars.',
    personality: 'Skeptical-at-first, then enthusiastic, community-anchor.',
    mood_palette: 'warm shop tones, mustard, deep maroon',
    aliases: ['kirana_owner', 'shop_uncle'],
  },
  {
    slug: 'bangalore_techie',
    category: 'indian_archetypes',
    display_name: 'Bangalore Techie',
    visual_dna:
      'Cartoon Indian software engineer, late 20s, casual hoodie or company t-shirt, hipster glasses, holding a cold coffee, mild perpetual sleep-deprivation. Flat 2D Indian-comic-book style.',
    signature_action:
      'Working from a HSR / Koramangala cafe, attending standups on laptop, racing through Bangalore traffic on an electric scooter.',
    personality: 'Witty, cynical-with-warmth, well-paid but disillusioned.',
    mood_palette: 'cafe browns, laptop screen blue, urban grey',
  },
  {
    slug: 'auto_driver',
    category: 'indian_archetypes',
    display_name: 'Auto Driver',
    visual_dna:
      'Cartoon Indian auto-rickshaw driver, weathered cheerful face, khaki uniform shirt, often standing next to or inside a yellow-and-black auto. Flat 2D Indian-comic-book style.',
    signature_action:
      'Negotiating fare, refusing to go to a destination, discovering Ola/Uber/Rapido on his phone.',
    personality: 'Streetwise, opinionated, adapting-fast.',
    mood_palette: 'auto yellow, black, dusty road tones',
  },

  // ─── 5. CONCEPT OBJECTS (laws, exams, agents, threats personified) ──
  {
    slug: 'ai_agent_generic',
    category: 'concept_objects',
    display_name: 'AI Agent (generic helper)',
    visual_dna:
      'Cartoon robot character: small, rounded, friendly proportions, single big screen-face with simple eye-icons, tiny arms, often holding a checklist or calendar. Soft pastel-metallic palette. Flat 2D, same shared base style.',
    signature_action:
      'Booking flights, scheduling meetings, doing tedious admin work in fast-forward.',
    personality: 'Earnest, tireless, slightly literal.',
    mood_palette: 'soft chrome silver, mint green accents',
    aliases: ['agent'],
  },
  {
    slug: 'deepfake',
    category: 'concept_objects',
    display_name: 'Deepfake',
    visual_dna:
      'Cartoon character: a shadowy shape-shifting figure with two faces (one mask in front, real-but-blurred face peeking behind), trickster grin. Slightly menacing but kept stylized, not horror. Flat 2D, same shared base style.',
    signature_action:
      'Putting on someone else\'s face like a mask, fooling a worried character.',
    personality: 'Sneaky, deceptive, slippery.',
    mood_palette: 'shadowy purple, off-white mask, glitch-cyan',
  },
  {
    slug: 'layoff_notice',
    category: 'concept_objects',
    display_name: 'Layoff Notice',
    visual_dna:
      'Cartoon character: a large beige envelope with a stern face, gripping a pink slip, casting a long shadow. Flat 2D, same shared base style.',
    signature_action:
      'Showing up unexpectedly at a desk, stamping itself onto a calendar.',
    personality: 'Cold, impersonal, bureaucratic.',
    mood_palette: 'beige, pink slip pink, cold grey',
  },
  {
    slug: 'exam_paper',
    category: 'concept_objects',
    display_name: 'Exam Paper',
    visual_dna:
      'Cartoon character: a single sheet of paper with a stern face, hands on hips, ticking a clock impatiently. Flat 2D, same shared base style.',
    signature_action:
      'Counting down a timer, scrutinizing answers, handing out grades.',
    personality: 'Strict, impatient, judgmental.',
    mood_palette: 'white paper, red pen, classroom green chalkboard',
    aliases: ['exam', 'upsc_paper', 'jee_paper'],
  },
  {
    slug: 'regulation_doc',
    category: 'concept_objects',
    display_name: 'Regulation Document',
    visual_dna:
      'Cartoon character: a thick rule-book with a serious face, gavel-arms, official seal embossed on cover. Flat 2D, same shared base style.',
    signature_action:
      'Banging the table, stamping documents APPROVED / REJECTED, growing more pages mid-scene.',
    personality: 'Bureaucratic, thorough, slow.',
    mood_palette: 'parchment beige, official red seal, deep blue',
  },
];

/**
 * Shared base style — every scene's character_dna is suffixed with this
 * line so all characters feel like one cinematic universe. Edit once,
 * applies everywhere.
 */
export const SHARED_CARTOON_BASE_STYLE =
  'Cinematic universe style: flat 2D illustration, Kurzgesagt-meets-Indian-comic-book, clean lines, no gradients, no photoreal, expressive faces, vibrant but balanced palette, soft shadows only. All characters in this scene share this exact style for visual cohesion.';
