import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import {
  Mic,
  Paperclip,
  SendHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";

import { getUserFriendlyErrorMessage, useAppAlert } from "../components/ui/AppAlert";
import {
  sendCoachMessage,
  transcribeCoachAudio,
  type CoachInputAttachment,
  type CoachChatMessage,
} from "../services/aiCoach";
import { appTheme } from "../theme/designSystem";
import { globalStyles } from "../theme/globalStyles";
import { styles } from "./AICoachScreen.styles";

// const QUICK_PROMPTS = [
//   "Plan my workout for today",
//   "What should I eat after training?",
//   "How can I improve consistency this week?",
//   "Give me motivation for today",
// ];

const STARTER_MESSAGE: CoachChatMessage = {
  id: "starter",
  role: "assistant",
  content:
    "I am your adaptive coach. Ask me anything about workouts, nutrition, recovery, or consistency and I will personalize it using your logged data.",
  createdAt: new Date().toISOString(),
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CHARS = 12000;

type PendingAttachment = {
  id: string;
  name: string;
  mimeType: string;
  content: string;
  charLength: number;
};

function getUnknownErrorMessage(error: unknown, fallback: string) {
  const mapped = getUserFriendlyErrorMessage(error, "").trim();
  if (mapped) {
    return mapped;
  }

  const detail = error instanceof Error ? error.message.trim() : "";
  return detail || fallback;
}

function toAttachmentPreviewLabel(attachment: PendingAttachment) {
  return `${attachment.name} (${String(attachment.charLength)} chars)`;
}

function normalizeAssistantReply(raw: string) {
  const withoutMarkdown = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\s*\*\s+/gm, "")
    .replace(/`{1,3}/g, "")
    .replace(/\*/g, "");

  return withoutMarkdown
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function AICoachScreen() {
  const { showAlert } = useAppAlert();
  const chatScrollRef = useRef<ScrollView | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<CoachChatMessage[]>([STARTER_MESSAGE]);
  const [contextSignals, setContextSignals] = useState<string[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAutoSpeakEnabled, setIsAutoSpeakEnabled] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      const recording = recordingRef.current;
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {
          // ignore cleanup errors
        });
      }
      Speech.stop();
    };
  }, []);

  const canSend = useMemo(() => {
    return (draftMessage.trim().length > 0 || pendingAttachments.length > 0) && !isSending && !isTranscribing;
  }, [draftMessage, pendingAttachments.length, isSending, isTranscribing]);

  const appendMessage = (message: CoachChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  };

  const stopSpeaking = () => {
    Speech.stop();
    setSpeakingMessageId(null);
  };

  const speakMessage = (content: string, messageId: string) => {
    const normalizedContent = normalizeAssistantReply(content);
    if (!normalizedContent.trim()) {
      return;
    }

    if (speakingMessageId === messageId) {
      stopSpeaking();
      return;
    }

    Speech.stop();
    setSpeakingMessageId(messageId);

    Speech.speak(normalizedContent, {
      language: "en-US",
      pitch: 1,
      rate: 0.95,
      onDone: () => setSpeakingMessageId(null),
      onStopped: () => setSpeakingMessageId(null),
      onError: () => setSpeakingMessageId(null),
    });
  };

  const handlePickFiles = async () => {
    if (isPickingFile || isSending || isRecording || isTranscribing) {
      return;
    }

    setIsPickingFile(true);

    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled) {
        return;
      }

      const nextAttachments: PendingAttachment[] = [];

      for (const asset of pickerResult.assets) {
        if (nextAttachments.length + pendingAttachments.length >= MAX_ATTACHMENTS) {
          break;
        }

        const mimeType = typeof asset.mimeType === "string" ? asset.mimeType : "text/plain";

        try {
          const rawText = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          const trimmed = rawText.trim();
          if (!trimmed) {
            continue;
          }

          const content = trimmed.slice(0, MAX_ATTACHMENT_CHARS);
          nextAttachments.push({
            id: `${asset.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: asset.name,
            mimeType,
            content,
            charLength: content.length,
          });
        } catch {
          showAlert({
            title: "Unsupported file",
            message: `${asset.name} could not be parsed as text. Please attach text-based files.`,
          });
        }
      }

      if (!nextAttachments.length) {
        return;
      }

      setPendingAttachments((prev) => [...prev, ...nextAttachments].slice(0, MAX_ATTACHMENTS));
    } catch (error) {
      showAlert({
        title: "File attach failed",
        message: getUnknownErrorMessage(error, "Could not attach files right now."),
      });
    } finally {
      setIsPickingFile(false);
    }
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const startRecording = async () => {
    if (isRecording || isSending || isTranscribing) {
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        showAlert({
          title: "Microphone permission needed",
          message: "Allow microphone access to dictate a message.",
        });
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (error) {
      showAlert({
        title: "Could not start recording",
        message: getUnknownErrorMessage(error, "Voice capture is unavailable right now."),
      });
    }
  };

  const stopRecordingAndTranscribe = async () => {
    const activeRecording = recordingRef.current;
    if (!activeRecording) {
      setIsRecording(false);
      return;
    }

    setIsRecording(false);
    setIsTranscribing(true);

    try {
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error("No audio captured for transcription.");
      }

      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const transcription = await transcribeCoachAudio({
        audioBase64,
        mimeType: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
      });

      const transcriptText = transcription.text.trim();
      if (!transcriptText) {
        showAlert({
          title: "No speech detected",
          message: "Try speaking a bit louder or recording again.",
        });
        return;
      }

      setDraftMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcriptText}` : transcriptText));
    } catch (error) {
      showAlert({
        title: "Voice to text failed",
        message: getUnknownErrorMessage(error, "Could not transcribe your voice note right now."),
      });
    } finally {
      setIsTranscribing(false);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {
        // ignore cleanup errors
      });
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecordingAndTranscribe();
      return;
    }

    await startRecording();
  };

  const handleSend = async (inputText?: string) => {
    const messageText = (inputText ?? draftMessage).trim();
    const attachmentsToSend: CoachInputAttachment[] = pendingAttachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      content: attachment.content,
    }));

    const fallbackPrompt = attachmentsToSend.length
      ? "Please analyze my attached files and answer my request."
      : "";
    const outboundPrompt = messageText || fallbackPrompt;

    if (!outboundPrompt || isSending || isTranscribing) {
      return;
    }

    const messagePreview = attachmentsToSend.length
      ? `${outboundPrompt}\n\nAttached: ${attachmentsToSend.map((item) => item.name).join(", ")}`
      : outboundPrompt;

    const userMessage: CoachChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messagePreview,
      createdAt: new Date().toISOString(),
    };

    appendMessage(userMessage);
    setDraftMessage("");
    setPendingAttachments([]);
    setIsSending(true);
    scrollToBottom();

    try {
      const response = await sendCoachMessage({
        message: outboundPrompt,
        conversationId,
        contextWindowDays: 7,
        includeAllHistory: true,
        attachments: attachmentsToSend,
      });

      if (!conversationId) {
        setConversationId(response.conversationId);
      }

      if (Array.isArray(response.contextSignals)) {
        setContextSignals(response.contextSignals.slice(0, 3));
      }

      const assistantMessageId = `assistant-${Date.now()}`;
      const cleanedReply = normalizeAssistantReply(response.reply);
      appendMessage({
        id: assistantMessageId,
        role: "assistant",
        content: cleanedReply,
        createdAt: new Date().toISOString(),
      });

      if (isAutoSpeakEnabled) {
        speakMessage(cleanedReply, assistantMessageId);
      }

      scrollToBottom();
    } catch (error) {
      const message = getUnknownErrorMessage(
        error,
        "The coach could not respond right now. Please try again.",
      );

      showAlert({
        title: "Coach unavailable",
        message,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={globalStyles.screen} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.screenContent}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>AI Coach</Text>
            <Text style={styles.subtitle}>Chat with your adaptive coach</Text>
          </View>
        </View>

        {/* <View style={styles.quickPromptRow}>
          {QUICK_PROMPTS.map((prompt) => (
            <Pressable
              key={prompt}
              style={[styles.quickPromptChip, isSending ? styles.quickPromptChipDisabled : null]}
              onPress={() => {
                handleSend(prompt).catch(() => {
                  // handled in handleSend
                });
              }}
              disabled={isSending}
            >
              <Text style={styles.quickPromptText}>{prompt}</Text>
            </Pressable>
          ))}
        </View> */}

        {contextSignals.length ? (
          <View style={styles.signalsCard}>
            {contextSignals.map((signal, index) => (
              <Text key={`signal-${index}`} style={styles.signalText}>
                • {signal}
              </Text>
            ))}
          </View>
        ) : null}

        <ScrollView
          ref={chatScrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageRow,
                message.role === "assistant" ? styles.assistantRow : styles.userRow,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  message.role === "assistant" ? styles.assistantBubble : styles.userBubble,
                ]}
              >
                <Text style={styles.messageText}>{message.content}</Text>

                {message.role === "assistant" ? (
                  <Pressable
                    style={styles.speakMessageButton}
                    onPress={() => {
                      speakMessage(message.content, message.id);
                    }}
                  >
                    {speakingMessageId === message.id ? (
                      <VolumeX size={14} color={appTheme.colors.mutedText} strokeWidth={2.2} />
                    ) : (
                      <Volume2 size={14} color={appTheme.colors.mutedText} strokeWidth={2.2} />
                    )}
                    <Text style={styles.speakMessageButtonText}>
                      {speakingMessageId === message.id ? "Stop" : "Speak"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}

          {isSending ? (
            <View style={[styles.messageRow, styles.assistantRow]}>
              <View style={[styles.messageBubble, styles.assistantBubble, styles.thinkingBubble]}>
                <ActivityIndicator size="small" color={appTheme.colors.mutedText} />
                <Text style={styles.thinkingText}>Coach is thinking...</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.composerWrap}>
          {pendingAttachments.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentRow}>
              {pendingAttachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentChip}>
                  <Text style={styles.attachmentText}>{toAttachmentPreviewLabel(attachment)}</Text>
                  <Pressable onPress={() => removeAttachment(attachment.id)}>
                    <X size={14} color={appTheme.colors.mutedText} strokeWidth={2.2} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.inputRow}>
            <Pressable
              style={styles.iconButton}
              onPress={() => {
                handlePickFiles().catch(() => {
                  // handled in handlePickFiles
                });
              }}
              disabled={isPickingFile || isSending}
            >
              {isPickingFile ? (
                <ActivityIndicator size="small" color={appTheme.colors.mutedText} />
              ) : (
                <Paperclip size={18} color={appTheme.colors.mutedText} strokeWidth={2.2} />
              )}
            </Pressable>

            <Pressable
              style={[styles.iconButton, isRecording ? styles.iconButtonActive : null]}
              onPress={() => {
                toggleRecording().catch(() => {
                  // handled in toggleRecording
                });
              }}
              disabled={isSending || isTranscribing}
            >
              {isRecording ? (
                <Square size={16} color={appTheme.colors.text} strokeWidth={2.2} />
              ) : (
                <Mic size={18} color={appTheme.colors.mutedText} strokeWidth={2.2} />
              )}
            </Pressable>

            <TextInput
              value={draftMessage}
              onChangeText={setDraftMessage}
              style={styles.input}
              placeholder="Message your coach"
              placeholderTextColor="#736A6A"
              multiline
              editable={!isSending && !isTranscribing}
              maxLength={1800}
            />

            <Pressable
              style={[styles.sendButton, !canSend ? styles.sendButtonDisabled : null]}
              onPress={() => {
                handleSend().catch(() => {
                  // handled in handleSend
                });
              }}
              disabled={!canSend}
            >
              <SendHorizontal
                size={18}
                color={!canSend ? appTheme.colors.mutedText : appTheme.colors.text}
                strokeWidth={2.2}
              />
            </Pressable>
          </View>

          {isRecording ? <Text style={styles.statusText}>Listening... tap stop to transcribe</Text> : null}
          {isTranscribing ? <Text style={styles.statusText}>Transcribing voice note...</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}