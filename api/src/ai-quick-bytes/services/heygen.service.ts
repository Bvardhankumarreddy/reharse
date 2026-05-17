import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface HeyGenGenerateParams {
  avatarId: string;
  voiceId: string;
  script: string;
  aspectRatio: '9:16' | '16:9';
  callbackUrl: string;
}

@Injectable()
export class HeyGenService {
  private readonly logger = new Logger(HeyGenService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('aiQuickBytes.heygen.baseUrl')
      ?? 'https://api.heygen.com/v2';
    this.apiKey = this.config.get<string>('aiQuickBytes.heygen.apiKey');
    if (!this.apiKey) {
      this.logger.warn('HEYGEN_API_KEY not set — video generation disabled (deferred integration)');
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /** Resolve a stored avatar key (cyber/robot/vardhan) to its HeyGen avatar id. */
  resolveAvatarId(avatarKey: string | null): string | undefined {
    const avatars = this.config.get<Record<string, string | undefined>>(
      'aiQuickBytes.heygen.avatars',
    ) ?? {};
    return avatars[avatarKey ?? 'vardhan'] ?? avatars['vardhan'];
  }

  async generateVideo(params: HeyGenGenerateParams): Promise<{ videoId: string }> {
    if (!this.apiKey) {
      throw new Error('HeyGen not configured — set HEYGEN_API_KEY to enable video generation');
    }

    try {
      const { data } = await axios.post(
        `${this.baseUrl}/video/generate`,
        {
          video_inputs: [{
            character: {
              type: 'avatar',
              avatar_id: params.avatarId,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              voice_id: params.voiceId,
              input_text: params.script,
            },
            background: { type: 'color', value: '#0A0E27' },
          }],
          dimension: params.aspectRatio === '9:16'
            ? { width: 1080, height: 1920 }
            : { width: 1920, height: 1080 },
          callback_url: params.callbackUrl,
        },
        {
          headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
          timeout: 30000,
        },
      );
      return { videoId: data?.data?.video_id };
    } catch (error) {
      const e = error as { response?: { data?: unknown }; message: string };
      this.logger.error(`HeyGen generation failed: ${JSON.stringify(e.response?.data ?? e.message)}`);
      throw error;
    }
  }

  async getVideoStatus(videoId: string): Promise<{
    status: string;
    videoUrl?: string;
    error?: string;
  }> {
    if (!this.apiKey) throw new Error('HeyGen not configured');
    const { data } = await axios.get(
      `${this.baseUrl}/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      { headers: { 'X-Api-Key': this.apiKey }, timeout: 30000 },
    );
    return {
      status: data?.data?.status,
      videoUrl: data?.data?.video_url,
      error: data?.data?.error?.message,
    };
  }
}
