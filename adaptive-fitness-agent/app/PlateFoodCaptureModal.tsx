import React from "react";
import {
  Image,
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

type PlateFoodCaptureModalProps = {
  visible: boolean;
  imageUri: string;
  totalWeightLabel: string;
  isAnalyzing: boolean;
  onChangeTotalWeight: (value: string) => void;
  onAnalyze: () => void;
  onRetake: () => void;
  onClose: () => void;
};

export default function PlateFoodCaptureModal({
  visible,
  imageUri,
  totalWeightLabel,
  isAnalyzing,
  onChangeTotalWeight,
  onAnalyze,
  onRetake,
  onClose,
}: PlateFoodCaptureModalProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={() => {
        if (!isAnalyzing) {
          onClose();
        }
      }}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!isAnalyzing) {
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
            <View style={styles.heroTopRow}>
              <Text style={styles.modalTitle}>Analyze plate</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close plate analysis"
                disabled={isAnalyzing}
                onPress={onClose}
                style={styles.modalIconButton}
              >
                <X size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.platePreviewImage}
                resizeMode="cover"
              />
            ) : null}

            <AppTextField
              label="Total plate weight (g, optional)"
              placeholder="Optional: 450"
              value={totalWeightLabel}
              onChangeText={onChangeTotalWeight}
              keyboardType="decimal-pad"
            />

            <Text style={styles.hintText}>
              Aether estimates food items and portions automatically. Add weight only if you measured it.
            </Text>

            <View style={styles.modalActions}>
              <AppButton
                title={isAnalyzing ? "Analyzing..." : "Analyze Plate"}
                onPress={onAnalyze}
                loading={isAnalyzing}
                disabled={isAnalyzing}
              />
              <AppButton
                title="Retake Photo"
                variant="secondary"
                onPress={onRetake}
                disabled={isAnalyzing}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
