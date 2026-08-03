import type { ApiConfig } from '../types';

/**
 * Unified LLM call — detects provider from endpoint and adapts format.
 *
 * OpenAI-compatible: POST /chat/completions  (OpenAI, DeepSeek, vLLM, etc.)
 * Anthropic:          POST /messages          (native Anthropic API)
 */

type Role = 'system' | 'user' | 'assistant';

interface Message {
  role: Role;
  content: string;
}

interface ChatParams {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

function isAnthropic(endpoint: string): boolean {
  return endpoint.includes('anthropic');
}

export async function chat(
  apiConfig: ApiConfig,
  params: ChatParams
): Promise<string> {
  const { systemPrompt, userMessage, temperature = 0.1, maxTokens = 4000 } = params;

  if (isAnthropic(apiConfig.endpoint)) {
    return callAnthropic(apiConfig, systemPrompt, userMessage, temperature, maxTokens);
  }

  return callOpenAI(apiConfig, systemPrompt, userMessage, temperature, maxTokens);
}

// ─── OpenAI-compatible (OpenAI, DeepSeek, and any /v1/chat/completions API) ───

async function callOpenAI(
  config: ApiConfig,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const baseUrl = config.endpoint.replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('LLM 返回空内容');
  }

  return content;
}

// ─── Anthropic native API ───

async function callAnthropic(
  config: ApiConfig,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const baseUrl = config.endpoint.replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  // Anthropic response: { content: [{ type: "text", text: "..." }], ... }
  const content: string | undefined = data.content?.[0]?.text;

  if (!content) {
    throw new Error('Anthropic 返回空内容');
  }

  return content;
}
