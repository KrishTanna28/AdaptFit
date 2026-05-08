import React, { memo, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Calendar } from "react-native-calendars";

import AppButton from "../components/ui/AppButton";
import AppTextField from "../components/ui/AppTextField";
import { getTodayDateKey } from "../services/helperFunctions";
import { appTheme } from "../theme/designSystem";
import { styles } from "./NutritionScreen.styles";

type Props = {
  visible: boolean;
  selectedDateKey: string;
  onSelectDate: (dateKey: string) => void;
  onClose: () => void;
};

function parseDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) {
    return new Date();
  }
  return new Date(y, m - 1, d);
}

function daysInMonth(year: number, month1To12: number) {
  return new Date(year, month1To12, 0).getDate();
}

function DatePickerModalImpl({
  visible,
  selectedDateKey,
  onSelectDate,
  onClose,
}: Props) {
  const [draftDateKey, setDraftDateKey] = useState(selectedDateKey);
  const [visibleMonthKey, setVisibleMonthKey] = useState(selectedDateKey);
  const [isMonthYearEditorVisible, setIsMonthYearEditorVisible] = useState(false);
  const [editorMonthInput, setEditorMonthInput] = useState("");
  const [editorYearInput, setEditorYearInput] = useState("");
  const todayKey = getTodayDateKey();

  useEffect(() => {
    if (visible) {
      setDraftDateKey(selectedDateKey);

      const selected = parseDateKey(selectedDateKey);
      const firstOfMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
      setVisibleMonthKey(getTodayDateKey(firstOfMonth));

      setEditorMonthInput(String(selected.getMonth() + 1));
      setEditorYearInput(String(selected.getFullYear()));
    }
  }, [visible, selectedDateKey]);

  const headerTitle = useMemo(() => {
    const base = parseDateKey(visibleMonthKey);
    return base.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [visibleMonthKey]);

  const markedDates = useMemo(
    () => ({
      [draftDateKey]: {
        selected: true,
        selectedColor: appTheme.colors.primary,
        selectedTextColor: appTheme.colors.onPrimary,
      },
    }),
    [draftDateKey],
  );

  const openMonthYearEditor = () => {
    const base = parseDateKey(visibleMonthKey);
    setEditorMonthInput(String(base.getMonth() + 1));
    setEditorYearInput(String(base.getFullYear()));
    setIsMonthYearEditorVisible(true);
  };

  const applyMonthYearEditor = () => {
    const month = Number(editorMonthInput);
    const year = Number(editorYearInput);
    const now = parseDateKey(todayKey);

    const validMonth = Number.isInteger(month) && month >= 1 && month <= 12;
    const validYear = Number.isInteger(year) && year >= 1900 && year <= now.getFullYear();

    if (!validMonth || !validYear) {
      return;
    }

    const currentDay = parseDateKey(draftDateKey).getDate();
    const day = Math.min(currentDay, daysInMonth(year, month));
    const candidate = new Date(year, month - 1, day);
    const clamped = candidate > now ? now : candidate;

    const selectedKey = getTodayDateKey(clamped);
    const firstOfMonthKey = getTodayDateKey(
      new Date(clamped.getFullYear(), clamped.getMonth(), 1),
    );

    setDraftDateKey(selectedKey);
    setVisibleMonthKey(firstOfMonthKey);
    setIsMonthYearEditorVisible(false);
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalCard, styles.datePickerModalCard]}>
          <ScrollView
            style={styles.datePickerScroll}
            contentContainerStyle={[styles.modalContent, styles.datePickerModalContent]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>Choose date</Text>

            <Calendar
              current={visibleMonthKey}
              renderHeader={() => (
                <Pressable
                  style={styles.calendarHeaderButton}
                  onPress={openMonthYearEditor}
                  accessibilityRole="button"
                  accessibilityLabel="Edit month and year"
                >
                  <Text style={styles.calendarHeaderButtonText}>{headerTitle}</Text>
                </Pressable>
              )}
              onMonthChange={({ year, month }) => {
                const firstOfMonthKey = getTodayDateKey(new Date(year, month - 1, 1));
                if (firstOfMonthKey !== visibleMonthKey) {
                  setVisibleMonthKey(firstOfMonthKey);
                }
              }}
              maxDate={todayKey}
              onDayPress={(day) => {
                setDraftDateKey(day.dateString);
                const selected = parseDateKey(day.dateString);
                setVisibleMonthKey(
                  getTodayDateKey(new Date(selected.getFullYear(), selected.getMonth(), 1)),
                );
              }}
              markedDates={markedDates}
              hideExtraDays
              disableAllTouchEventsForDisabledDays
              theme={{
                calendarBackground: appTheme.colors.card,
                monthTextColor: appTheme.colors.textPrimary,
                dayTextColor: appTheme.colors.textPrimary,
                textDisabledColor: appTheme.colors.textMuted,
                todayTextColor: appTheme.colors.primary,
                arrowColor: appTheme.colors.primary,
              }}
            />
          </ScrollView>

          <View style={styles.datePickerActionsRow}>
            <AppButton
              title="Cancel"
              variant="secondary"
              onPress={onClose}
              style={styles.datePickerActionButton}
            />
            <AppButton
              title="Select"
              onPress={() => {
                onSelectDate(draftDateKey);
                onClose();
              }}
              style={styles.datePickerActionButton}
            />
          </View>

          {isMonthYearEditorVisible ? (
            <View style={styles.monthYearEditorOverlay}>
              <Pressable
                style={styles.monthYearEditorBackdrop}
                onPress={() => setIsMonthYearEditorVisible(false)}
              />

              <View style={styles.monthYearEditorCard}>
                <Text style={styles.modalTitle}>Go to month and year</Text>

                <View style={styles.monthYearEditorRow}>
                  <View style={styles.monthYearEditorField}>
                    <AppTextField
                      label="Month"
                      placeholder="MM"
                      value={editorMonthInput}
                      onChangeText={(value) =>
                        setEditorMonthInput(value.replace(/[^0-9]/g, "").slice(0, 2))
                      }
                      keyboardType="number-pad"
                    />
                  </View>

                  <View style={styles.monthYearEditorField}>
                    <AppTextField
                      label="Year"
                      placeholder="YYYY"
                      value={editorYearInput}
                      onChangeText={(value) =>
                        setEditorYearInput(value.replace(/[^0-9]/g, "").slice(0, 4))
                      }
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <View style={styles.monthYearEditorActions}>
                  <AppButton
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setIsMonthYearEditorVisible(false)}
                    style={styles.datePickerActionButton}
                  />
                  <AppButton
                    title="Apply"
                    onPress={applyMonthYearEditor}
                    style={styles.datePickerActionButton}
                  />
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export default memo(DatePickerModalImpl);
