import crypto from "crypto";
import nodemailer from "nodemailer";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getCoachAuth, getCoachFirestore } from "../coach/firebaseAdmin.js";

const OTP_COLLECTION = "emailSignupOtps";
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = toPositiveInt(process.env.AUTH_OTP_TTL_SECONDS, 10 * 60);
const OTP_RESEND_SECONDS = toPositiveInt(process.env.AUTH_OTP_RESEND_SECONDS, 60);
const OTP_MAX_ATTEMPTS = toPositiveInt(process.env.AUTH_OTP_MAX_ATTEMPTS, 5);
const OTP_HASH_SECRET = String(
  process.env.AUTH_OTP_HASH_SECRET ??
    process.env.FIREBASE_PRIVATE_KEY ??
    process.env.FIREBASE_PROJECT_ID ??
    "adaptive-fitness-dev-otp-secret",
).trim();

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function safeTrim(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return safeTrim(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 6;
}

function getClientIp(req) {
  const forwardedFor = safeTrim(req.headers["x-forwarded-for"]);
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function generateOtp() {
  const upperBound = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(0, upperBound)).padStart(OTP_LENGTH, "0");
}

function hashOtp(email, otp, verificationId) {
  return crypto
    .createHmac("sha256", OTP_HASH_SECRET)
    .update(`${verificationId}:${email}:${otp}`)
    .digest("hex");
}

function emailDocId(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function secondsUntil(date) {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
}

function getSmtpConfig() {
  const host = safeTrim(process.env.SMTP_HOST);
  const user = safeTrim(process.env.SMTP_USER);
  const pass = safeTrim(process.env.SMTP_PASS);
  const from = safeTrim(process.env.SMTP_FROM);

  if (!host || !from) {
    return null;
  }

  return {
    host,
    port: toPositiveInt(process.env.SMTP_PORT, 587),
    secure: String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
    auth: user || pass ? { user, pass } : undefined,
    from,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOtpEmailHtml({ otp, expiresInMinutes }) {
  const codeDigits = otp
    .split("")
    .map((digit) => (
      `<span style="display:inline-block;min-width:34px;padding:10px 8px;margin:0 3px;border-radius:10px;background:#050505;border:1px solid #27272A;color:#FAFAFA;font-size:24px;line-height:28px;font-weight:800;text-align:center;">${escapeHtml(digit)}</span>`
    ))
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verify your AdaptFit account</title>
  </head>
  <body style="margin:0;padding:0;background:#050505;color:#FAFAFA;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050505;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#111111;border:1px solid #27272A;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px 28px;">
                <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#171717;border:1px solid #27272A;color:#22C55E;font-size:12px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;">AdaptFit</div>
                <h1 style="margin:22px 0 10px 0;color:#FAFAFA;font-size:28px;line-height:34px;font-weight:800;">Verify your wellness space</h1>
                <p style="margin:0;color:#A1A1AA;font-size:15px;line-height:22px;">Aether needs one quick email check before this account becomes active.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:12px 24px 10px 24px;">
                <div style="padding:20px 12px;border-radius:18px;background:#171717;border:1px solid #27272A;">
                  <p style="margin:0 0 14px 0;color:#A1A1AA;font-size:13px;line-height:18px;text-transform:uppercase;letter-spacing:.3px;font-weight:700;">Your verification code</p>
                  <div style="white-space:nowrap;">${codeDigits}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 30px 28px;">
                <p style="margin:0;color:#A1A1AA;font-size:14px;line-height:21px;">This code expires in ${escapeHtml(expiresInMinutes)} minutes. If you did not request an AdaptFit account, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildOtpEmailText({ otp, expiresInMinutes }) {
  return [
    "AdaptFit verification code",
    "",
    `Your code is ${otp}.`,
    `It expires in ${expiresInMinutes} minutes.`,
    "",
    "If you did not request an AdaptFit account, you can ignore this email.",
  ].join("\n");
}

async function sendOtpEmail({ email, otp }) {
  const expiresInMinutes = String(Math.ceil(OTP_TTL_SECONDS / 60));
  const devLogOtp = String(process.env.EMAIL_DEV_LOG_OTP ?? "false").toLowerCase() === "true";
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig) {
    if (devLogOtp) {
      console.log(`[auth-otp] ${email}: ${otp}`);
      return;
    }

    const error = new Error(
      "Email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, and SMTP_PASS in nutrition-proxy/.env.",
    );
    error.statusCode = 501;
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  });

  await transporter.sendMail({
    from: smtpConfig.from,
    to: email,
    subject: "Your AdaptFit verification code",
    text: buildOtpEmailText({ otp, expiresInMinutes }),
    html: buildOtpEmailHtml({ otp, expiresInMinutes }),
  });
}

async function firebaseUserExists(email) {
  try {
    await getCoachAuth().getUserByEmail(email);
    return true;
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return false;
    }
    throw error;
  }
}

function sendError(res, status, message, detail) {
  return res.status(status).json({
    message,
    ...(detail ? { detail } : {}),
  });
}

export function mountEmailOtpRoutes(app) {
  app.post("/api/auth/signup/request-otp", async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);

      if (!isValidEmail(email)) {
        return sendError(res, 400, "Enter a valid email address.");
      }

      if (await firebaseUserExists(email)) {
        return sendError(res, 409, "An account already exists for this email.");
      }

      const firestore = getCoachFirestore();
      const now = new Date();
      const verificationRef = firestore.collection(OTP_COLLECTION).doc(emailDocId(email));
      const latestSnap = await verificationRef.get();
      const latest = latestSnap.exists ? latestSnap.data() : null;
      const latestCreatedAt = latest?.createdAt?.toDate?.();

      if (latestCreatedAt && now.getTime() - latestCreatedAt.getTime() < OTP_RESEND_SECONDS * 1000) {
        return sendError(
          res,
          429,
          `Please wait ${secondsUntil(new Date(latestCreatedAt.getTime() + OTP_RESEND_SECONDS * 1000))} seconds before requesting another code.`,
        );
      }

      const verificationId = crypto.randomUUID();
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

      await verificationRef.set({
        verificationId,
        email,
        codeHash: hashOtp(email, otp, verificationId),
        attempts: 0,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
        consumedAt: null,
        requesterIp: getClientIp(req),
      });

      try {
        await sendOtpEmail({ email, otp });
      } catch (error) {
        await verificationRef.delete().catch(() => {});
        throw error;
      }

      return res.json({
        verificationId,
        email,
        expiresInSeconds: OTP_TTL_SECONDS,
        resendAfterSeconds: OTP_RESEND_SECONDS,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode);
      return sendError(
        res,
        Number.isFinite(statusCode) ? statusCode : 500,
        "We couldn't send a verification code right now.",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  });

  app.post("/api/auth/signup/verify-otp", async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password ?? "");
      const otp = safeTrim(req.body?.otp).replace(/\s+/g, "");
      const verificationId = safeTrim(req.body?.verificationId);

      if (!verificationId || !isValidEmail(email) || !/^\d{6}$/.test(otp)) {
        return sendError(res, 400, "Enter the 6-digit verification code from your email.");
      }

      if (!isValidPassword(password)) {
        return sendError(res, 400, "Your password should be at least 6 characters long.");
      }

      const firestore = getCoachFirestore();
      const verificationRef = firestore.collection(OTP_COLLECTION).doc(emailDocId(email));
      const verificationSnap = await verificationRef.get();

      if (!verificationSnap.exists) {
        return sendError(res, 404, "This verification code was not found. Request a new code.");
      }

      const verification = verificationSnap.data();
      const expiresAt = verification?.expiresAt?.toDate?.();

      if (verification?.email !== email) {
        return sendError(res, 400, "This verification code does not match that email address.");
      }

      if (verification?.verificationId !== verificationId) {
        return sendError(res, 404, "This verification code was not found. Request a new code.");
      }

      if (verification?.consumedAt) {
        return sendError(res, 409, "This verification code has already been used.");
      }

      if (!expiresAt || expiresAt.getTime() <= Date.now()) {
        return sendError(res, 410, "This verification code has expired. Request a new code.");
      }

      const attempts = Number(verification?.attempts ?? 0);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        return sendError(res, 429, "Too many incorrect attempts. Request a new code.");
      }

      const submittedHash = hashOtp(email, otp, verificationId);
      if (!timingSafeEqualText(submittedHash, verification?.codeHash)) {
        await verificationRef.update({
          attempts: FieldValue.increment(1),
          lastFailedAt: FieldValue.serverTimestamp(),
        });
        return sendError(res, 400, "That code does not match. Check the email and try again.");
      }

      if (await firebaseUserExists(email)) {
        return sendError(res, 409, "An account already exists for this email.");
      }

      const user = await getCoachAuth().createUser({
        email,
        password,
        emailVerified: true,
      });

      await verificationRef.update({
        consumedAt: FieldValue.serverTimestamp(),
        createdUid: user.uid,
      });

      return res.json({
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
      });
    } catch (error) {
      return sendError(
        res,
        500,
        "We couldn't verify this code right now.",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  });
}
