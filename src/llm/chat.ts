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
  maxTokens?: number; // 不传则由模型自行决定上限
  timeoutMs?: number; // 单次请求超时，默认 120s
  onRetry?: (attempt: number, max: number, reason: string) => void;
}

function isAnthropic(endpoint: string): boolean {
  return endpoint.includes('anthropic');
}

// ─── Retry policy ───

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = [429, 500, 502, 503, 504, 529];

/** Thrown for transient upstream failures worth retrying */
class TransientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function chat(
  apiConfig: ApiConfig,
  params: ChatParams
): Promise<string> {
  const {
    systemPrompt,
    userMessage,
    temperature = 0.1,
    maxTokens,
    timeoutMs = 120_000,
    onRetry,
  } = params;

  const provider = isAnthropic(apiConfig.endpoint) ? 'anthropic' : 'openai';
  console.log(`[LLM chat] provider=${provider}, model=${apiConfig.model}, endpoint=${apiConfig.endpoint}`);

  const call = () =>
    provider === 'anthropic'
      ? callAnthropic(apiConfig, systemPrompt, userMessage, temperature, maxTokens, timeoutMs)
      : callOpenAI(apiConfig, systemPrompt, userMessage, temperature, maxTokens, timeoutMs);

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await call();
    } catch (err) {
      lastError = err;

      // Only transient upstream errors are retried. Config errors (401/403/404),
      // timeouts, and parse failures fail fast.
      if (!(err instanceof TransientError) || attempt === MAX_ATTEMPTS) {
        throw err;
      }

      const backoffMs = 2000 * 2 ** (attempt - 1); // 2s, 4s
      console.warn(`[LLM chat] attempt ${attempt} failed (${err.status}), retrying in ${backoffMs}ms`);
      onRetry?.(attempt + 1, MAX_ATTEMPTS, `服务繁忙 (${err.status})`);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

// ─── Shared fetch with timeout ───

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `请求超时（${Math.round(timeoutMs / 1000)}秒）。服务可能繁忙或网络不稳定，请稍后重试。`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── OpenAI-compatible (OpenAI, DeepSeek, and any /v1/chat/completions API) ───

async function callOpenAI(
  config: ApiConfig,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number | undefined,
  timeoutMs: number,
): Promise<string> {
  const baseUrl = config.endpoint.replace(/\/+$/, '');

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
  };
  if (maxTokens) body.max_tokens = maxTokens;

  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );

  if (!response.ok) {
    const errText = await response.text();
    const msg = `LLM API error (${response.status}): ${errText.slice(0, 300)}`;
    if (RETRYABLE_STATUS.includes(response.status)) {
      throw new TransientError(msg, response.status);
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const content: string | undefined = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error('[LLM callOpenAI] Unexpected response:', JSON.stringify(data).slice(0, 500));
    throw new Error(`LLM 返回空内容。finish_reason=${data.choices?.[0]?.finish_reason || 'unknown'}`);
  }

  return content;
}

// ─── Anthropic native API ───

async function callAnthropic(
  config: ApiConfig,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number | undefined,
  timeoutMs: number,
): Promise<string> {
  const baseUrl = config.endpoint.replace(/\/+$/, '');

  const response = await fetchWithTimeout(
    `${baseUrl}/messages`,
    {
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
        // Anthropic 要求 max_tokens 必传，不限制时给最大值
        max_tokens: maxTokens || 16384,
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    const errText = await response.text();
    const msg = `Anthropic API error (${response.status}): ${errText.slice(0, 300)}`;
    if (RETRYABLE_STATUS.includes(response.status)) {
      throw new TransientError(msg, response.status);
    }
    throw new Error(msg);
  }

  const data = await response.json();
  // Anthropic response: { content: [{ type: "text", text: "..." }], ... }
  const content: string | undefined = data.content?.[0]?.text;

  if (!content) {
    console.error('[LLM callAnthropic] Unexpected response:', JSON.stringify(data).slice(0, 500));
    throw new Error(`Anthropic 返回空内容。stop_reason=${data.stop_reason || 'unknown'}`);
  }

  return content;
}
