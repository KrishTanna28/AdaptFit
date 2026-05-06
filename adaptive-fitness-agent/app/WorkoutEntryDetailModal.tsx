import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";

import AppButton from "../components/ui/AppButton";
import type { LoggedWorkoutEntry } from "../services/workoutLog";
import { appTheme } from "../theme/designSystem";
import { styles } from "./WorkoutScreen.styles";

type WorkoutEntryDetailModalProps = {
  visible: boolean;
  entry: LoggedWorkoutEntry | null;
  isBusy?: boolean;
  canEdit: boolean;
  onClose: () => void;
  onUpdateEntry: () => void;
  onDeleteEntry: () => void;
};

function formatDuration(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export default function WorkoutEntryDetailModal({
  visible,
  entry,
  isBusy,
  canEdit,
  onClose,
  onUpdateEntry,
  onDeleteEntry,
}: WorkoutEntryDetailModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <View style={styles.modalCard}>
          <View style={styles.modalContent}>
            <View style={styles.heroTopRow}>
              <Text style={styles.modalTitle}>{entry ? entry.workoutName : "Workout details"}</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close workout details"
                disabled={Boolean(isBusy)}
                onPress={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: appTheme.radii.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: appTheme.colors.card,
                  borderWidth: 1,
                  borderColor: appTheme.colors.border,
                }}
              >
                <X size={18} color={appTheme.colors.text} strokeWidth={2.2} />
              </Pressable>
            </View>

            {entry ? (
              <View style={styles.block}>
                <Text style={styles.entryMeta}>
                  Type: {entry.workoutMode.charAt(0).toUpperCase() + entry.workoutMode.slice(1)}
                </Text>
                <Text style={styles.entryMeta}>
                  Intensity: {entry.intensity.charAt(0).toUpperCase() + entry.intensity.slice(1)}
                </Text>
                <Text style={styles.entryMeta}>Duration: {formatDuration(entry.durationMin)} min</Text>

                {entry.workoutMode === "strength" ? (
                  <>
                    <Text style={styles.entryMeta}>Sets: {String(entry.sets ?? "--")}</Text>
                    <Text style={styles.entryMeta}>Reps: {String(entry.reps ?? "--")}</Text>
                    <Text style={styles.entryMeta}>
                      Seconds per rep: {String(entry.secPerRep ?? "--")}
                    </Text>
                    <Text style={styles.entryMeta}>
                      Rest between sets (sec): {String(entry.restBetweenSetsSec ?? "--")}
                    </Text>
                    <Text style={styles.entryMeta}>
                      Minimum session (min): {String(entry.minSessionMin ?? "--")}
                    </Text>
                  </>
                ) : null}

                <Text style={styles.entryMeta}>
                  Active calories: {entry.caloriesActive > 0 ? String(Math.round(entry.caloriesActive)) + " kcal" : "--"}
                </Text>
              </View>
            ) : null}

            {canEdit ? (
              <View style={styles.modalActions}>
                <AppButton title="Update workout" onPress={onUpdateEntry} disabled={Boolean(isBusy)} />
                <AppButton
                  title="Delete workout"
                  variant="secondary"
                  onPress={onDeleteEntry}
                  disabled={Boolean(isBusy)}
                />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
