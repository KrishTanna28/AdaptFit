import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import AppButton from "../components/ui/AppButton";
import AppSkeleton from "../components/ui/AppSkeleton";
import AppTextField from "../components/ui/AppTextField";
import { styles } from "./ProfileEditModal.styles";
import {
  DIET_TYPE_OPTIONS,
  FITNESS_GOAL_OPTIONS,
  GENDER_OPTIONS,
  LIFESTYLE_OPTIONS,
  type DropdownOption,
  type ProfileFormData,
} from "./profileConfig";

import { X } from "lucide-react-native"
import { appTheme } from "@/theme/designSystem";

type ProfileEditModalProps = {
  visible: boolean;
  isLoading: boolean;
  isSaving: boolean;
  draftProfile: ProfileFormData;
  onChangeDraft: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  onClose: () => void;
  onSave: () => void;
};

type DropdownFieldProps<T extends string> = {
  label: string;
  value: T | "";
  options: ReadonlyArray<DropdownOption<T>>;
  placeholder?: string;
  onChange: (nextValue: T) => void;
};

function toDigitsOnly(value: string) {
  return value.replace(/[^\d]/g, "");
}

function toDecimalInput(value: string) {
  const sanitized = value.replace(/[^\d.]/g, "");
  const parts = sanitized.split(".");

  if (parts.length <= 1) {
    return sanitized;
  }

  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function DropdownField<T extends string>({
  label,
  value,
  options,
  placeholder = "-",
  onChange,
}: DropdownFieldProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <View style={styles.dropdownGroup}>
      <Text style={styles.dropdownLabel}>{label}</Text>

      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        style={styles.dropdownTrigger}
        accessibilityRole="button"
        accessibilityLabel={`Select ${label}`}
      >
        <Text style={styles.dropdownValue}>{selectedOption?.label || placeholder}</Text>
        <Text style={styles.dropdownCaret}>{isOpen ? "▲" : "▼"}</Text>
      </Pressable>

      {isOpen ? (
        <View style={styles.dropdownMenu}>
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    isSelected && styles.dropdownItemTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function ProfileEditModal({
  visible,
  isLoading,
  isSaving,
  draftProfile,
  onChangeDraft,
  onClose,
  onSave,
}: ProfileEditModalProps) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <View style={styles.modalCardWrap}>
          <ScrollView
            style={styles.modalCard}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Fill Profile Details</Text>
              <Pressable
                onPress={onClose}
                style={styles.modalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close edit modal"
              >
                <Text style={styles.modalCloseText}><X size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2}></X></Text>
              </Pressable>
            </View>

            {isLoading ? (
              <AppSkeleton width="62%" height={12} borderRadius={6} variant="default" />
            ) : null}

            <AppTextField
              label="Name"
              value={draftProfile.name}
              onChangeText={(value) =>
                onChangeDraft((prev) => ({ ...prev, name: value }))
              }
              placeholder="Enter name"
              autoCapitalize="words"
            />

            <AppTextField
              label="Age"
              value={draftProfile.age}
              onChangeText={(value) =>
                onChangeDraft((prev) => ({ ...prev, age: toDigitsOnly(value) }))
              }
              keyboardType="number-pad"
              placeholder="Enter age"
            />

            <DropdownField
              label="Gender"
              value={draftProfile.gender}
              options={GENDER_OPTIONS}
              onChange={(nextValue) =>
                onChangeDraft((prev) => ({ ...prev, gender: nextValue }))
              }
            />

            <AppTextField
              label="Height (cm)"
              value={draftProfile.heightCm}
              onChangeText={(value) =>
                onChangeDraft((prev) => ({ ...prev, heightCm: toDecimalInput(value) }))
              }
              keyboardType="decimal-pad"
              placeholder="Enter height"
            />

            <AppTextField
              label="Weight (kg)"
              value={draftProfile.weightKg}
              onChangeText={(value) =>
                onChangeDraft((prev) => ({ ...prev, weightKg: toDecimalInput(value) }))
              }
              keyboardType="decimal-pad"
              placeholder="Enter weight"
            />

            <DropdownField
              label="Fitness Goal"
              value={draftProfile.fitnessGoal}
              options={FITNESS_GOAL_OPTIONS}
              onChange={(nextValue) =>
                onChangeDraft((prev) => ({ ...prev, fitnessGoal: nextValue }))
              }
            />

            <DropdownField
              label="User's normal lifestyle"
              value={draftProfile.lifestyle}
              options={LIFESTYLE_OPTIONS}
              onChange={(nextValue) =>
                onChangeDraft((prev) => ({ ...prev, lifestyle: nextValue }))
              }
            />

            <DropdownField
              label="Diet Type"
              value={draftProfile.dietType}
              options={DIET_TYPE_OPTIONS}
              onChange={(nextValue) =>
                onChangeDraft((prev) => ({ ...prev, dietType: nextValue }))
              }
            />

            <AppTextField
              label="Allergies (comma separated) (optional)"
              value={draftProfile.allergies}
              onChangeText={(value) =>
                onChangeDraft((prev) => ({ ...prev, allergies: value }))
              }
              placeholder="e.g. peanuts, dairy"
            />

            <AppTextField
              label="Food restrictions (optional)"
              value={draftProfile.foodRestrictions}
              onChangeText={(value) =>
                onChangeDraft((prev) => ({ ...prev, foodRestrictions: value }))
              }
              placeholder="Enter food restrictions"
            />

            <AppTextField
              label="Injuries (e.g., knee pain) (optional)"
              value={draftProfile.injuries}
              onChangeText={(value) =>
                onChangeDraft((prev) => ({ ...prev, injuries: value }))
              }
              placeholder="Enter injuries"
            />

            <AppTextField
              label="Medical conditions (optional)"
              value={draftProfile.medicalConditions}
              onChangeText={(value) =>
                onChangeDraft((prev) => ({ ...prev, medicalConditions: value }))
              }
              placeholder="Enter medical conditions"
            />

            <View style={styles.modalActionsRow}>
              <AppButton
                title="Cancel"
                variant="secondary"
                onPress={onClose}
                style={styles.modalActionButton}
              />
              <AppButton
                title="Save Profile"
                onPress={onSave}
                loading={isSaving}
                style={styles.modalActionButton}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
