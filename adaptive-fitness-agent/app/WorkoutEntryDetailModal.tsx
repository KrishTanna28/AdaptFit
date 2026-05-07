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
  const detailRows = entry
    ? [
        ["Type", entry.workoutMode.charAt(0).toUpperCase() + entry.workoutMode.slice(1)],
        ["Intensity", entry.intensity.charAt(0).toUpperCase() + entry.intensity.slice(1)],
        ["Duration", `${formatDuration(entry.durationMin)} min`],
        ...(entry.workoutMode === "strength"
          ? [
              ["Sets", String(entry.sets ?? "--")],
              ["Reps", String(entry.reps ?? "--")],
              ["Seconds per rep", String(entry.secPerRep ?? "--")],
              ["Rest between sets", String(entry.restBetweenSetsSec ?? "--") + " sec"],
              ["Minimum session", String(entry.minSessionMin ?? "--") + " min"],
            ]
          : []),
        [
          "Active calories",
          entry.caloriesActive > 0 ? String(Math.round(entry.caloriesActive)) + " kcal" : "--",
        ],
      ]
    : [];

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
                style={styles.modalIconButton}
              >
                <X size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            {entry ? (
              <View style={styles.block}>
                {detailRows.map(([label, value]) => (
                  <View key={label} style={styles.detailLine}>
                    <Text style={styles.detailLineLabel}>{label}</Text>
                    <Text style={styles.detailLineValue}>{value}</Text>
                  </View>
                ))}
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
