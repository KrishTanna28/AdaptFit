import { Modal, View, Pressable, Text } from "react-native";
import { X } from "lucide-react-native";

import AppButton from "../components/ui/AppButton";
import { appTheme } from "@/theme/designSystem";
import type { MealType } from "@/services/nutritionApi";
import type { LoggedFoodEntry } from "@/services/nutritionLog";
import { detailModalStyles } from "./NutritionScreen.styles"

type NutritionEntryDetailModalProps = {
  visible: boolean;
  entry: LoggedFoodEntry | null;
  isBusy?: boolean;
  onClose: () => void;
  canEdit: boolean;
  onUpdateEntry: () => void;
  onDeleteEntry: () => void;
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export default function NutritionEntryDetailModal({
  visible,
  entry,
  isBusy,
  onClose,
  canEdit,
  onUpdateEntry,
  onDeleteEntry,
}: NutritionEntryDetailModalProps) {
  const detailRows = entry
    ? [
        ["Meal", MEAL_LABELS[entry.mealType]],
        ["Quantity", `${formatQuantity(entry.quantity)} serving`],
        ["Calories", `${Math.round(entry.calories)} kcal`],
        ["Protein", `${roundOne(entry.protein)} g`],
        ["Carbs", `${roundOne(entry.carbs)} g`],
        ["Fat", `${roundOne(entry.fat)} g`],
        ["Fibre", `${roundOne(entry.fiber)} g`],
        ["Sodium", `${roundOne(entry.sodiumMg)} mg`],
        ["Potassium", `${roundOne(entry.potassiumMg)} mg`],
        ["Calcium", `${roundOne(entry.calciumMg)} mg`],
        ["Iron", `${roundOne(entry.ironMg)} mg`],
        ["Vitamin C", `${roundOne(entry.vitaminCMg)} mg`],
      ]
    : [];

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={detailModalStyles.overlay}>
        <Pressable style={detailModalStyles.backdrop} onPress={onClose} />

        <View style={detailModalStyles.card}>
          <View style={detailModalStyles.content}>
            <View style={detailModalStyles.headerRow}>
              <Text style={detailModalStyles.title}>{entry?.name ?? "Entry details"}</Text>

              <Pressable
                style={detailModalStyles.modalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Entry options"
                disabled={!entry || isBusy}
                onPress={onClose}
              >
                <Text style={detailModalStyles.modalCloseText}><X size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2}></X></Text>
              </Pressable>
            </View>

            {entry ? (
              <>
                {detailRows.map(([label, value]) => (
                  <View key={label} style={detailModalStyles.line}>
                    <Text style={detailModalStyles.lineLabel}>{label}</Text>
                    <Text style={detailModalStyles.lineValue}>{value}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {canEdit ? (<View style={detailModalStyles.menu}>
              <AppButton
                title="Update entry"
                variant="primary"
                disabled={isBusy}
                onPress={onUpdateEntry}
              />
              <AppButton
                title="Delete entry"
                variant="secondary"
                disabled={isBusy}
                onPress={onDeleteEntry}
              />
            </View>) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
