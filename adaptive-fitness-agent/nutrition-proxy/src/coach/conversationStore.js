import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

const DEFAULT_MESSAGE_HISTORY_LIMIT = 12;
const MAX_MESSAGE_HISTORY_LIMIT = 40;
const DEFAULT_CONVERSATION_LIMIT = 20;
const MAX_CONVERSATION_LIMIT = 50;
const DEFAULT_CONTEXT_CONVERSATION_LIMIT = 4;
const DEFAULT_CONTEXT_MESSAGE_LIMIT = 6;

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

function normalizeConversationLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_CONVERSATION_LIMIT;
  }
  return Math.min(MAX_CONVERSATION_LIMIT, Math.floor(n));
}

function conversationRef(db, uid, conversationId) {
  return db.collection("users").doc(uid).collection("coachConversations").doc(conversationId);
}

function conversationCollectionRef(db, uid) {
  return db.collection("users").doc(uid).collection("coachConversations");
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

function toNullableIsoTimestamp(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function buildConversationTitle(content) {
  const normalized = String(content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New Sarathi chat";
  }
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

async function loadConversationFallbackMetadata(db, uid, conversationId) {
  const [firstSnapshot, lastSnapshot] = await Promise.all([
    messageCollectionRef(db, uid, conversationId).orderBy("createdAt", "asc").limit(1).get(),
    messageCollectionRef(db, uid, conversationId).orderBy("createdAt", "desc").limit(1).get(),
  ]);

  const firstData = firstSnapshot.docs[0]?.data() ?? {};
  const lastData = lastSnapshot.docs[0]?.data() ?? {};

  return {
    title: buildConversationTitle(firstData.content),
    lastMessagePreview: buildConversationTitle(lastData.content || firstData.content),
    lastMessageRole: normalizeRole(lastData.role),
  };
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

  const role = normalizeRole(message.role);

  await messageCollectionRef(db, uid, conversationId).add({
    role,
    content,
    model: typeof message.model === "string" ? message.model : null,
    usage: message.usage && typeof message.usage === "object" ? message.usage : null,
    createdAt: FieldValue.serverTimestamp(),
  });

  const conversationUpdate = {
    updatedAt: FieldValue.serverTimestamp(),
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: buildConversationTitle(content),
    lastMessageRole: role,
    messageCount: FieldValue.increment(1),
  };

  if (role === "user") {
    conversationUpdate.title = buildConversationTitle(content);
  }

  await conversationRef(db, uid, conversationId).set(
    conversationUpdate,
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

export async function listConversations(db, uid, limit) {
  const querySnapshot = await conversationCollectionRef(db, uid)
    .orderBy("lastMessageAt", "desc")
    .limit(normalizeConversationLimit(limit))
    .get();

  return Promise.all(querySnapshot.docs.map(async (conversationDoc) => {
    const data = conversationDoc.data() ?? {};
    const hasStoredMetadata = Boolean(data.title || data.lastMessagePreview);
    const fallback = hasStoredMetadata
      ? null
      : await loadConversationFallbackMetadata(db, uid, conversationDoc.id);
    const title = buildConversationTitle(data.title || fallback?.title || data.lastMessagePreview);
    const preview = buildConversationTitle(
      data.lastMessagePreview || fallback?.lastMessagePreview || title,
    );

    return {
      id: conversationDoc.id,
      title,
      lastMessagePreview: preview,
      lastMessageRole: normalizeRole(data.lastMessageRole || fallback?.lastMessageRole),
      messageCount: Number.isFinite(Number(data.messageCount)) ? Number(data.messageCount) : 0,
      createdAt: toNullableIsoTimestamp(data.createdAt),
      updatedAt: toNullableIsoTimestamp(data.updatedAt),
      lastMessageAt: toNullableIsoTimestamp(data.lastMessageAt),
    };
  }));
}

export async function listRecentConversationContext(db, uid, currentConversationId) {
  const conversations = await listConversations(db, uid, DEFAULT_CONTEXT_CONVERSATION_LIMIT + 1);
  const selected = conversations
    .filter((conversation) => conversation.id !== currentConversationId)
    .slice(0, DEFAULT_CONTEXT_CONVERSATION_LIMIT);

  const withMessages = await Promise.all(
    selected.map(async (conversation) => {
      const messages = await listConversationMessages(
        db,
        uid,
        conversation.id,
        DEFAULT_CONTEXT_MESSAGE_LIMIT,
      );

      return {
        id: conversation.id,
        title: conversation.title,
        lastMessageAt: conversation.lastMessageAt,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
      };
    }),
  );

  return withMessages.filter((conversation) => conversation.messages.length > 0);
}
