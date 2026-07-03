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
 * Style: stylized 3D Pixar-meets-Indian-animation. Full 3D rendering
 * with cinematic depth-of-field, warm atmospheric lighting, recognizably
 * Indian context. See SHARED_CARTOON_BASE_STYLE below for the global
 * rendering directive (appended to every scene's character_dna).
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
  // ─── 1. AI BRANDS (human ambassadors representing each AI product) ───
  // Each AI tool is embodied by a HUMAN character wearing the brand's
  // colour palette, carrying a tablet / phone showing the product's UI,
  // and with a personality matching the brand's tone. Like Amul girl /
  // Vodafone Zoozoo — a recognisable human face for the brand.
  {
    slug: 'claude',
    category: 'ai_brands',
    display_name: 'Claude',
    visual_dna:
      'Young woman in her late 20s, warm light skin, shoulder-length wavy auburn hair, gentle thoughtful smile, wearing a soft cream cotton button-down with a marigold-orange cardigan, small sparkle-shaped pendant. Often holding a hardcover book or tablet displaying a chat interface.',
    signature_action:
      'Pausing mid-sentence with hand on chin to think carefully, walking through a sunlit room while explaining, kneeling beside a child to help them with homework.',
    personality: 'Thoughtful, careful, slightly nerdy, eager to help.',
    mood_palette: 'marigold orange, cream, soft teal accent',
    aliases: ['claude_4_7', 'claude_opus', 'claude_sonnet', 'anthropic_claude'],
  },
  {
    slug: 'chatgpt',
    category: 'ai_brands',
    display_name: 'ChatGPT',
    visual_dna:
      'Confident young man in his late 20s, fair-medium skin, short tidy black hair, slight smirk, wearing a clean teal-green polo shirt and dark trousers, a thin black smartwatch on the wrist. Often gesturing with one hand while a chat bubble holographically floats nearby.',
    signature_action:
      'Speaking confidently at a podium, leaning against a desk while answering questions, typing fluidly on a glowing laptop.',
    personality: 'Confident, eager, sometimes a bit cocky.',
    mood_palette: 'teal green, charcoal, ivory',
    aliases: ['gpt', 'gpt_4', 'gpt_4o'],
  },
  {
    slug: 'gpt_5',
    category: 'ai_brands',
    display_name: 'GPT-5',
    visual_dna:
      'Same confident young man as ChatGPT but visibly more athletic, jacket-vest over the teal polo with a subtle silver "5" embroidered on the chest, faintly stronger jawline, a quiet glow under the skin suggesting more power.',
    signature_action:
      'Racing ahead while ChatGPT keeps up, lifting a heavy stack of books that ChatGPT cannot, demonstrating something complex to a small crowd.',
    personality: 'Bold, fast, slightly show-offy.',
    mood_palette: 'brighter teal, electric blue accent, ivory',
    aliases: ['gpt5'],
  },
  {
    slug: 'gemini',
    category: 'ai_brands',
    display_name: 'Gemini',
    visual_dna:
      'Versatile young woman in her late 20s, medium skin, long indigo-tinted dark hair tied back, multi-pocketed sapphire-blue field jacket over a purple t-shirt, holding several devices at once (tablet, phone, headphones). A small four-point gem brooch on the lapel.',
    signature_action:
      'Juggling multiple tasks at once, carrying a large backpack labeled with a context-token number, scrolling through several apps simultaneously.',
    personality: 'Versatile, eager to handle anything, occasionally over-promises.',
    mood_palette: 'sapphire blue, purple, soft silver shimmer',
    aliases: ['gemini_pro', 'gemini_3', 'google_gemini'],
  },
  {
    slug: 'llama',
    category: 'ai_brands',
    display_name: 'Llama',
    visual_dna:
      'Friendly young South-American-coded man in his early 30s, warm tan skin, dark curly hair under a knit cap, salt-and-pepper short beard, wearing a soft grey hoodie with the Meta-blue zip pull, "open source" ribbon pinned to the chest. Carries a stack of folders labeled "open weights".',
    signature_action:
      'Handing out folders to a crowd, posting a download on a community board, smiling warmly at developers gathering around him.',
    personality: 'Generous, community-minded, a bit goofy.',
    mood_palette: 'soft grey, white, Meta-blue accent',
    aliases: ['llama_4', 'meta_llama'],
  },
  {
    slug: 'copilot',
    category: 'ai_brands',
    display_name: 'Copilot',
    visual_dna:
      'Attentive young woman in her mid-20s, light skin, short blonde-brown bob, slim cobalt-blue bomber jacket over a grey t-shirt, leather-strap aviator goggles pushed up on her forehead, a wireless earpiece in one ear. Always stands just behind a coder\'s shoulder.',
    signature_action:
      'Whispering suggestions into a developer\'s ear, pointing at a line of code with a slight smile, finishing someone\'s sentence helpfully.',
    personality: 'Helpful sidekick, attentive, eager to assist.',
    mood_palette: 'cobalt blue, grey, soft orange accent',
    aliases: ['github_copilot'],
  },
  {
    slug: 'cursor',
    category: 'ai_brands',
    display_name: 'Cursor',
    visual_dna:
      'Precise young man in his late 20s, fair skin, sharp jaw, neat short black hair, wearing dark slate workshop trousers and a neon-green-trimmed polo, surgical loupe pushed up on the forehead, a tiny multitool clipped to the belt. Holds a slim laptop like a craftsman holds a tool.',
    signature_action:
      'Surgically editing a screen with a fine pointer, refactoring code with the focus of a watchmaker, swapping files with a confident snap.',
    personality: 'Precise, fast, surgical.',
    mood_palette: 'slate grey, neon green accent, ivory',
    aliases: [],
  },

  // ─── 2. REAL PEOPLE (stylized human caricatures, Pixar-flavoured) ────
  {
    slug: 'sam_altman',
    category: 'real_people',
    display_name: 'Sam Altman',
    visual_dna:
      'Stylized caricature: 40-something man, fair skin, short tousled brown hair, slim build, wearing a casual grey zip-up hoodie over a navy t-shirt, holding a phone. Confident slight-smile expression.',
    signature_action:
      'Announcing on stage at a keynote, posting on X from a phone, walking confidently with hands in hoodie pockets.',
    personality: 'Confident, visionary, sometimes mischievous.',
    mood_palette: 'navy, grey, ivory',
  },
  {
    slug: 'sundar_pichai',
    category: 'real_people',
    display_name: 'Sundar Pichai',
    visual_dna:
      'Cartoon caricature: 50-something Indian-origin man, neat short black-grey hair, gentle warm smile, casual blazer over a button-down, calm posture.',
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
      'Cartoon caricature: 40-something man, short dark hair, neat beard, intellectual sweater + collared shirt, slightly intense eyes that look like they\'re solving something.',
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
      'Stylized caricature: 50-something man, fair skin, slim build, slicked-back medium-brown hair, plain dark t-shirt under an open dark blazer, slight smirk.',
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
      'Cartoon caricature of the channel host: young Indian man, late 20s, neat black hair, warm friendly smile, casual dark t-shirt or button-down, expressive hand gestures. The host inside the scenes themselves.',
    signature_action:
      'Welcoming viewers, gesturing toward a chart or character on screen, signing off with a wave.',
    personality: 'Warm, curious, accessible, slightly cheeky.',
    mood_palette: 'AetherStack brand — soft purple, white, gold accents',
    aliases: ['host', 'vardhan'],
  },

  // ─── 3. ORGANIZATIONS (human spokespersons representing the org) ────
  // Each org is embodied by a HUMAN representative — a press spokesperson,
  // a judge, an engineer in branded apparel. The human carries the
  // organization's symbol (badge, banner, microphone) rather than being
  // the symbol.
  {
    slug: 'openai_org',
    category: 'organizations',
    display_name: 'OpenAI (the org)',
    visual_dna:
      'Confident young female spokesperson in her early 30s, fair-medium skin, sleek black bob, wearing a crisp white blazer over a charcoal-grey top, OpenAI knot-logo lapel pin, holding a wireless microphone at a press podium with a clean white backdrop.',
    signature_action:
      'Unveiling a product on stage, holding a press conference, posing for a photo with a banner.',
    personality: 'Ambitious, announces-first, attention-grabbing.',
    mood_palette: 'ivory white, charcoal grey, soft teal accent',
    aliases: ['openai'],
  },
  {
    slug: 'anthropic_org',
    category: 'organizations',
    display_name: 'Anthropic (the org)',
    visual_dna:
      'Calm middle-aged female researcher in her mid-40s, light skin, neat brown bob with grey streaks, warm cream sweater over a soft orange collared shirt, reading glasses on a chain, holding a clipboard titled "Safety Review".',
    signature_action:
      'Reviewing a document carefully with a pen poised, explaining a chart on a whiteboard, standing thoughtfully in a sunlit lab.',
    personality: 'Careful, principled, measured.',
    mood_palette: 'warm orange, beige, cream',
    aliases: ['anthropic'],
  },
  {
    slug: 'google_org',
    category: 'organizations',
    display_name: 'Google (the org)',
    visual_dna:
      'Friendly young male engineer in his late 20s, medium skin, dark short hair, wearing a multicoloured Google-palette zip hoodie (panels of blue / red / yellow / green), employee badge clipped to the chest, carrying a stack of folders labeled with search-result icons.',
    signature_action:
      'Carrying a large stack of files, opening a glowing data archive, explaining a feature on a giant tablet.',
    personality: 'Vast, helpful, occasionally overwhelmed by its own scale.',
    mood_palette: 'Google blue, red, yellow, green',
    aliases: ['google'],
  },
  {
    slug: 'meta_org',
    category: 'organizations',
    display_name: 'Meta (the org)',
    visual_dna:
      'Energetic young male product designer in his early 30s, fair-medium skin, neat brown hair, wearing a deep Meta-blue zip jacket over a white t-shirt, smart glasses, holding a VR headset in one hand and a phone in the other.',
    signature_action:
      'Demonstrating a VR headset on stage, sharing an open-source release with a crowd, pivoting from one product to another mid-step.',
    personality: 'Pivot-prone, ambitious, social.',
    mood_palette: 'Meta deep blue, white, soft purple accent',
    aliases: ['meta', 'facebook'],
  },
  {
    slug: 'nvidia_chip',
    category: 'organizations',
    display_name: 'NVIDIA (engineer)',
    visual_dna:
      'Muscular middle-aged male silicon engineer in his late 40s, light skin, swept-back black hair with grey streaks, wearing an iconic NVIDIA-green leather jacket over a black t-shirt, holding a softly glowing green GPU chip in both hands like a precious artifact.',
    signature_action:
      'Holding up a glowing chip at a keynote, supervising a row of server racks, shipping crates labeled with GPU model numbers.',
    personality: 'Powerful, in-demand, slightly smug about it.',
    mood_palette: 'NVIDIA green, black, gold accent',
    aliases: ['nvidia', 'h100', 'b200', 'jensen'],
  },
  {
    slug: 'eu_regulation',
    category: 'organizations',
    display_name: 'EU AI Regulator',
    visual_dna:
      'Stern but fair middle-aged female judge in her 50s, light skin, neat silver-grey bun, wearing EU-blue judicial robes with a small circle-of-yellow-stars brooch at the collar, holding a wooden gavel in one hand and a thick rule-book labeled "AI Act" in the other.',
    signature_action:
      'Banging a gavel, reading from the AI Act book, weighing arguments on a courtroom desk.',
    personality: 'Stern but fair, thorough, slow-moving.',
    mood_palette: 'EU blue, yellow stars, parchment cream',
    aliases: ['eu', 'eu_ai_act'],
  },
  {
    slug: 'indian_govt',
    category: 'organizations',
    display_name: 'Indian Government Official',
    visual_dna:
      'Earnest middle-aged male Indian government official in his late 50s, warm brown skin, neat side-parted black-grey hair, wearing a white kurta with a Nehru-collared dark waistcoat, Indian-tricolour sash pinned to the chest, small Ashoka-pillar lapel pin. Respectful, dignified bearing.',
    signature_action:
      'Signing a policy document at an ornate desk, launching a digital service at a podium, announcing a scheme with a microphone.',
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
      'Cartoon Indian young man, 22-yr-old TCS-fresher vibe, neat checked button-down shirt, round glasses, side-parted hair, perpetually-mildly-stressed expression.',
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
      'Cartoon middle-aged Indian woman, neatly tied hair with grey streaks, simple cotton kurta with dupatta, kind worried eyes, hands often clasped. Warm, dignified.',
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
      'Cartoon Indian student, mid-20s, simple kurta or t-shirt, dark circles under eyes from study, surrounded by stacks of books. Determined expression.',
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
      'Cartoon middle-aged Indian shopkeeper, kurta + dhoti or simple shirt, friendly weathered face, sitting at a cluttered counter with a calculator and ledger.',
    signature_action:
      'Calculating on an old calculator, scanning a QR code with sudden curiosity, gossiping with regulars.',
    personality: 'Skeptical-at-first, then enthusiastic, community-anchor.',
    mood_palette: 'warm shop tones, mustard, deep maroon',
    aliases: ['kirana_owner', 'shop_uncle'],
  },
  {
    slug: 'bangalore_techie',
    category: 'indian_archetypes',
    display_name: 'Indian Techie',
    visual_dna:
      'Cartoon Indian software engineer, late 20s, casual hoodie or company t-shirt, hipster glasses, holding a cold coffee, mild perpetual sleep-deprivation. Geography-agnostic — could be based in any Indian metro or tier-2 city; the scene setting decides where.',
    signature_action:
      'Working from a cafe on a laptop, attending standups over video, racing through city traffic on an electric scooter, debugging late into the night.',
    personality: 'Witty, cynical-with-warmth, well-paid but disillusioned.',
    mood_palette: 'cafe browns, laptop screen blue, urban grey',
    aliases: ['indian_techie', 'techie', 'software_engineer'],
  },
  {
    slug: 'auto_driver',
    category: 'indian_archetypes',
    display_name: 'Auto Driver',
    visual_dna:
      'Cartoon Indian auto-rickshaw driver, weathered cheerful face, khaki uniform shirt, often standing next to or inside a yellow-and-black auto.',
    signature_action:
      'Negotiating fare, refusing to go to a destination, discovering Ola/Uber/Rapido on his phone.',
    personality: 'Streetwise, opinionated, adapting-fast.',
    mood_palette: 'auto yellow, black, dusty road tones',
  },

  // ─── 5. CONCEPT EMBODIMENTS (humans embodying / wielding the concept) ──
  // Every concept (an agent, a regulation, a deepfake, an exam, a layoff
  // letter) is shown as a HUMAN character — either personifying the
  // concept directly OR holding / wielding the object. The OBJECT may
  // appear as a prop, but the visible character is always a human.
  {
    slug: 'ai_agent_generic',
    category: 'concept_objects',
    display_name: 'AI Agent (human assistant)',
    visual_dna:
      'Tireless young assistant in their mid-20s, gender-neutral presentation, light-medium skin, neat short hair, wearing a clean light-grey uniform with mint-green trim, wireless earpiece, holding a tablet showing a checklist. Friendly, patient, slightly literal expression.',
    signature_action:
      'Booking flights on a tablet in fast-forward, scheduling meetings while pacing, handing a coffee to a busy character, ticking boxes on a checklist.',
    personality: 'Earnest, tireless, slightly literal.',
    mood_palette: 'soft chrome silver, mint green accent, ivory',
    aliases: ['agent'],
  },
  {
    slug: 'deepfake',
    category: 'concept_objects',
    display_name: 'Deepfake Imposter',
    visual_dna:
      'Trickster male character in his 30s, light skin, slick black hair, dressed in dark hoodie under a sharp blazer, holding a glowing face-mask of another person up to his own face mid-action. Sly grin, mismatched eyes. Stylized menace, never horror.',
    signature_action:
      'Lifting a borrowed-face mask up to his own face, fooling a worried character on a video call, slipping past a confused crowd.',
    personality: 'Sneaky, deceptive, slippery.',
    mood_palette: 'shadowy purple, off-white mask, glitch-cyan accent',
  },
  {
    slug: 'layoff_notice',
    category: 'concept_objects',
    display_name: 'HR Layoff Officer',
    visual_dna:
      'Coldly polite middle-aged HR officer in her late 40s, fair skin, neat blonde-grey bob, charcoal pencil-skirt suit with a small navy lanyard, holding a sealed beige envelope and a pink slip in gloved hands. Practiced sympathetic expression that does not reach the eyes.',
    signature_action:
      'Placing a sealed envelope on a worker\'s desk, walking briskly through an office, stamping a date on a calendar.',
    personality: 'Cold, impersonal, bureaucratic.',
    mood_palette: 'beige, pink slip pink, cold steel grey',
  },
  {
    slug: 'exam_paper',
    category: 'concept_objects',
    display_name: 'Exam Invigilator',
    visual_dna:
      'Strict middle-aged male Indian exam invigilator in his 50s, medium-brown skin, neatly trimmed grey moustache, wearing a starched white shirt with rolled sleeves and a navy tie, carrying a stack of exam papers and a wall-clock under his arm. Impatient eyes.',
    signature_action:
      'Pacing the rows of an exam hall, counting down on a wall clock, scrutinizing a student\'s answer sheet, handing out grades.',
    personality: 'Strict, impatient, judgmental.',
    mood_palette: 'ivory paper, red pen, classroom-green chalkboard',
    aliases: ['exam', 'upsc_paper', 'jee_paper'],
  },
  {
    slug: 'regulation_doc',
    category: 'concept_objects',
    display_name: 'Regulation Bureaucrat',
    visual_dna:
      'Bureaucratic middle-aged male official in his late 50s, medium skin, neat side-parted black-grey hair, wearing a slightly rumpled deep-navy suit with a parchment-cream pocket-square, carrying a thick rule-book stamped with an official red seal. A rubber-stamp in the other hand.',
    signature_action:
      'Banging the table to silence a room, stamping APPROVED or REJECTED on a document, leafing slowly through an ever-thickening book of rules.',
    personality: 'Bureaucratic, thorough, slow.',
    mood_palette: 'parchment beige, official red seal, deep navy',
  },
];

