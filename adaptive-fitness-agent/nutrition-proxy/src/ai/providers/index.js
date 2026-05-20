import { createGeminiProvider } from "./geminiProvider.js";

export function createAiProvider() {
  const providerName = String(process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();

  switch (providerName) {
    case "gemini":
    default:
      return createGeminiProvider();
  }
}

