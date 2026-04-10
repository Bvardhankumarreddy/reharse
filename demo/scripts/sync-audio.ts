import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ─── Paths ───────────────────────────────────────────────────────────────────
const OUTPUT_DIR  = path.resolve('./demo-output');
const AUDIO_DIR   = path.join(OUTPUT_DIR, 'audio');
const FINAL_DIR   = path.join(OUTPUT_DIR, 'final');
const TIMINGS_FILE = path.join(OUTPUT_DIR, 'scene-timings.json');

// ─── Types ───────────────────────────────────────────────────────────────────
interface SceneTiming { scene: string; startMs: number; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd: string, label: string) {
  process.stdout.write(`  ⏳ ${label}... `);
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log('✅');
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    console.error('❌');
    console.error((err.stderr || err.stdout || String(e)).toString());
    process.exit(1);
  }
}

function ffprobeDurationMs(filePath: string): number {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { stdio: 'pipe' },
  ).toString().trim();
  return Math.round(parseFloat(out) * 1000);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function syncAudio() {
  // ── Validate inputs ──────────────────────────────────────────────────────
  if (!fs.existsSync(TIMINGS_FILE)) {
    console.error(`❌ scene-timings.json not found at ${TIMINGS_FILE}`);
    console.error('   Run "npm run record" first to generate it.');
    process.exit(1);
  }

  const webmFiles = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.webm'))
    .sort()
    .map(f => path.join(OUTPUT_DIR, f));

  if (webmFiles.length === 0) {
    console.error('❌ No .webm video found in demo-output/. Run "npm run record" first.');
    process.exit(1);
  }

  const videoFile = webmFiles[webmFiles.length - 1];
  const timings: SceneTiming[] = JSON.parse(fs.readFileSync(TIMINGS_FILE, 'utf-8'));

  console.log('');
  console.log('🎬 Syncing voiceover to video...');
  console.log(`   Video  : ${path.basename(videoFile)}`);
  console.log(`   Timings: ${timings.length} scenes`);
  console.log('');

  fs.mkdirSync(FINAL_DIR, { recursive: true });

  // ── Check every scene has an audio clip ─────────────────────────────────
  const missing = timings.filter(t => !fs.existsSync(path.join(AUDIO_DIR, `${t.scene}.mp3`)));
  if (missing.length > 0) {
    console.error(`❌ Missing audio clips: ${missing.map(m => m.scene).join(', ')}`);
    console.error('   Run "npm run voiceover" to generate them.');
    process.exit(1);
  }

  // ── Get video duration so we can size the audio track correctly ──────────
  const videoDurationMs = ffprobeDurationMs(videoFile);
  console.log(`   Video duration: ${(videoDurationMs / 1000).toFixed(1)}s`);
  console.log('');

  // ── Build ffmpeg filter_complex that:
  //    1. Reads each scene MP3
  //    2. Delays it by its scene start timestamp (adelay)
  //    3. Mixes all delayed streams together (amix)
  //    4. Trims to video duration (atrim)
  // ─────────────────────────────────────────────────────────────────────────

  const inputs: string[]  = [];
  const filterParts: string[] = [];
  const streamLabels: string[] = [];

  timings.forEach((t, i) => {
    const mp3 = path.join(AUDIO_DIR, `${t.scene}.mp3`);
    const durationMs = ffprobeDurationMs(mp3);
    const delayMs = t.startMs;

    inputs.push(`-i "${mp3}"`);
    filterParts.push(`[${i}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
    streamLabels.push(`[a${i}]`);

    console.log(`  ${t.scene.padEnd(20)} start=${(delayMs/1000).toFixed(1)}s  duration=${(durationMs/1000).toFixed(1)}s`);
  });

  console.log('');

  const filterComplex = [
    ...filterParts,
    `${streamLabels.join('')}amix=inputs=${timings.length}:normalize=0[mixed]`,
    `[mixed]atrim=0:${videoDurationMs / 1000}[audio]`,
  ].join('; ');

  const date = new Date().toISOString().split('T')[0];
  const outputFile = path.join(FINAL_DIR, `rehearse-demo-${date}.mp4`);
  const syncedAudio = path.join(AUDIO_DIR, 'synced-voiceover.aac');

  // Step 1: Render the synced audio track to a file first (easier to debug)
  const audioCmd = [
    'ffmpeg -y',
    inputs.join(' '),
    `-filter_complex "${filterComplex}"`,
    `-map "[audio]"`,
    `-c:a aac -b:a 128k`,
    `"${syncedAudio}"`,
  ].join(' ');

  run(audioCmd, 'Rendering synced audio track');

  // Step 2: Mux synced audio into video
  const muxCmd = [
    'ffmpeg -y',
    `-i "${videoFile}"`,
    `-i "${syncedAudio}"`,
    `-c:v libx264 -crf 22 -preset medium`,
    `-c:a aac -b:a 128k`,
    `-shortest`,
    `"${outputFile}"`,
  ].join(' ');

  run(muxCmd, 'Muxing audio into video');

  console.log('');
  console.log(`✅ Final video: ${outputFile}`);
  console.log('');
  console.log('📤 Upload to:');
  console.log('   YouTube  — upload directly');
  console.log('   LinkedIn — native MP4, keep under 3 min');
  console.log(`   Twitter  — ffmpeg -i "${outputFile}" -t 60 -c copy twitter-clip.mp4`);
  console.log('');
}

syncAudio();
