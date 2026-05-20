import { getEncoding } from "js-tiktoken";

let cachedEncoding = null;

function getTokenizer() {
  if (cachedEncoding) {
    return cachedEncoding;
  }

  try {
    cachedEncoding = getEncoding("cl100k_base");
    return cachedEncoding;
  } catch {
    return null;
  }
}

export function countTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const tokenizer = getTokenizer();
  if (!tokenizer) {
    return Math.ceil(text.length / 4);
  }
  return tokenizer.encode(text).length;
}

export function fitsTokenBudget(value, maxTokens) {
  return countTokens(value) <= maxTokens;
}

