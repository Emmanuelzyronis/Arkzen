import { NextResponse } from "next/server";

/**
 * Reading a request body without trusting it.
 *
 * Every route used to do `(await request.json()) as { note?: string }` and then
 * call `.trim()` on the field. That type assertion is a claim the compiler
 * cannot check — `JSON.parse` returns whatever the caller wrote, so
 * `{"note": 123}` is perfectly valid JSON that arrives typed as `string`. The
 * optional chain does not save it either: `(123)?.trim` evaluates to
 * `undefined`, and *calling* that throws a `TypeError`. The route answers 500,
 * telling the caller the server broke when in fact their request was malformed.
 * These helpers turn that back into a 400 with a sentence explaining what was
 * wrong.
 *
 * Messages are written to be readable by a person, not just a developer: the
 * app surfaces a failed save's `error` string in a toast, so an enum dump like
 * "status must be one of NEW, REVIEWING, …" would put raw identifiers in front
 * of a user. Everything here names the allowed values in the same words the
 * interface uses.
 */

/** A parsed JSON body. Nothing in it is trusted yet. */
export type JsonObject = Record<string, unknown>;

export type BodyResult = { ok: true; body: JsonObject } | { ok: false; response: NextResponse };

export type FieldResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

function problem(error: string, status = 400): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * The request body as an object.
 *
 * An absent or unparseable body is not an error here — several routes treat
 * "nothing was sent" as "use the defaults". Callers that need a body read a
 * field and check whether it arrived. A body that parses to something which is
 * not an object (a bare string, an array, `null`) yields an empty object for
 * the same reason: there are no fields to read either way, and every field
 * reader below reports the missing field in its own words.
 */
export async function readBody(request: Request): Promise<BodyResult> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: true, body: {} };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: true, body: {} };
  }
  return { ok: true, body: parsed as JsonObject };
}

/**
 * A text field, trimmed.
 *
 * Absent, `null` and blank all read as `null`: a caller who sends
 * `{"note": "   "}` means the same as one who leaves it out, and neither is an
 * error. A value that is present but not a string *is* an error — that is a
 * caller bug worth naming, and it is the case that used to 500.
 */
export function readText(
  body: JsonObject,
  key: string,
  options: { required?: boolean; max?: number; label?: string } = {},
): FieldResult<string | null> {
  const label = options.label ?? key;
  const raw = body[key];

  if (raw === undefined || raw === null) {
    return options.required ? problem(`${label} is required`) : { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return problem(`${label} must be text`);
  }

  const value = raw.trim();
  if (value.length === 0) {
    return options.required ? problem(`${label} is required`) : { ok: true, value: null };
  }
  if (options.max !== undefined && value.length > options.max) {
    return problem(`${label} is too long — ${options.max} characters at most`);
  }
  return { ok: true, value };
}

/**
 * A field that has to be one of a fixed set of values.
 *
 * Takes the allowed values paired with the words the interface shows for them,
 * so the failure message can say "Stage must be one of: New, Reviewing, …"
 * rather than repeating the enum names back at someone.
 */
export function readChoice<T extends string>(
  body: JsonObject,
  key: string,
  options: ReadonlyArray<{ value: T; label: string }>,
  settings: { required?: boolean; fallback?: T; label?: string } = {},
): FieldResult<T | null> {
  const label = settings.label ?? key;
  const raw = body[key];

  if (raw === undefined || raw === null) {
    if (settings.fallback !== undefined) return { ok: true, value: settings.fallback };
    if (settings.required) return problem(`${label} is required`);
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return problem(`${label} must be text`);
  }

  const match = options.find((option) => option.value === raw);
  if (!match) {
    return problem(`${label} must be one of: ${options.map((option) => option.label).join(", ")}`);
  }
  return { ok: true, value: match.value };
}
