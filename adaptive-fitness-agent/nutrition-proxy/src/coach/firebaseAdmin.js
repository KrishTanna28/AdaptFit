import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let cachedApp = null;

function getCredentialFromEnv() {
  const projectId = String(process.env.FIREBASE_PROJECT_ID ?? "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL ?? "").trim();
  const privateKeyRaw = String(process.env.FIREBASE_PRIVATE_KEY ?? "").trim();

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

function getOrCreateAdminApp() {
  if (cachedApp) {
    return cachedApp;
  }

  const existingApp = getApps()[0];
  if (existingApp) {
    cachedApp = existingApp;
    return cachedApp;
  }

  const explicitCredential = getCredentialFromEnv();

  if (explicitCredential) {
    cachedApp = initializeApp({
      credential: cert(explicitCredential),
      projectId: explicitCredential.projectId,
    });

    return cachedApp;
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID ?? "").trim();
  cachedApp = initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });

  return cachedApp;
}

export function getCoachFirestore() {
  return getFirestore(getOrCreateAdminApp());
}

export async function verifyCoachIdToken(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("auth-token-missing");
  }

  const auth = getAuth(getOrCreateAdminApp());
  return auth.verifyIdToken(idToken);
}
