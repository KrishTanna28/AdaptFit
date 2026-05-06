import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import {
  CalendarDays,
  ChevronDown,
  Droplets,
  Moon,
  Plus,
  Thermometer,
} from "lucide-react-native";

import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppTextField from "../components/ui/AppTextField";
import {
  getUserFriendlyErrorMessage,
  useAppAlert,
} from "../components/ui/AppAlert";
import { useAuthUser } from "../hooks/useAuthUser";
import { db } from "../services/firebase";
import { getTodayDateKey } from "../services/helperFunctions";
import {
  calculateAdaptiveHydrationGoal,
  EMPTY_HYDRATION,
  EMPTY_RECOVERY,
  EMPTY_WEATHER,
  inferWeatherCondition,
  loadDailyLifestyleLog,
  normalizeLifestyleLog,
  upsertDailyLifestyleLog,
  type DailyLifestyleLog,
  type LifestyleWeatherSnapshot,
  type RecoveryLog,
  type WeatherCondition,
} from "../services/lifestyleLog";
import { fetchWeatherForLocation } from "../services/weatherApi";
import { loadDailyWorkoutLog, type LoggedWorkoutEntry } from "../services/workoutLog";
import { appTheme } from "../theme/designSystem";
import { globalStyles } from "../theme/globalStyles";
import DatePickerModal from "./DatePickerModal";
import { styles } from "./LifestyleScreen.styles";

const QUICK_WATER_AMOUNTS = [250, 500, 750];
const CONDITION_OPTIONS: Array<{ value: WeatherCondition; label: string }> = [
  { value: "cool", label: "Cool" },
  { value: "mild", label: "Mild" },
  { value: "hot", label: "Hot" },
  { value: "humid", label: "Humid" },
];
const RATING_OPTIONS = [1, 2, 3, 4, 5];

