import { ZodError } from "zod";
import { observeValidationFailure } from "../observability/metrics.js";

export class BoundaryValidationError extends Error {
  constructor(label, zodError) {
    super(`Invalid ${label}: ${formatZodError(zodError)}`);
    this.name = "BoundaryValidationError";
    this.label = label;
    this.issues = zodError.issues;
  }
}

export function formatZodError(error) {
  const zodError = error instanceof ZodError ? error : null;
  if (!zodError) {
    return "Unknown validation error.";
  }

  return zodError.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function safeValidate(schema, value, label) {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  observeValidationFailure(label);
  return {
    ok: false,
    label,
    message: `Invalid ${label}.`,
    detail: formatZodError(result.error),
    issues: result.error.issues,
  };
}

export function validateOrThrow(schema, value, label) {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  observeValidationFailure(label);
  throw new BoundaryValidationError(label, result.error);
}

export function sendValidatedJson(res, schema, payload, label) {
  const result = schema.safeParse(payload);
  if (result.success) {
    return res.json(result.data);
  }

  observeValidationFailure(label);
  console.warn(`Response validation failed for ${label}: ${formatZodError(result.error)}`);
  return res.status(500).json({
    message: "Response validation failed.",
    detail: formatZodError(result.error),
  });
}

export function extractJsonText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return "";
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return String(fenced[1] ?? "").trim();
  }

  const firstCurly = raw.indexOf("{");
  const lastCurly = raw.lastIndexOf("}");
  if (firstCurly !== -1 && lastCurly > firstCurly) {
    return raw.slice(firstCurly, lastCurly + 1).trim();
  }

  return raw;
}

function looksLikeJson(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function parseJsonObject(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "JSON parse failed.",
    };
  }
}

export function parseLlmJsonWithSchema({ text, schema, repair, fallback = null, label = "llm-output" }) {
  const cleaned = extractJsonText(text);
  if (!cleaned) {
    observeValidationFailure(label);
    console.warn(`LLM ${label} validation failed: empty response.`);
    return fallback;
  }

  if (!looksLikeJson(cleaned)) {
    return fallback;
  }

  const parsed = parseJsonObject(cleaned);
  if (!parsed.ok) {
    observeValidationFailure(label);
    console.warn(`LLM ${label} validation failed before schema parse: ${parsed.error}`);
    return fallback;
  }

  const firstPass = schema.safeParse(parsed.value);
  if (firstPass.success) {
    return firstPass.data;
  }

  // LLM Output -> Zod Validation -> Repair Attempt -> Retry -> Safe Fallback.
  if (typeof repair === "function") {
    const repaired = repair(parsed.value);
    const retry = schema.safeParse(repaired);
    if (retry.success) {
      return retry.data;
    }
    observeValidationFailure(label);
    console.warn(`LLM ${label} validation retry failed: ${formatZodError(retry.error)}`);
  } else {
    observeValidationFailure(label);
    console.warn(`LLM ${label} validation failed: ${formatZodError(firstPass.error)}`);
  }

  return fallback;
}

export function validationErrorResponse(error) {
  return {
    message: error?.message || "Request validation failed.",
    detail: error?.detail || "Invalid request payload.",
  };
}
