import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TtsResult {
  audio: Buffer;
  contentType: string; // e.g. 'audio/mpeg'
  ext: string;         // e.g. 'mp3'
  costUsd: number;
  model: string;
  provider: 'openai' | 'elevenlabs';
}

export interface TtsProvider {
  readonly name: 'openai' | 'elevenlabs';
  isConfigured(): boolean;
  /** Max characters per single synth request (callers chunk to this). */
  readonly maxChars: number;
  synthesize(text: string, opts?: { voice?: string }): Promise<TtsResult>;
}

/**
 * OpenAI TTS — reuses OPENAI_API_KEY. tts-1 is $15/1M chars, tts-1-hd $30/1M.
 * 4096-char input ceiling per request, so the agent chunks below maxChars.
 */
@Injectable()
export class OpenAITtsProvider implements TtsProvider {
  readonly name = 'openai' as const;
  readonly maxChars = 3800; // safety margin under OpenAI's 4096 limit
  private readonly logger = new Logger(OpenAITtsProvider.name);
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly defaultVoice: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('contentStudio.openai.apiKey');
    this.model = this.config.get<string>('contentStudio.tts.openaiModel') ?? 'tts-1';
    this.defaultVoice = this.config.get<string>('contentStudio.tts.openaiVoice') ?? 'onyx';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<TtsResult> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY not configured for TTS');
    const voice = opts?.voice ?? this.defaultVoice;
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        voice,
        input: text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI TTS ${res.status}: ${errBody.slice(0, 300)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    // tts-1 $15/1M chars; tts-1-hd $30/1M chars.
    const perChar = this.model.includes('hd') ? 0.00003 : 0.000015;
    return {
      audio,
      contentType: 'audio/mpeg',
      ext: 'mp3',
      costUsd: text.length * perChar,
      model: this.model,
      provider: 'openai',
    };
  }
}

/**
 * ElevenLabs TTS — dormant unless ELEVENLABS_API_KEY is set. Higher quality,
 * pricier. Switched on via CS_TTS_PROVIDER=elevenlabs or per-brand override.
 */
@Injectable()
export class ElevenLabsTtsProvider implements TtsProvider {
  readonly name = 'elevenlabs' as const;
  readonly maxChars = 4800; // ElevenLabs allows larger inputs
  private readonly logger = new Logger(ElevenLabsTtsProvider.name);
  private readonly apiKey?: string;
  private readonly voiceId: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('contentStudio.tts.elevenLabsApiKey');
    this.voiceId = this.config.get<string>('contentStudio.tts.elevenLabsVoiceId')!;
    this.model = this.config.get<string>('contentStudio.tts.elevenLabsModel')!;
    if (!this.apiKey) {
      this.logger.warn('ELEVENLABS_API_KEY not set — ElevenLabs TTS dormant');
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<TtsResult> {
    if (!this.apiKey) throw new Error('ELEVENLABS_API_KEY not configured');
    const voiceId = opts?.voice ?? this.voiceId;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: this.model,
        }),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => res.statusText);
      throw new Error(`ElevenLabs TTS ${res.status}: ${errBody.slice(0, 300)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    // Rough: ~$0.30 / 1k chars on the creator tier (varies by plan).
    return {
      audio,
      contentType: 'audio/mpeg',
      ext: 'mp3',
      costUsd: (text.length / 1000) * 0.3,
      model: this.model,
      provider: 'elevenlabs',
    };
  }
}
