import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

const DEFAULT_MESSAGE_HISTORY_LIMIT = 12;
const MAX_MESSAGE_HISTORY_LIMIT = 40;

function normalizeRole(value) {
  return value === "assistant" ? "assistant" : "user";
}

function normalizeMessageLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_MESSAGE_HISTORY_LIMIT;
  }
  return Math.min(MAX_MESSAGE_HISTORY_LIMIT, Math.floor(n));
}

function conversationRef(db, uid, conversationId) {
  return db.collection("users").doc(uid).collection("coachConversations").doc(conversationId);
}

function messageCollectionRef(db, uid, conversationId) {
  return conversationRef(db, uid, conversationId).collection("messages");
}

function toIsoTimestamp(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

export async function ensureConversation(db, uid, requestedConversationId) {
  const normalizedConversationId =
    typeof requestedConversationId === "string" && requestedConversationId.trim()
      ? requestedConversationId.trim()
      : randomUUID();

  const ref = conversationRef(db, uid, normalizedConversationId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    await ref.set(
      {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessageAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return normalizedConversationId;
}

export async function appendConversationMessage(db, uid, conversationId, message) {
  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (!content) {
    return;
  }

  await messageCollectionRef(db, uid, conversationId).add({
    role: normalizeRole(message.role),
    content,
    model: typeof message.model === "string" ? message.model : null,
    usage: message.usage && typeof message.usage === "object" ? message.usage : null,
    createdAt: FieldValue.serverTimestamp(),
  });

  await conversationRef(db, uid, conversationId).set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function listConversationMessages(db, uid, conversationId, limit) {
  if (!conversationId || typeof conversationId !== "string") {
    return [];
  }

  const querySnapshot = await messageCollectionRef(db, uid, conversationId)
    .orderBy("createdAt", "desc")
    .limit(normalizeMessageLimit(limit))
    .get();

  const ordered = querySnapshot.docs
    .map((messageDoc) => {
      const data = messageDoc.data() ?? {};
      return {
        id: messageDoc.id,
        role: normalizeRole(data.role),
        content: typeof data.content === "string" ? data.content : "",
        createdAt: toIsoTimestamp(data.createdAt),
      };
    })
    .reverse();

  return ordered;
}
