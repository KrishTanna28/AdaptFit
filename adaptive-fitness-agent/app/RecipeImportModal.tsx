import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { X } from "lucide-react-native";

import AppButton from "../components/ui/AppButton";
import AppTextField from "../components/ui/AppTextField";
import { appTheme } from "../theme/designSystem";
import { styles } from "./NutritionScreen.styles";
import type { MealType } from "../services/nutritionApi";

type RecipeImportModalProps = {
  visible: boolean;
  meal: MealType;
  url: string;
  servings: string;
  isParsing: boolean;
  onChangeUrl: (value: string) => void;
  onChangeServings: (value: string) => void;
  onParse: () => void;
  onClose: () => void;
};

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

export default function RecipeImportModal({
  visible,
  meal,
  url,
  servings,
  isParsing,
  onChangeUrl,
  onChangeServings,
  onParse,
  onClose,
}: RecipeImportModalProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => {
        if (!isParsing) {
          onClose();
        }
      }}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!isParsing) {
              onClose();
            }
          }}
        />

        <View style={styles.modalCard}>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Import recipe</Text>
                <Text style={styles.hintText}>Meal: {MEAL_LABELS[meal]}</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close recipe importer"
                disabled={isParsing}
                onPress={onClose}
                style={styles.modalIconButton}
              >
                <X size={18} color={appTheme.colors.text} strokeWidth={2.2} />
              </Pressable>
            </View>

            <AppTextField
              label="Recipe URL"
              placeholder="https://example.com/recipe"
              value={url}
              onChangeText={onChangeUrl}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isParsing}
            />

            <AppTextField
              label="Servings to log"
              placeholder="1"
              value={servings}
              onChangeText={onChangeServings}
              keyboardType="decimal-pad"
              editable={!isParsing}
            />

            <Text style={styles.hintText}>
              The parser uses recipe nutrition embedded in the page. Values open as a manual entry so you can adjust before saving.
            </Text>

            <AppButton
              title={isParsing ? "Parsing..." : "Parse Recipe"}
              onPress={onParse}
              loading={isParsing}
              disabled={isParsing}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
