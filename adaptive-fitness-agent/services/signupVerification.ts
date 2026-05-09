type RequestSignupOtpResponse = {
  verificationId: string;
  email: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
};

type VerifySignupOtpResponse = {
  uid: string;
  email: string;
  emailVerified: boolean;
};

const AUTH_SERVICE_BASE_URL = String(
  process.env.EXPO_PUBLIC_AUTH_SERVICE_BASE_URL ??
    process.env.EXPO_PUBLIC_AUTH_API_BASE_URL ??
    process.env.EXPO_PUBLIC_COACH_API_BASE_URL ??
    process.env.EXPO_PUBLIC_NUTRITION_API_BASE_URL ??
    "",
)
  .trim()
  .replace(/\/$/, "");

function requireBaseUrl() {
  if (!AUTH_SERVICE_BASE_URL) {
    throw new Error("Auth verification service URL is not configured.");
  }

  return AUTH_SERVICE_BASE_URL;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function parseServiceError(response: Response, fallback: string) {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return new Error(fallback);
  }

  try {
    const payload = JSON.parse(raw) as { message?: unknown; detail?: unknown };
    const message = safeTrim(payload.message);
    const detail = safeTrim(payload.detail);
    return new Error(detail || message || fallback);
  } catch {
    return new Error(raw.trim() || fallback);
  }
}

async function postSignupVerificationService<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = requireBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Unable to reach Auth verification service at ${baseUrl}.`);
  }

  if (!response.ok) {
    throw await parseServiceError(
      response,
      `Auth verification service request failed (${String(response.status)}).`,
    );
  }

  return (await response.json()) as T;
}

export function requestSignupOtp(email: string) {
  return postSignupVerificationService<RequestSignupOtpResponse>(
    "/api/auth/signup/request-otp",
    { email: email.trim() },
  );
}

export function verifySignupOtp(input: {
  email: string;
  password: string;
  otp: string;
  verificationId: string;
}) {
  return postSignupVerificationService<VerifySignupOtpResponse>(
    "/api/auth/signup/verify-otp",
    {
      email: input.email.trim(),
      password: input.password,
      otp: input.otp.trim(),
      verificationId: input.verificationId,
    },
  );
}
