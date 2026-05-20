import pino from "pino";

const level = String(process.env.LOG_LEVEL ?? "info").trim() || "info";

export const logger = pino({
  level,
  base: {
    service: "nutrition-proxy",
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "authorization",
      "idToken",
      "audioBase64",
      "imageBase64",
      "password",
      "otp",
    ],
    remove: true,
  },
});

export function childLogger(bindings) {
  return logger.child(bindings);
}

export function errorToLog(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error ?? "Unknown error") };
}