function parseDateKey(dateKey: string) {
  const parts = dateKey.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getCurrentWeekRange(now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function formatDateForDisplay(dateKey: string) {
  const d = parseDateKey(dateKey);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMl(value: number) {
  return Math.round(value).toLocaleString() + " ml";
}

function formatNumberInput(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1).replace(/\.?0+$/, "");
}

function sanitizeDecimalInput(raw: string) {
  const normalized = raw.replace(",", ".").replace(/[^0-9.]/g, "");
  const firstDot = normalized.indexOf(".");
  if (firstDot < 0) {
    return normalized;
  }
  return normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".") {
    return null;
  }

  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseProfileWeight(rawProfile: unknown): number | null {
  if (!rawProfile || typeof rawProfile !== "object") {
    return null;
  }

  const value = Number((rawProfile as { weightKg?: unknown }).weightKg);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildEmptyLog(dateKey: string): DailyLifestyleLog {
  return normalizeLifestyleLog(
    {
      dateKey,
      hydration: EMPTY_HYDRATION,
      weather: EMPTY_WEATHER,
      recovery: EMPTY_RECOVERY,
    },
    dateKey,
  );
}

export default function LifestyleScreen() {
  const { showAlert } = useAppAlert();
  const { user, loading: authLoading } = useAuthUser();
  const todayKey = getTodayDateKey();
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const weekRange = useMemo(() => {
    const range = getCurrentWeekRange();
    return {
      startKey: getTodayDateKey(range.monday),
      endKey: getTodayDateKey(range.sunday),
    };
  }, [todayKey]);
  const canEditSelectedDate =
    selectedDateKey >= weekRange.startKey && selectedDateKey <= weekRange.endKey;

  const [log, setLog] = useState<DailyLifestyleLog>(() => buildEmptyLog(todayKey));
  const [workouts, setWorkouts] = useState<LoggedWorkoutEntry[]>([]);
  const [profileWeightKg, setProfileWeightKg] = useState<number | null>(null);
  const [isLoadingLog, setIsLoadingLog] = useState(true);
  const [isSavingHydration, setIsSavingHydration] = useState(false);
  const [isSavingWeather, setIsSavingWeather] = useState(false);
  const [isSavingRecovery, setIsSavingRecovery] = useState(false);
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);

  const [waterMlLabel, setWaterMlLabel] = useState("0");
  const [locationLabel, setLocationLabel] = useState("");
  const [temperatureLabel, setTemperatureLabel] = useState("");
  const [humidityLabel, setHumidityLabel] = useState("");
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>("mild");
  const [weatherFetchedAt, setWeatherFetchedAt] = useState<string | null>(null);
  const [sleepHoursLabel, setSleepHoursLabel] = useState("");
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [stressLevel, setStressLevel] = useState<number | null>(null);
  const [recoveryNotes, setRecoveryNotes] = useState("");

  const requireUserUid = () => {
    if (!user?.uid) {
      throw new Error("You must be signed in to log lifestyle data.");
    }
    return user.uid;
  };

  const ensureEditableDate = () => {
    if (canEditSelectedDate) {
      return true;
    }

    showAlert({
      title: "Week locked",
      message: "You can edit only logs from Monday to Sunday of the current week.",
    });
    return false;
  };

  const applyLoadedLogToInputs = (nextLog: DailyLifestyleLog) => {
    setWaterMlLabel(String(nextLog.hydration.intakeMl));
    setLocationLabel(nextLog.weather.locationName);
    setTemperatureLabel(formatNumberInput(nextLog.weather.temperatureC));
    setHumidityLabel(formatNumberInput(nextLog.weather.humidityPercent));
    setWeatherCondition(nextLog.weather.condition);
    setWeatherFetchedAt(nextLog.weather.fetchedAt);
    setSleepHoursLabel(formatNumberInput(nextLog.recovery.sleepHours));
    setSleepQuality(nextLog.recovery.sleepQuality);
    setStressLevel(nextLog.recovery.stressLevel);
    setRecoveryNotes(nextLog.recovery.notes);
  };

  const loadLifestyleData = useCallback(async () => {
    if (!user?.uid) {
      const emptyLog = buildEmptyLog(selectedDateKey);
      setLog(emptyLog);
      applyLoadedLogToInputs(emptyLog);
      setWorkouts([]);
      setProfileWeightKg(null);
      setIsLoadingLog(false);
      return;
    }

    setIsLoadingLog(true);

    try {
      const [nextLog, workoutLog, userSnapshot] = await Promise.all([
        loadDailyLifestyleLog(user.uid, selectedDateKey),
        loadDailyWorkoutLog(user.uid, selectedDateKey),
        getDoc(doc(db, "users", user.uid)),
      ]);

      setLog(nextLog);
      applyLoadedLogToInputs(nextLog);
      setWorkouts(workoutLog.entries);
      setProfileWeightKg(parseProfileWeight(userSnapshot.data()?.profile));
    } catch (error) {
      showAlert({
        title: "Could not load lifestyle log",
        message: getUserFriendlyErrorMessage(
          error,
          "Please check your connection and try again.",
        ),
      });
    } finally {
      setIsLoadingLog(false);
    }
  }, [selectedDateKey, showAlert, user?.uid]);

  useEffect(() => {
    void loadLifestyleData();
  }, [loadLifestyleData]);

  useFocusEffect(
    useCallback(() => {
      void loadLifestyleData();
    }, [loadLifestyleData]),
  );

  const weatherSnapshot = useMemo<LifestyleWeatherSnapshot>(() => {
    const temperatureC = parseOptionalNumber(temperatureLabel);
    const humidityPercent = parseOptionalNumber(humidityLabel);

    return {
      locationName: locationLabel.trim(),
      temperatureC,
      humidityPercent:
        humidityPercent === null ? null : Math.min(100, Math.max(0, humidityPercent)),
      condition: weatherCondition,
      fetchedAt: weatherFetchedAt,
    };
  }, [humidityLabel, locationLabel, temperatureLabel, weatherCondition, weatherFetchedAt]);

  const hydrationGoal = useMemo(
    () =>
      calculateAdaptiveHydrationGoal({
        weightKg: profileWeightKg,
        workouts,
        weather: weatherSnapshot,
      }),
    [profileWeightKg, weatherSnapshot, workouts],
  );

  const currentWaterMl = Math.max(0, Math.round(parseOptionalNumber(waterMlLabel) ?? 0));
  const progressPercent = hydrationGoal.goalMl > 0
    ? Math.min(100, Math.round((currentWaterMl / hydrationGoal.goalMl) * 100))
    : 0;
  const progressWidth = `${progressPercent}%` as `${number}%`;
  const remainingMl = Math.max(0, hydrationGoal.goalMl - currentWaterMl);
  const recoveryIsLogged =
    sleepHoursLabel.trim() || sleepQuality !== null || stressLevel !== null || recoveryNotes.trim();

  const saveWeather = async (snapshot: LifestyleWeatherSnapshot) => {
    if (!ensureEditableDate()) {
      return;
    }

    const uid = requireUserUid();
    setIsSavingWeather(true);
    try {
      await upsertDailyLifestyleLog(uid, selectedDateKey, { weather: snapshot });
      setLog((prev) => normalizeLifestyleLog({ ...prev, weather: snapshot }, selectedDateKey));
    } finally {
      setIsSavingWeather(false);
    }
  };

  const handleFetchWeather = async () => {
    if (!ensureEditableDate()) {
      return;
    }

    setIsFetchingWeather(true);
    try {
      const snapshot = await fetchWeatherForLocation(locationLabel);
      setLocationLabel(snapshot.locationName);
      setTemperatureLabel(formatNumberInput(snapshot.temperatureC));
      setHumidityLabel(formatNumberInput(snapshot.humidityPercent));
      setWeatherCondition(snapshot.condition);
      setWeatherFetchedAt(snapshot.fetchedAt);

      if (user?.uid) {
        await saveWeather(snapshot);
      }
    } catch (error) {
      showAlert({
        title: "Weather lookup failed",
        message: getUserFriendlyErrorMessage(
          error,
          "Enter weather manually or try another location.",
        ),
      });
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const handleSaveWeather = async () => {
    try {
      const inferredCondition = inferWeatherCondition({
        temperatureC: weatherSnapshot.temperatureC,
        humidityPercent: weatherSnapshot.humidityPercent,
      });
      const snapshot = {
        ...weatherSnapshot,
        condition: weatherCondition || inferredCondition,
      };
      await saveWeather(snapshot);
    } catch (error) {
      showAlert({
        title: "Could not save weather",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    }
  };

  const saveHydration = async (nextIntakeMl: number) => {
    if (!ensureEditableDate()) {
      return;
    }

    const uid = requireUserUid();
    const hydration = {
      intakeMl: Math.max(0, Math.round(nextIntakeMl)),
      goalMl: hydrationGoal.goalMl,
      updatedAt: new Date().toISOString(),
    };

    setIsSavingHydration(true);
    try {
      await upsertDailyLifestyleLog(uid, selectedDateKey, {
        hydration,
        weather: weatherSnapshot,
      });
      setLog((prev) =>
        normalizeLifestyleLog(
          {
            ...prev,
            hydration,
            weather: weatherSnapshot,
          },
          selectedDateKey,
        ),
      );
      setWaterMlLabel(String(hydration.intakeMl));
    } finally {
      setIsSavingHydration(false);
    }
  };

  const handleAddWater = async (amountMl: number) => {
    try {
      await saveHydration(currentWaterMl + amountMl);
    } catch (error) {
      showAlert({
        title: "Could not update water",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    }
  };

  const handleSaveHydration = async () => {
    try {
      await saveHydration(currentWaterMl);
    } catch (error) {
      showAlert({
        title: "Could not save hydration",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    }
  };

  const handleSaveRecovery = async () => {
    if (!ensureEditableDate()) {
      return;
    }

    try {
      const uid = requireUserUid();
      const sleepHours = parseOptionalNumber(sleepHoursLabel);

      if (sleepHours !== null && (sleepHours < 0 || sleepHours > 24)) {
        showAlert({
          title: "Invalid sleep hours",
          message: "Sleep hours must be between 0 and 24.",
        });
        return;
      }

      const recovery: RecoveryLog = {
        sleepHours,
        sleepQuality,
        stressLevel,
        notes: recoveryNotes.trim(),
        loggedAt: new Date().toISOString(),
      };

      setIsSavingRecovery(true);
      try {
        await upsertDailyLifestyleLog(uid, selectedDateKey, { recovery });
        setLog((prev) => normalizeLifestyleLog({ ...prev, recovery }, selectedDateKey));
      } finally {
        setIsSavingRecovery(false);
      }
    } catch (error) {
      showAlert({
        title: "Could not save recovery",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    }
  };

  return (
    <SafeAreaView style={globalStyles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <AppCard style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroTextWrap}>
                <Text style={styles.title}>Lifestyle</Text>
                <Text style={styles.subtitle}>Hydration, sleep, stress, and weather</Text>
              </View>
            </View>

            <Pressable
              style={styles.datePickerTrigger}
              onPress={() => setIsDatePickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={"Change lifestyle log date. Current " + formatDateForDisplay(selectedDateKey)}
            >
              <View style={styles.datePickerLeft}>
                <CalendarDays size={16} color={appTheme.colors.mutedText} strokeWidth={2.2} />
                <Text style={styles.datePickerValue}>{formatDateForDisplay(selectedDateKey)}</Text>
              </View>
              <ChevronDown size={16} color={appTheme.colors.mutedText} strokeWidth={2.2} />
            </Pressable>
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <View style={styles.sectionTitleRow}>
                  <Droplets size={18} color={appTheme.colors.text} strokeWidth={2.2} />
                  <Text style={styles.sectionTitle}>Hydration</Text>
                </View>
                <Text style={styles.sectionMeta}>
                  Goal adapts to workouts and weather.
                </Text>
              </View>
            </View>

            <View style={styles.metricGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{formatMl(currentWaterMl)}</Text>
                <Text style={styles.metricLabel}>Logged</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{formatMl(hydrationGoal.goalMl)}</Text>
                <Text style={styles.metricLabel}>Adaptive goal</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{String(progressPercent)}%</Text>
                <Text style={styles.metricLabel}>Progress</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{formatMl(remainingMl)}</Text>
                <Text style={styles.metricLabel}>Remaining</Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressWidth }]} />
            </View>

            <View style={styles.chipRow}>
              {hydrationGoal.notes.map((note) => (
                <View key={note} style={styles.chip}>
                  <Text style={styles.chipText}>{note}</Text>
                </View>
              ))}
            </View>

            <View style={styles.quickButtonRow}>
              {QUICK_WATER_AMOUNTS.map((amount) => (
                <Pressable
                  key={amount}
                  style={styles.quickButton}
                  onPress={() => {
                    void handleAddWater(amount);
                  }}
                  disabled={isSavingHydration || !canEditSelectedDate}
                  accessibilityRole="button"
                  accessibilityLabel={"Add " + String(amount) + " ml water"}
                >
                  <Plus size={14} color={appTheme.colors.text} strokeWidth={2.4} />
                  <Text style={styles.quickButtonText}>{String(amount)} ml</Text>
                </Pressable>
              ))}
            </View>

            <AppTextField
              label="Total water today (ml)"
              placeholder="Example: 1800"
              value={waterMlLabel}
              onChangeText={(value) => setWaterMlLabel(sanitizeDecimalInput(value))}
              keyboardType="decimal-pad"
              editable={!isSavingHydration && canEditSelectedDate}
            />

            <AppButton
              title={isSavingHydration ? "Saving..." : "Save Hydration"}
              onPress={() => {
                void handleSaveHydration();
              }}
              loading={isSavingHydration}
              disabled={isSavingHydration || !canEditSelectedDate}
            />
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Thermometer size={18} color={appTheme.colors.text} strokeWidth={2.2} />
              <Text style={styles.sectionTitle}>Weather</Text>
            </View>

            <AppTextField
              label="Location"
              placeholder="City or area"
              value={locationLabel}
              onChangeText={setLocationLabel}
              editable={!isFetchingWeather && canEditSelectedDate}
            />

            <View style={styles.actionsRow}>
              <AppButton
                title={isFetchingWeather ? "Fetching..." : "Fetch Weather"}
                onPress={() => {
                  void handleFetchWeather();
                }}
                loading={isFetchingWeather}
                disabled={isFetchingWeather || !canEditSelectedDate}
                style={styles.actionButton}
              />
              <AppButton
                title="Save"
                variant="secondary"
                onPress={() => {
                  void handleSaveWeather();
                }}
                loading={isSavingWeather}
                disabled={isSavingWeather || !canEditSelectedDate}
                style={styles.actionButton}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputCell}>
                <AppTextField
                  label="Temperature (C)"
                  placeholder="30"
                  value={temperatureLabel}
                  onChangeText={(value) => {
                    const next = sanitizeDecimalInput(value);
                    setTemperatureLabel(next);
                    setWeatherCondition(
                      inferWeatherCondition({
                        temperatureC: parseOptionalNumber(next),
                        humidityPercent: parseOptionalNumber(humidityLabel),
                      }),
                    );
                  }}
                  keyboardType="decimal-pad"
                  editable={!isSavingWeather && canEditSelectedDate}
                />
              </View>
              <View style={styles.inputCell}>
                <AppTextField
                  label="Humidity (%)"
                  placeholder="65"
                  value={humidityLabel}
                  onChangeText={(value) => {
                    const next = sanitizeDecimalInput(value);
                    setHumidityLabel(next);
                    setWeatherCondition(
                      inferWeatherCondition({
                        temperatureC: parseOptionalNumber(temperatureLabel),
                        humidityPercent: parseOptionalNumber(next),
                      }),
                    );
                  }}
                  keyboardType="decimal-pad"
                  editable={!isSavingWeather && canEditSelectedDate}
                />
              </View>
            </View>

            <View style={styles.chipRow}>
              {CONDITION_OPTIONS.map((option) => {
                const active = weatherCondition === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    onPress={() => setWeatherCondition(option.value)}
                    disabled={!canEditSelectedDate}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.helperText}>
              {weatherFetchedAt
                ? "Weather fetched for " + (locationLabel || "selected location") + "."
                : "Manual weather works too when fetching is unavailable."}
            </Text>
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Moon size={18} color={appTheme.colors.text} strokeWidth={2.2} />
              <Text style={styles.sectionTitle}>Sleep and Stress</Text>
            </View>

            <AppTextField
              label="Sleep hours"
              placeholder="Example: 7.5"
              value={sleepHoursLabel}
              onChangeText={(value) => setSleepHoursLabel(sanitizeDecimalInput(value))}
              keyboardType="decimal-pad"
              editable={!isSavingRecovery && canEditSelectedDate}
            />

            <Text style={styles.helperText}>Sleep quality</Text>
            <View style={styles.chipRow}>
              {RATING_OPTIONS.map((rating) => {
                const active = sleepQuality === rating;
                return (
                  <Pressable
                    key={"sleep-" + String(rating)}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    onPress={() => setSleepQuality(active ? null : rating)}
                    disabled={!canEditSelectedDate}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                      {String(rating)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.helperText}>Stress level</Text>
            <View style={styles.chipRow}>
              {RATING_OPTIONS.map((rating) => {
                const active = stressLevel === rating;
                return (
                  <Pressable
                    key={"stress-" + String(rating)}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    onPress={() => setStressLevel(active ? null : rating)}
                    disabled={!canEditSelectedDate}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                      {String(rating)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View>
              <Text style={styles.helperText}>Notes</Text>
              <TextInput
                value={recoveryNotes}
                onChangeText={setRecoveryNotes}
                style={{
                  minHeight: 88,
                  borderRadius: appTheme.radii.md,
                  backgroundColor: appTheme.colors.inputBackground,
                  borderWidth: 1,
                  borderColor: appTheme.colors.border,
                  paddingHorizontal: appTheme.spacing.md,
                  paddingVertical: appTheme.spacing.sm,
                  color: appTheme.colors.text,
                  fontSize: 15,
                  fontWeight: "500",
                  textAlignVertical: "top",
                }}
                multiline
                placeholder="Anything affecting recovery today"
                placeholderTextColor={appTheme.colors.mutedText}
                editable={!isSavingRecovery && canEditSelectedDate}
              />
            </View>

            <AppButton
              title={isSavingRecovery ? "Saving..." : recoveryIsLogged ? "Save Recovery" : "Log Recovery"}
              onPress={() => {
                void handleSaveRecovery();
              }}
              loading={isSavingRecovery}
              disabled={isSavingRecovery || !canEditSelectedDate}
            />
          </AppCard>

          {authLoading || isLoadingLog ? (
            <AppCard style={styles.sectionCard}>
              <Text style={styles.disabledText}>Loading lifestyle log...</Text>
            </AppCard>
          ) : null}

          {!canEditSelectedDate ? (
            <AppCard style={styles.sectionCard}>
              <Text style={styles.disabledText}>
                This week is locked for editing, but you can still review the log.
              </Text>
            </AppCard>
          ) : null}
        </View>
      </ScrollView>

      <DatePickerModal
        visible={isDatePickerVisible}
        selectedDateKey={selectedDateKey}
        onSelectDate={setSelectedDateKey}
        onClose={() => setIsDatePickerVisible(false)}
      />
    </SafeAreaView>
  );
}