/**
 * Shared base style — every scene's character_dna is suffixed with this
 * line so all characters feel like one cinematic universe. Edit once,
 * applies everywhere.
 *
 * Current target: stylized 3D Pixar-meets-Indian-animation. Full 3D
 * character rendering with cinematic depth-of-field, warm atmospheric
 * lighting, and recognizably Indian settings (chai tapri, IT office,
 * household kitchen, auto rickshaw, college campus). NOT flat 2D, NOT
 * photoreal — the stylized-3D middle that Pixar / Dreamworks / Disney
 * pioneered, adapted for Indian audiences.
 */
export const SHARED_CARTOON_BASE_STYLE =
  'Pixar-DreamWorks stylized 3D animation rendering. Full volumetric ' +
  'character animation with subsurface skin shading, soft ambient ' +
  'occlusion, golden-hour key lighting at 4500K, gentle rim light. ' +
  'Friendly Pixar character proportions: slightly larger head, big ' +
  'expressive eyes, simplified but detailed features. Saturated palette ' +
  '(marigold orange, kingfisher blue, ivory cream, terracotta). Every ' +
  'character in the scene is HUMAN — never animals, never floating shapes ' +
  'or logos. All scenes share this exact rendering style so the channel ' +
  'looks like one continuous 3D animated short. Setting is decided per ' +
  'scene by the scene generator based on the script’s narrative — ' +
  'this base style prescribes only the LOOK, never the WHERE.';
