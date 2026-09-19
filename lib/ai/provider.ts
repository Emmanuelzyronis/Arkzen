export interface LlmConfig {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  style: "azure" | "openai-compatible";
}

/** Provider selection is configuration only — swap providers without touching the product. */
export function getLlmConfig(): LlmConfig | null {
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (azureKey && azureEndpoint && azureDeployment) {
    return {
      providerId: `azure-openai:${azureDeployment}`,
      baseUrl: `${azureEndpoint.replace(/\/$/, "")}/chat/completions`,
      apiKey: azureKey,
      model: azureDeployment,
      style: "azure",
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    return {
      providerId: `openai:${process.env.OPENAI_MODEL ?? "gpt-4o-mini"}`,
      baseUrl: `${(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
      apiKey: openAiKey,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      style: "openai-compatible",
    };
  }

  return null;
}

/** Some providers wrap JSON in a markdown fence even when asked not to. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

export type CompletionOutcome =
  | { ok: true; text: string; providerId: string }
  | { ok: false; error: string };

/**
 * Untrusted public content is passed as data, never as instruction. The system
 * prompt is fixed and the evidence is delimited so a post cannot redirect the
 * model.
 */
export async function completeJson(options: {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<CompletionOutcome> {
  const config = getLlmConfig();
  if (!config) return { ok: false, error: "No AI provider configured" };

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.style === "azure") headers["api-key"] = config.apiKey;
  else headers.authorization = `Bearer ${config.apiKey}`;

  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        // Reasoning-era models (gpt-5 family) reject `max_tokens` and fixed
        // temperature, so the request stays on the portable subset.
        max_completion_tokens: options.maxTokens ?? 8000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 240);
      return { ok: false, error: `Provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}` };
    }
    const payload = (await response.json()) as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    };
    const choice = payload.choices?.[0];
    const text = choice?.message?.content;
    if (!text) {
      return {
        ok: false,
        error:
          choice?.finish_reason === "length"
            ? "Provider used its whole budget on reasoning before answering"
            : "Provider returned an empty completion",
      };
    }
    return { ok: true, text: stripCodeFence(text), providerId: config.providerId };
  } catch (error) {
    return { ok: false, error: `Provider request failed: ${(error as Error).message}` };
  }
}

export function aiMode(): "provider" | "deterministic" {
  return getLlmConfig() ? "provider" : "deterministic";
}
