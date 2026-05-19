export type ProviderName = 'openai' | 'anthropic';

export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Hint the model to return a single JSON object. */
  jsonOutput?: boolean;
}

export interface LlmResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  /** True if this adapter handles the given model id. */
  supports(model: string): boolean;
  isConfigured(): boolean;
  complete(req: LlmRequest): Promise<LlmResult>;
}

/** Claude ids → anthropic, gpt/o-series → openai. */
export function providerForModel(model: string): ProviderName {
  return /^claude/i.test(model) ? 'anthropic' : 'openai';
}

/** Strip ```json … ``` fences (Claude often wraps JSON). */
export function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}
