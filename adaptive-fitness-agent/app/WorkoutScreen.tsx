import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { CalendarDays, Camera, ChevronDown, Plus } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { useFocusEffect } from "@react-navigation/native";

import AppCard from "../components/ui/AppCard";
import {
  getUserFriendlyErrorMessage,
  useAppAlert,
} from "../components/ui/AppAlert";
import { useAuthUser } from "../hooks/useAuthUser";
import { db } from "../services/firebase";
import { getTodayDateKey } from "../services/helperFunctions";
import { searchWorkoutCatalog, type WorkoutCatalogItem } from "../services/workoutCatalogSearch";
import {
  calculateWorkoutCalories,
  hasCompleteCalorieProfile,
  type UserMetProfile,
} from "../services/workoutCalories";
import { type MetIntensity } from "../services/workoutMetDataset";
import { resolveWorkoutMetMapping } from "../services/workoutMetResolver";
import { upsertWorkoutMetMappingPartial } from "../services/workoutMetMapping";
import {
  deleteLoggedWorkoutEntry,
  loadDailyWorkoutLog,
  upsertLoggedWorkoutEntryPartial,
  type LoggedWorkoutEntry,
} from "../services/workoutLog";
import { appTheme } from "../theme/designSystem";
import { globalStyles } from "../theme/globalStyles";
import DatePickerModal from "./DatePickerModal";
import WorkoutFormCheckModal from "./WorkoutFormCheckModal";
import WorkoutEntryDetailModal from "./WorkoutEntryDetailModal";
import WorkoutSearchModal, {
  type WorkoutDetectedType,
  type WorkoutInputMode,
  type WorkoutSearchModalController,
} from "./WorkoutSearchModal";
import { styles } from "./WorkoutScreen.styles";

function parseDateKey(dateKey: string) {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return new Date();
  }
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

function formatDateOptionalLabel(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) {
    return "Today";
  }
  const d = parseDateKey(dateKey);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function toPositiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function toOptionalPositiveIntFromText(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parseProfileGender(value: unknown): UserMetProfile["gender"] {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "MALE") return "MALE";
  if (normalized === "FEMALE") return "FEMALE";
  return null;
}

function parseUserMetProfile(raw: unknown): UserMetProfile {
  if (!raw || typeof raw !== "object") {
    return {
      age: null,
      gender: null,
      heightCm: null,
      weightKg: null,
    };
  }

  const data = raw as Record<string, unknown>;
  return {
    age: toPositiveNumber(data.age),
    gender: parseProfileGender(data.gender),
    heightCm: toPositiveNumber(data.heightCm),
    weightKg: toPositiveNumber(data.weightKg),
  };
}

