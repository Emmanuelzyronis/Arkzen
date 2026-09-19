"use client";

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return { ok: false, error: (payload.error as string) ?? `Request failed (${response.status})` };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
