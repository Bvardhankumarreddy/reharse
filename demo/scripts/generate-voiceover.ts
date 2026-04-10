import fs from 'fs';
import path from 'path';
import https from 'https';
import { config as loadEnv } from 'dotenv';

// Load .env from the demo/ directory
loadEnv({ path: path.resolve(__dirname, '../.env') });

// ─── Config ─────────────────────────────────────────────────────────────────
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // "Adam" — professional male voice
// Other voices:
//   "EXAVITQu4vr4xnSDxMaL" — Bella (female, warm)
//   "ErXwobaYiN019PkySvjV" — Antoni (male, clear)
//   "MF3mGyEYCl7XYWbV9V6O" — Elli (female, young)

const AUDIO_DIR = path.resolve('./demo-output/audio');

// ─── Voiceover Script — One entry per scene ──────────────────────────────────
// Timing matches the Playwright script scenes in record-demo.ts
const VOICEOVER_SCRIPT: { scene: string; text: string }[] = [
  {
    scene: '01_pricing',
    text: 'Most interview prep tools give you a list of questions and leave you on your own. Rehearse is different. It listens to your answer, adapts the next question, and gives you honest AI feedback — like a real interviewer would. And it is free to start.',
  },
  {
    scene: '02_signin',
    text: 'Signing in takes seconds. No credit card required. Your sessions, transcripts, and resume are encrypted and never used for model training.',
  },
  {
    scene: '03_dashboard',
    text: 'This is your dashboard. Your AI Readiness Score updates after every session. Your practice streak keeps you consistent. And the weak areas panel shows exactly what to focus on — based on your actual performance, not a generic checklist.',
  },
  {
    scene: '04_setup',
    text: 'Setting up a session takes one screen. Pick your interview type — behavioral, coding, system design, HR, or case study. Set your target role and company. The AI calibrates the difficulty and question style to match exactly what that company actually asks.',
  },
  {
    scene: '05_session',
    text: 'The session is live. Your first question is generated fresh — no question bank, no recycled prompts. It knows your role, your target company, and your experience level. Type your answer. When you submit, the AI reads what you wrote and decides what to probe next. This is where the adaptive piece happens.',
  },
  {
    scene: '06_feedback',
    text: 'Your feedback report is ready. Overall score out of one hundred. Five dimensions — communication, structure, depth, examples, and confidence. Scroll down to see every question broken down with your strengths, specific improvements, and what a strong answer would have looked like. At the bottom, your weak areas and your next steps. This is not generic feedback. It is calibrated to your actual answers.',
  },
  {
    scene: '07_progress',
    text: 'The progress page tracks your score trend across every session. The more you practice, the more accurate your AI Readiness Score becomes. Weak areas that show up repeatedly get flagged here — and fed directly into future question generation.',
  },
  {
    scene: '08_star_builder',
    text: 'The STAR Builder turns rough notes into a polished structured answer. Paste what you remember — the AI formats it into Situation, Task, Action, and Result.',
  },
  {
    scene: '09_jd_match',
    text: 'JD Match compares a job description to your profile. You get a match score, missing keywords, and exactly what to prepare for this role.',
  },
  {
    scene: '10_question_bank',
    text: 'Over 1,800 questions across all interview types. Filter by type, difficulty, or company — then build a custom session with adaptive follow-ups.',
  },
  {
    scene: '11_settings',
    text: 'Free gives you five sessions a week with full AI feedback. Pro unlocks everything. Or grab a Day Pass for 99 rupees — full Pro access for 24 hours.',
  },
  {
    scene: '12_closing',
    text: 'That is Rehearse. Adaptive questions, honest feedback, the full interview loop. Start free at app dot rehearse dot AI. Good luck.',
  },
];

// ─── ElevenLabs API Call ─────────────────────────────────────────────────────
async function generateAudio(text: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path:     `/v1/text-to-speech/${VOICE_ID}`,
      method:   'POST',
      headers: {
        'Accept':       'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key':   ELEVENLABS_API_KEY,
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const body = Buffer.concat(chunks).toString('utf8');
          reject(new Error(`ElevenLabs ${res.statusCode}: ${body}`));
          return;
        }
        fs.writeFileSync(outputPath, Buffer.concat(chunks));
        resolve();
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function generateAllVoiceovers() {
  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY is not set in .env');
    process.exit(1);
  }

  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }

  console.log(`🎙️  Generating ${VOICEOVER_SCRIPT.length} voiceover clips...`);
  console.log(`🔊 Voice: Adam (ElevenLabs)\n`);

  for (const { scene, text } of VOICEOVER_SCRIPT) {
    const outputPath = path.join(AUDIO_DIR, `${scene}.mp3`);

    if (fs.existsSync(outputPath)) {
      console.log(`  ⏭️  ${scene}... skipped (already exists)`);
      continue;
    }

    process.stdout.write(`  ⏳ ${scene}... `);
    await generateAudio(text, outputPath);
    console.log(`✅ saved`);

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✅ All voiceovers saved to: ${AUDIO_DIR}`);
  console.log(`\n📋 Next step — merge audio with video:`);
  console.log(`   npm run merge-audio\n`);
}

generateAllVoiceovers();