function formatDuration(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

type WorkoutAutoDetection = {
  detectedType: WorkoutDetectedType;
  mode: WorkoutInputMode;
  hint: string | null;
};

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildCategoryHint(workout: WorkoutCatalogItem) {
  const categoryName = workout.category.trim() || "Uncategorized";
  if (typeof workout.categoryId === "number") {
    return "Category: " + categoryName + " (id " + String(workout.categoryId) + ")";
  }
  return "Category: " + categoryName;
}

function inferWorkoutInputMode(workout: WorkoutCatalogItem): WorkoutAutoDetection {
  const categoryNormalized = normalizeSearchText(workout.category);

  if (!categoryNormalized || categoryNormalized === "uncategorized") {
    return {
      detectedType: "other",
      mode: "cardio",
      hint: null,
    };
  }

  if (categoryNormalized.includes("sport")) {
    return {
      detectedType: "sports",
      mode: "sports",
      hint: buildCategoryHint(workout),
    };
  }

  if (categoryNormalized.includes("cardio")) {
    return {
      detectedType: "cardio",
      mode: "cardio",
      hint: buildCategoryHint(workout),
    };
  }

  return {
    detectedType: "strength",
    mode: "strength",
    hint: buildCategoryHint(workout),
  };
}

function estimateStrengthDurationMin(input: {
  sets: number;
  repsPerSet: number;
  secPerRep: number;
  restBetweenSetsSec: number;
  minSessionMin: number;
}) {
  const repSeconds = input.sets * input.repsPerSet * input.secPerRep;
  const restSeconds = Math.max(0, input.sets - 1) * input.restBetweenSetsSec;
  const totalMin = (repSeconds + restSeconds) / 60;
  return Math.max(input.minSessionMin, totalMin);
}

export default function WorkoutScreen() {
  const { showAlert } = useAppAlert();
  const { user } = useAuthUser();

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

  const [entries, setEntries] = useState<LoggedWorkoutEntry[]>([]);
  const [isLoadingLog, setIsLoadingLog] = useState(true);

  const dailyWorkoutCaloriesBurned = useMemo(() => {
    return Math.round(
      entries.reduce((sum, entry) => {
        const value = Number(entry.caloriesActive);
        return Number.isFinite(value) ? sum + Math.max(0, value) : sum;
      }, 0),
    );
  }, [entries]);

  const totalWorkoutDurationMin = useMemo(() => {
    return entries.reduce((sum, entry) => {
      const value = Number(entry.durationMin);
      return Number.isFinite(value) ? sum + Math.max(0, value) : sum;
    }, 0);
  }, [entries]);

  const [profileForCalories, setProfileForCalories] = useState<UserMetProfile | null>(null);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isFormCheckVisible, setIsFormCheckVisible] = useState(false);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<LoggedWorkoutEntry | null>(null);
  const [isEntryDetailVisible, setIsEntryDetailVisible] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchedWorkouts, setHasSearchedWorkouts] = useState(false);
  const [searchResults, setSearchResults] = useState<WorkoutCatalogItem[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

  const [workoutMode, setWorkoutMode] = useState<WorkoutInputMode>("cardio");
  const [detectedWorkoutType, setDetectedWorkoutType] = useState<WorkoutDetectedType>("other");
  const [detectedWorkoutHint, setDetectedWorkoutHint] = useState<string | null>(null);
  const [durationMinLabel, setDurationMinLabel] = useState("30");
  const [setsLabel, setSetsLabel] = useState("");
  const [repsLabel, setRepsLabel] = useState("");
  const [secPerRepLabel, setSecPerRepLabel] = useState("4");
  const [restBetweenSetsSecLabel, setRestBetweenSetsSecLabel] = useState("75");
  const [minSessionMinLabel, setMinSessionMinLabel] = useState("5");
  const [intensity, setIntensity] = useState<MetIntensity>("moderate");

  const selectedWorkout = useMemo(
    () => searchResults.find((item) => item.id === selectedWorkoutId) ?? null,
    [searchResults, selectedWorkoutId],
  );

  const applyWorkoutAutoDetection = (workout: WorkoutCatalogItem | null) => {
    if (!workout) {
      setWorkoutMode("cardio");
      setDetectedWorkoutType("other");
      setDetectedWorkoutHint(null);
      return;
    }

    const detection = inferWorkoutInputMode(workout);
    setWorkoutMode(detection.mode);
    setDetectedWorkoutType(detection.detectedType);
    setDetectedWorkoutHint(detection.hint);
  };

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      if (!user?.uid) {
        if (mounted) {
          setProfileForCalories(null);
        }
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        if (!mounted) return;
        const profile = snapshot.data()?.profile;
        setProfileForCalories(parseUserMetProfile(profile));
      } catch {
        if (mounted) {
          setProfileForCalories(null);
        }
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const loadLog = async () => {
        if (!user?.uid) {
          if (mounted) {
            setEntries([]);
            setIsLoadingLog(false);
          }
          return;
        }

        setIsLoadingLog(true);
        try {
          const log = await loadDailyWorkoutLog(user.uid, selectedDateKey);
          if (mounted) {
            setEntries(log.entries);
          }
        } catch (error) {
          if (!mounted) {
            showAlert({
              title: "Could not load workouts",
              message: getUserFriendlyErrorMessage(
                error,
                "Please check your connection and try again.",
              ),
            });
          }
        } finally {
          if (mounted) {
            setIsLoadingLog(false);
          }
        }
      };

      void loadLog();

      return () => {
        mounted = false;
      };
    }, [selectedDateKey, showAlert, user?.uid]),
  );

  const resetModalState = () => {
    setEditingEntryId(null);
    setSearchQuery("");
    setIsSearching(false);
    setHasSearchedWorkouts(false);
    setSearchResults([]);
    setSelectedWorkoutId(null);
    setWorkoutMode("cardio");
    setDetectedWorkoutType("other");
    setDetectedWorkoutHint(null);
    setDurationMinLabel("30");
    setSetsLabel("");
    setRepsLabel("");
    setSecPerRepLabel("4");
    setRestBetweenSetsSecLabel("75");
    setMinSessionMinLabel("5");
    setIntensity("moderate");
    setIsSavingWorkout(false);
  };

  const ensureEditableDate = () => {
    if (canEditSelectedDate) return true;
    showAlert({
      title: "Week locked",
      message: "You can edit only logs from Monday to Sunday of the current week.",
    });
    return false;
  };

  const openAddModal = () => {
    if (!user?.uid) {
      showAlert({
        title: "Sign-in required",
        message: "Please sign in to add workouts.",
      });
      return;
    }
    if (!ensureEditableDate()) return;
    resetModalState();
    setIsModalVisible(true);
  };

  const closeModal = () => {
    if (isSavingWorkout) return;
    setEditingEntryId(null);
    setIsModalVisible(false);
  };

  const openEntryDetail = (entry: LoggedWorkoutEntry) => {
    setSelectedEntry(entry);
    setIsEntryDetailVisible(true);
  };

  const closeEntryDetail = () => {
    setIsEntryDetailVisible(false);
    setSelectedEntry(null);
  };

  const handleEditSelectedEntry = () => {
    if (!ensureEditableDate()) return;
    if (!selectedEntry) return;

    const selectedEntryAsCatalogItem: WorkoutCatalogItem = {
      id: selectedEntry.exerciseId,
      name: selectedEntry.workoutName,
      categoryId: null,
      category: "Saved workout",
      description: "",
      muscles: [],
      equipment: [],
      aliases: [],
      source: "Saved",
    };

    setSearchQuery(selectedEntry.workoutName);
    setHasSearchedWorkouts(true);
    setSearchResults([selectedEntryAsCatalogItem]);
    setSelectedWorkoutId(selectedEntry.exerciseId);
    setWorkoutMode(selectedEntry.workoutMode);
    setDetectedWorkoutType(selectedEntry.workoutMode);
    setDetectedWorkoutHint("Loaded from saved workout entry.");
    setDurationMinLabel(formatDuration(selectedEntry.durationMin));
    setSetsLabel(selectedEntry.sets ? String(selectedEntry.sets) : "");
    setRepsLabel(selectedEntry.reps ? String(selectedEntry.reps) : "");
    setSecPerRepLabel(selectedEntry.secPerRep ? formatDuration(selectedEntry.secPerRep) : "4");
    setRestBetweenSetsSecLabel(
      selectedEntry.restBetweenSetsSec ? formatDuration(selectedEntry.restBetweenSetsSec) : "75",
    );
    setMinSessionMinLabel(
      selectedEntry.minSessionMin ? formatDuration(selectedEntry.minSessionMin) : "5",
    );
    setIntensity(selectedEntry.intensity);
    setEditingEntryId(selectedEntry.id);
    setIsModalVisible(true);
    closeEntryDetail();
  };

  const handleDeleteSelectedEntry = () => {
    if (!ensureEditableDate()) return;
    if (!selectedEntry || !user?.uid) return;

    const entryToDelete = selectedEntry;

    showAlert({
      title: "Delete workout?",
      message: "Delete " + entryToDelete.workoutName + " from this day?",
      actions: [
        { label: "Cancel", style: "secondary" },
        {
          label: "Delete",
          style: "primary",
          onPress: async () => {
            setIsSavingWorkout(true);
            try {
              await deleteLoggedWorkoutEntry(user.uid, selectedDateKey, entryToDelete.id);
              setEntries((prev) => prev.filter((item) => item.id !== entryToDelete.id));
              closeEntryDetail();
            } catch (error) {
              showAlert({
                title: "Could not delete workout",
                message: getUserFriendlyErrorMessage(
                  error,
                  "Please try again in a moment.",
                ),
              });
            } finally {
              setIsSavingWorkout(false);
            }
          },
        },
      ],
    });
  };

  const handleSearchWorkouts = async () => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      showAlert({
        title: "Search too short",
        message: "Please enter at least 2 characters.",
      });
      return;
    }

    setIsSearching(true);
    try {
      const data = await searchWorkoutCatalog({ query, pageSize: 20 });
      setHasSearchedWorkouts(true);
      setSearchResults(data);
      const firstResult = data[0] ?? null;
      setSelectedWorkoutId(firstResult?.id ?? null);
      applyWorkoutAutoDetection(firstResult);
    } catch (error) {
      showAlert({
        title: "Search failed",
        message: getUserFriendlyErrorMessage(
          error,
          "Could not fetch workouts right now.",
        ),
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
    setHasSearchedWorkouts(false);
    setSearchResults([]);
    setSelectedWorkoutId(null);
    applyWorkoutAutoDetection(null);
  };

  const handleSelectWorkoutId = (id: string | null) => {
    setSelectedWorkoutId(id);
    const workout = searchResults.find((item) => item.id === id) ?? null;
    applyWorkoutAutoDetection(workout);
  };

  const handleSaveWorkout = async () => {
    if (!ensureEditableDate()) return;

    if (!user?.uid) {
      showAlert({
        title: "Sign-in required",
        message: "Please sign in to add workouts.",
      });
      return;
    }

    if (!selectedWorkout) {
      showAlert({
        title: "No workout selected",
        message: "Select one workout from search results first.",
      });
      return;
    }

    let durationMin = 0;
    let sets: number | null = null;
    let reps: number | null = null;
    let secPerRep: number | null = null;
    let restBetweenSetsSec: number | null = null;
    let minSessionMin: number | null = null;

    if (workoutMode !== "strength") {
      const parsedDuration = toPositiveNumber(durationMinLabel);
      if (parsedDuration === null) {
        showAlert({
          title: "Invalid duration",
          message: "Duration must be a positive number.",
        });
        return;
      }
      durationMin = parsedDuration;
    } else {
      const parsedSets = toOptionalPositiveIntFromText(setsLabel);
      if (parsedSets === null) {
        showAlert({
          title: "Invalid sets",
          message: "Sets must be a positive whole number.",
        });
        return;
      }

      const parsedReps = toOptionalPositiveIntFromText(repsLabel);
      if (parsedReps === null) {
        showAlert({
          title: "Invalid reps",
          message: "Reps must be a positive whole number.",
        });
        return;
      }

      const parsedSecPerRep = toPositiveNumber(secPerRepLabel);
      if (parsedSecPerRep === null) {
        showAlert({
          title: "Invalid seconds per rep",
          message: "Seconds per rep must be a positive number.",
        });
        return;
      }

      const parsedRestBetweenSetsSec = toPositiveNumber(restBetweenSetsSecLabel);
      if (parsedRestBetweenSetsSec === null) {
        showAlert({
          title: "Invalid rest time",
          message: "Rest between sets must be a positive number.",
        });
        return;
      }

      const parsedMinSessionMin = toPositiveNumber(minSessionMinLabel);
      if (parsedMinSessionMin === null) {
        showAlert({
          title: "Invalid minimum session",
          message: "Minimum session must be a positive number.",
        });
        return;
      }

      sets = parsedSets;
      reps = parsedReps;
      secPerRep = parsedSecPerRep;
      restBetweenSetsSec = parsedRestBetweenSetsSec;
      minSessionMin = parsedMinSessionMin;
      durationMin = estimateStrengthDurationMin({
        sets: parsedSets,
        repsPerSet: parsedReps,
        secPerRep: parsedSecPerRep,
        restBetweenSetsSec: parsedRestBetweenSetsSec,
        minSessionMin: parsedMinSessionMin,
      });
    }

    setIsSavingWorkout(true);
    try {
      const resolution = await resolveWorkoutMetMapping({
        workout: selectedWorkout,
        intensity,
        topN: 5,
      });

      if (!resolution.best) {
        showAlert({
          title: "Could not add workout",
          message: "We could not map this workout yet. Try another workout or intensity.",
        });
        return;
      }

      let caloriesGross = 0;
      let caloriesActive = 0;
      const existingEntry = editingEntryId
        ? entries.find((entry) => entry.id === editingEntryId) ?? null
        : null;

      if (hasCompleteCalorieProfile(profileForCalories)) {
        const c = calculateWorkoutCalories({
          metValue: resolution.best.metValue,
          durationMin,
          profile: profileForCalories,
        });
        caloriesGross = Number(c.grossCalories.toFixed(2));
        caloriesActive = Number(c.activeCalories.toFixed(2));
      }

      const entry: LoggedWorkoutEntry = {
        id:
          existingEntry?.id ??
          ("entry-" + Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8)),
        exerciseId: selectedWorkout.id,
        workoutName: selectedWorkout.name,
        workoutMode,
        durationMin: Number(durationMin.toFixed(2)),
        sets,
        reps,
        secPerRep,
        restBetweenSetsSec,
        setupSec: null,
        minSessionMin,
        intensity,
        metRowId: resolution.best.rowId,
        metActivity: resolution.best.activity,
        metValue: Number(resolution.best.metValue.toFixed(2)),
        caloriesGross,
        caloriesActive,
        datasetVersion: resolution.datasetVersion,
        resolverVersion: resolution.resolverVersion,
        mappingSource: resolution.shouldConfirm ? "auto-needs-review" : "auto",
        loggedAt: existingEntry?.loggedAt ?? new Date().toISOString(),
      };

      await upsertLoggedWorkoutEntryPartial(user.uid, selectedDateKey, entry);

      setEntries((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === entry.id);
        const next = [...prev];
        if (existingIndex >= 0) {
          next[existingIndex] = entry;
        } else {
          next.push(entry);
        }
        return next.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
      });

      void upsertWorkoutMetMappingPartial(user.uid, {
        exerciseId: selectedWorkout.id,
        workoutName: selectedWorkout.name,
        intensity,
        metRowId: resolution.best.rowId,
        metActivity: resolution.best.activity,
        metValue: Number(resolution.best.metValue.toFixed(2)),
        score: Number(resolution.best.score.toFixed(4)),
        datasetVersion: resolution.datasetVersion,
        resolverVersion: resolution.resolverVersion,
        mappingSource: resolution.shouldConfirm ? "auto-needs-review" : "auto",
      }).catch(() => {});

      const isEditing = Boolean(existingEntry);
      setEditingEntryId(null);
      setIsModalVisible(false);

      if (caloriesActive > 0) {
        showAlert({
          title: isEditing ? "Workout updated" : "Workout added",
          message: "Saved to daily workouts. Estimated active calories: " + String(Math.round(caloriesActive)) + " kcal.",
        });
      } else {
        showAlert({
          title: isEditing ? "Workout updated" : "Workout added",
          message: "Saved to daily workouts.",
        });
      }
    } catch (error) {
      showAlert({
        title: "Could not add workout",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    } finally {
      setIsSavingWorkout(false);
    }
  };

  const modalController: WorkoutSearchModalController = {
    state: {
      visible: isModalVisible,
      isSaving: isSavingWorkout,
      search: {
        query: searchQuery,
        isSearching,
        hasSearched: hasSearchedWorkouts,
        results: searchResults,
        selectedWorkoutId,
        workoutMode,
        detectedType: detectedWorkoutType,
        detectedHint: detectedWorkoutHint,
        durationMinLabel,
        setsLabel,
        repsLabel,
        secPerRepLabel,
        restBetweenSetsSecLabel,
        minSessionMinLabel,
        intensity,
      },
      modalTitle: editingEntryId ? "Update workout" : "Add workout",
      submitLabel: editingEntryId ? "Update Workout" : "Add Workout",
    },
    actions: {
      setSearchQuery: handleSearchQueryChange,
      handleSearchWorkouts,
      setSelectedWorkoutId: handleSelectWorkoutId,
      setDurationMinLabel,
      setSetsLabel,
      setRepsLabel,
      setSecPerRepLabel,
      setRestBetweenSetsSecLabel,
      setMinSessionMinLabel,
      setIntensity,
      handleSaveWorkout,
      onClose: closeModal,
    },
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
                <Text style={styles.title}>Workout</Text>
                <Text style={styles.subtitle}>Daily workout log</Text>
              </View>

              <Pressable
                style={styles.heroActionButton}
                onPress={() => setIsFormCheckVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Open form check camera"
              >
                <Camera size={20} color={appTheme.colors.primary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={styles.datePickerBlock}>
              <Pressable
                style={styles.datePickerTrigger}
                onPress={() => setIsDatePickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={"Change workout date. Current " + formatDateForDisplay(selectedDateKey)}
              >
                <View style={styles.datePickerLeft}>
                  <CalendarDays size={16} color={appTheme.colors.primary} strokeWidth={2.2} />
                  <Text style={styles.datePickerValue}>{formatDateForDisplay(selectedDateKey)}</Text>
                </View>
                <ChevronDown size={16} color={appTheme.colors.primary} strokeWidth={2.2} />
              </Pressable>
            </View>
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Daily totals</Text>

            <View style={styles.totalsGrid}>
              <View style={styles.totalItem}>
                <Text style={styles.totalValue}>{dailyWorkoutCaloriesBurned} kcal</Text>
                <Text style={styles.totalLabel}>Calories burned</Text>
              </View>

              <View style={[styles.totalItem, styles.totalItemDivider]}>
                <Text style={styles.totalValue}>{entries.length}</Text>
                <Text style={styles.totalLabel}>Workouts</Text>
              </View>

              <View style={[styles.totalItem, styles.totalItemDivider]}>
                <Text style={styles.totalValue}>{Math.round(totalWorkoutDurationMin)} min</Text>
                <Text style={styles.totalLabel}>Duration</Text>
              </View>
            </View>
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <View style={styles.mealHeaderRow}>
              <Text style={styles.sectionTitle}>
                Workouts on {formatDateOptionalLabel(selectedDateKey, todayKey)}
              </Text>

              {canEditSelectedDate ? (
                <Pressable
                  style={styles.addMealButton}
                  onPress={openAddModal}
                  accessibilityRole="button"
                  accessibilityLabel="Add workout"
                >
                  <Plus size={18} color={appTheme.colors.onPrimary} strokeWidth={2.4} />
                  <Text style={styles.addMealText}>Add</Text>
                </Pressable>
              ) : null}
            </View>

            {!user?.uid ? (
              <Text style={styles.emptyText}>Sign in to view and add workouts.</Text>
            ) : isLoadingLog ? (
              <Text style={styles.emptyText}>Loading workouts...</Text>
            ) : entries.length === 0 ? (
              <Text style={styles.emptyText}>No workouts logged for this day.</Text>
            ) : (
              <View style={styles.entriesList}>
                {entries.map((entry) => (
                  <Pressable
                    key={entry.id}
                    style={styles.entryRow}
                    onPress={() => openEntryDetail(entry)}
                    accessibilityRole="button"
                    accessibilityLabel={"View " + entry.workoutName + " details"}
                  >
                    <View style={styles.entryLeft}>
                      <Text style={styles.entryName}>{entry.workoutName}</Text>
                      <Text style={styles.entryMeta}>
                        {entry.workoutMode === "strength"
                          ? "Sets " + String(entry.sets ?? "--") + " • Reps " + String(entry.reps ?? "--")
                          : "Duration " + formatDuration(entry.durationMin) + " min"}
                        {" • "}
                        {entry.intensity.charAt(0).toUpperCase() + entry.intensity.slice(1)}
                      </Text>
                    </View>

                    <View style={styles.entryRight}>
                      <Text style={styles.entryCalories}>
                        {entry.caloriesActive > 0
                          ? String(Math.round(entry.caloriesActive)) + " kcal"
                          : "--"}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </AppCard>
        </View>
      </ScrollView>

      <WorkoutSearchModal controller={modalController} />

      <WorkoutFormCheckModal
        visible={isFormCheckVisible}
        onClose={() => setIsFormCheckVisible(false)}
      />

      <WorkoutEntryDetailModal
        visible={isEntryDetailVisible}
        entry={selectedEntry}
        isBusy={isSavingWorkout}
        canEdit={canEditSelectedDate}
        onClose={closeEntryDetail}
        onUpdateEntry={handleEditSelectedEntry}
        onDeleteEntry={handleDeleteSelectedEntry}
      />

      <DatePickerModal
        visible={isDatePickerVisible}
        selectedDateKey={selectedDateKey}
        onSelectDate={setSelectedDateKey}
        onClose={() => setIsDatePickerVisible(false)}
      />
    </SafeAreaView>
  );
}
