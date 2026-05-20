import {
  generateCoachResponse,
  streamCoachResponse,
} from "../../coach/geminiClient.js";
import { observeAiLatency } from "../../observability/metrics.js";

export function createGeminiProvider() {
  return {
    name: "gemini",

    async generateCoachText(input) {
      const start = performance.now();
      const response = await generateCoachResponse(input);
      observeAiLatency({
        operation: "coach.generate",
        provider: "gemini",
        model: response.model ?? "unknown",
        start,
      });
      return response;
    },

    async streamCoachText(input) {
      const start = performance.now();

      // streamCoachResponse returns { stream, response } — NOT a plain response.
      // - stream: AsyncGenerator<string> — yields text chunks incrementally
      // - response: Promise<{model, text, usage}> — resolves after stream ends
      const { stream, response } = streamCoachResponse(input);

      // Drain the stream so chunks flow to any onChunk callback and the
      // response promise resolves. Callers that want raw chunks should use
      // streamCoachResponse directly instead of going through this provider.
      for await (const _chunk of stream) {
        // chunks are forwarded via input.onChunk if provided
      }

      const final = await response;

      observeAiLatency({
        operation: "coach.stream",
        provider: "gemini",
        model: final.model ?? "unknown",
        start,
      });

      return final; // { model, text, usage } — same shape as generateCoachText
    },
  };
}