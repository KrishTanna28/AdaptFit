import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Barcode, Camera, CalendarDays, ChevronDown, Plus } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import NutritionScreenModal, {
  type NutritionScreenModalController,
} from "./NutritionScreenModal";

import AppCard from "../components/ui/AppCard";
import {
  getUserFriendlyErrorMessage,
  useAppAlert,
} from "../components/ui/AppAlert";
import { useAuthUser } from "../hooks/useAuthUser";
import {
  analyzePlateFoodImage,
  getFoodByBarcode,
  searchFoodCatalog,
  type FoodCatalogItem,
  type MealType,
  type PlateFoodAnalysisResult,
} from "../services/nutritionApi";
import {
  loadDailyNutritionLog,
  upsertLoggedFoodEntry,
  deleteLoggedFoodEntry,
  type LoggedFoodEntry,
} from "../services/nutritionLog";
import { appTheme } from "../theme/designSystem";
import { globalStyles } from "../theme/globalStyles";
import { styles } from "./NutritionScreen.styles";
import NutritionEntryDetailModal from "./NutritionEntryDetailModal";
import { getTodayDateKey } from "../services/helperFunctions"
import DatePickerModal from "./DatePickerModal";
import BarcodeFoodScannerModal from "./BarcodeFoodScannerModal";
import PlateFoodCaptureModal from "./PlateFoodCaptureModal";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snacks"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 20;
const QUANTITY_STEP = 0.25;

type EntryMode = "search" | "manual";

type NutritionManualState = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sodiumMg: string;
  potassiumMg: string;
  calciumMg: string;
  ironMg: string;
  vitaminCMg: string;
};

type NutritionSearchState = {
  query: string;
  isSearching: boolean;
  results: FoodCatalogItem[];
  selectedFoodId: string | null;
  servingGramsOverride: string;
  servingMlOverride: string;
};

type NutritionModalDraftState = {
  isModalVisible: boolean;
  selectedMeal: MealType;
  entryMode: EntryMode;
  quantity: number;
  quantityInput: string;
  editingEntryId: string | null;
  search: NutritionSearchState;
  manual: NutritionManualState;
};

type PlateCaptureDraft = {
  visible: boolean;
  meal: MealType;
  imageUri: string;
  imageBase64: string;
  mimeType: string;
  totalWeightLabel: string;
  isAnalyzing: boolean;
};

type BarcodeScannerDraft = {
  visible: boolean;
  meal: MealType;
  isResolving: boolean;
};

const initialNutritionSearchState: NutritionSearchState = {
  query: "",
  isSearching: false,
  results: [],
  selectedFoodId: null,
  servingGramsOverride: "",
  servingMlOverride: "",
};

const initialNutritionManualState: NutritionManualState = {
  name: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  sodiumMg: "",
  potassiumMg: "",
  calciumMg: "",
  ironMg: "",
  vitaminCMg: "",
};

const initialNutritionModalDraftState: NutritionModalDraftState = {
  isModalVisible: false,
  selectedMeal: "breakfast",
  entryMode: "search",
  quantity: 1,
  quantityInput: "1",
  editingEntryId: null,
  search: initialNutritionSearchState,
  manual: initialNutritionManualState,
};

const initialPlateCaptureDraft: PlateCaptureDraft = {
  visible: false,
  meal: "breakfast",
  imageUri: "",
  imageBase64: "",
  mimeType: "image/jpeg",
  totalWeightLabel: "",
  isAnalyzing: false,
};

const initialBarcodeScannerDraft: BarcodeScannerDraft = {
  visible: false,
  meal: "breakfast",
  isResolving: false,
};

type NutritionModalDraftAction =
  | { type: "OPEN_ADD"; meal: MealType }
  | {
    type: "OPEN_PLATE_MANUAL";
    payload: {
      selectedMeal: MealType;
      manual: NutritionManualState;
      quantity?: number;
      quantityInput?: string;
    };
  }
  | {
    type: "OPEN_CATALOG_ITEM";
    payload: {
      selectedMeal: MealType;
      item: FoodCatalogItem;
    };
  }
  | {
    type: "OPEN_EDIT_MANUAL";
    payload: {
      editingEntryId: string;
      selectedMeal: MealType;
      quantity: number;
      quantityInput: string;
      manual: NutritionManualState;
    };
  }
  | { type: "CLOSE_MODAL" }
  | { type: "SET_ENTRY_MODE"; value: EntryMode }
  | { type: "SET_SEARCH_QUERY"; value: string }
  | { type: "SET_IS_SEARCHING"; value: boolean }
  | { type: "SET_SEARCH_RESULTS"; value: FoodCatalogItem[] }
  | { type: "SET_SELECTED_FOOD_ID"; value: string | null }
  | { type: "SET_SERVING_GRAMS_OVERRIDE"; value: string }
  | { type: "SET_SERVING_ML_OVERRIDE"; value: string }
  | { type: "SET_MANUAL_FIELD"; field: keyof NutritionManualState; value: string }
  | { type: "SET_QUANTITY"; value: number }
  | { type: "SET_QUANTITY_INPUT"; value: string };

function nutritionModalDraftReducer(
  state: NutritionModalDraftState,
  action: NutritionModalDraftAction,
): NutritionModalDraftState {
  switch (action.type) {
    case "OPEN_ADD":
      return {
        ...initialNutritionModalDraftState,
        isModalVisible: true,
        selectedMeal: action.meal,
      };
    case "OPEN_PLATE_MANUAL":
      return {
        ...initialNutritionModalDraftState,
        isModalVisible: true,
        selectedMeal: action.payload.selectedMeal,
        entryMode: "manual",
        quantity: action.payload.quantity ?? 1,
        quantityInput: action.payload.quantityInput ?? "1",
        manual: { ...action.payload.manual },
      };
    case "OPEN_CATALOG_ITEM":
      return {
        ...initialNutritionModalDraftState,
        isModalVisible: true,
        selectedMeal: action.payload.selectedMeal,
        entryMode: "search",
        search: {
          ...initialNutritionSearchState,
          query: action.payload.item.name,
          results: [action.payload.item],
          selectedFoodId: action.payload.item.id,
        },
      };
    case "OPEN_EDIT_MANUAL":
      return {
        ...state,
        isModalVisible: true,
        selectedMeal: action.payload.selectedMeal,
        entryMode: "manual",
        quantity: action.payload.quantity,
        quantityInput: action.payload.quantityInput,
        editingEntryId: action.payload.editingEntryId,
        search: { ...initialNutritionSearchState },
        manual: { ...action.payload.manual },
      };
    case "CLOSE_MODAL":
      return {
        ...state,
        isModalVisible: false,
        editingEntryId: null,
      };
    case "SET_ENTRY_MODE":
      return { ...state, entryMode: action.value };
    case "SET_SEARCH_QUERY":
      return { ...state, search: { ...state.search, query: action.value } };
    case "SET_IS_SEARCHING":
      return { ...state, search: { ...state.search, isSearching: action.value } };
    case "SET_SEARCH_RESULTS":
      return { ...state, search: { ...state.search, results: action.value } };
    case "SET_SELECTED_FOOD_ID":
      return { ...state, search: { ...state.search, selectedFoodId: action.value } };
    case "SET_SERVING_GRAMS_OVERRIDE":
      return { ...state, search: { ...state.search, servingGramsOverride: action.value } };
    case "SET_SERVING_ML_OVERRIDE":
      return { ...state, search: { ...state.search, servingMlOverride: action.value } };
    case "SET_MANUAL_FIELD":
      return {
        ...state,
        manual: {
          ...state.manual,
          [action.field]: action.value,
        },
      };
    case "SET_QUANTITY":
      return { ...state, quantity: action.value };
    case "SET_QUANTITY_INPUT":
      return { ...state, quantityInput: action.value };
    default:
      return state;
  }
}

function clampQuantity(value: number) {
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, value));
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function formatManualNumber(value: number) {
  return formatQuantity(roundOne(Number.isFinite(value) ? value : 0));
}

function getPlateAnalysisErrorMessage(error: unknown) {
  const mapped = getUserFriendlyErrorMessage(error, "").trim();
  if (mapped) {
    return mapped;
  }

  const detail = error instanceof Error ? error.message.trim() : "";
  return detail || "Check that the plate-analysis service is running and try again.";
}

function buildPlateManualState(result: PlateFoodAnalysisResult): NutritionManualState {
  const names = result.items
    .map((item) => {
      const label = item.displayName || item.label;
      if (!label) return "";
      const grams = item.estimatedWeightGrams > 0
        ? " " + formatQuantity(roundOne(item.estimatedWeightGrams)) + "g"
        : "";
      return label + grams;
    })
    .filter(Boolean);
  const displayNames = names.slice(0, 4).join(", ");
  const extraCount = Math.max(0, names.length - 4);
  const suffix = extraCount > 0 ? " +" + String(extraCount) + " more" : "";

  return {
    name: displayNames ? "Plate: " + displayNames + suffix : "Plate scan",
    calories: formatManualNumber(result.totals.calories),
    protein: formatManualNumber(result.totals.protein),
    carbs: formatManualNumber(result.totals.carbs),
    fat: formatManualNumber(result.totals.fat),
    fiber: formatManualNumber(result.totals.fiber),
    sodiumMg: formatManualNumber(result.totals.sodiumMg),
    potassiumMg: formatManualNumber(result.totals.potassiumMg),
    calciumMg: formatManualNumber(result.totals.calciumMg),
    ironMg: formatManualNumber(result.totals.ironMg),
    vitaminCMg: formatManualNumber(result.totals.vitaminCMg),
  };
}

function perServing(total: number, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return total;
  }
  return total / quantity;
}

function parseDateKey(dateKey: string) {
  const parts = dateKey.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getCurrentWeekRange(now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function formatDateOptionalLabel(dateKey: string, todayKey: string) {
  if (dateKey === todayKey)
    return "Today";
  const d = parseDateKey(dateKey);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  })
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

export default function NutritionScreen() {
  const { showAlert } = useAppAlert();
  const { user, loading: authLoading } = useAuthUser();
  const todayKey = getTodayDateKey();
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const weekRange = useMemo(() => {
    const range = getCurrentWeekRange();
    return {
      startKey: getTodayDateKey(range.monday),
      endKey: getTodayDateKey(range.sunday)
    }
  }, [todayKey])

  const canEditSelectedDate = selectedDateKey >= weekRange.startKey && selectedDateKey <= weekRange.endKey;

  const [entries, setEntries] = useState<LoggedFoodEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingLog, setIsLoadingLog] = useState(true);
  const [isMigratingLogs, setIsMigratingLogs] = useState(false);
  const migrationAttemptedForUidRef = useRef<string | null>(null);

  const [modalDraft, dispatchModalDraft] = useReducer(
    nutritionModalDraftReducer,
    initialNutritionModalDraftState,
  );
  const [plateDraft, setPlateDraft] = useState<PlateCaptureDraft>(initialPlateCaptureDraft);
  const [barcodeDraft, setBarcodeDraft] = useState<BarcodeScannerDraft>(initialBarcodeScannerDraft);

  const {
    isModalVisible,
    selectedMeal,
    entryMode,
    quantity,
    quantityInput,
    editingEntryId,
    search,
    manual,
  } = modalDraft;

  const {
    query: searchQuery,
    isSearching,
    results,
    selectedFoodId,
    servingGramsOverride,
    servingMlOverride,
  } = search;

  const {
    name: manualName,
    calories: manualCalories,
    protein: manualProtein,
    carbs: manualCarbs,
    fat: manualFat,
    fiber: manualFiber,
    sodiumMg: manualSodiumMg,
    potassiumMg: manualPotassiumMg,
    calciumMg: manualCalciumMg,
    ironMg: manualIronMg,
    vitaminCMg: manualVitaminCMg,
  } = manual;

  const setEntryMode = (value: EntryMode) => {
    dispatchModalDraft({ type: "SET_ENTRY_MODE", value });
  };

  const setSearchQuery = (value: string) => {
    dispatchModalDraft({ type: "SET_SEARCH_QUERY", value });
  };

  const setIsSearching = (value: boolean) => {
    dispatchModalDraft({ type: "SET_IS_SEARCHING", value });
  };

  const setResults = (value: FoodCatalogItem[]) => {
    dispatchModalDraft({ type: "SET_SEARCH_RESULTS", value });
  };

  const setSelectedFoodId = (value: string | null) => {
    dispatchModalDraft({ type: "SET_SELECTED_FOOD_ID", value });
  };

  const setServingGramsOverride = (value: string) => {
    dispatchModalDraft({ type: "SET_SERVING_GRAMS_OVERRIDE", value });
  };

  const setServingMlOverride = (value: string) => {
    dispatchModalDraft({ type: "SET_SERVING_ML_OVERRIDE", value });
  };

  const setManualField = (field: keyof NutritionManualState, value: string) => {
    dispatchModalDraft({ type: "SET_MANUAL_FIELD", field, value });
  };

  const setManualName = (value: string) => setManualField("name", value);
  const setManualCalories = (value: string) => setManualField("calories", value);
  const setManualProtein = (value: string) => setManualField("protein", value);
  const setManualCarbs = (value: string) => setManualField("carbs", value);
  const setManualFat = (value: string) => setManualField("fat", value);
  const setManualFiber = (value: string) => setManualField("fiber", value);
  const setManualSodiumMg = (value: string) => setManualField("sodiumMg", value);
  const setManualPotassiumMg = (value: string) => setManualField("potassiumMg", value);
  const setManualCalciumMg = (value: string) => setManualField("calciumMg", value);
  const setManualIronMg = (value: string) => setManualField("ironMg", value);
  const setManualVitaminCMg = (value: string) => setManualField("vitaminCMg", value);

  const setQuantity = (value: number) => {
    dispatchModalDraft({ type: "SET_QUANTITY", value });
  };

  const setQuantityInput = (value: string) => {
    dispatchModalDraft({ type: "SET_QUANTITY_INPUT", value });
  };

  const [selectedEntry, setSelectedEntry] = useState<LoggedFoodEntry | null>(null);
  const [isEntryDetailVisible, setIsEntryDetailVisible] = useState(false);

  const openEntryDetail = (entry: LoggedFoodEntry) => {
    setSelectedEntry(entry);
    setIsEntryDetailVisible(true);
  }

  const closeEntryDetail = () => {
    setIsEntryDetailVisible(false);
    setSelectedEntry(null);
  }

  const handleEditSelectedEntry = () => {
    if (!ensureEditableDate()) return;
    if (!selectedEntry) return;

    const qty = clampQuantity(selectedEntry.quantity);

    dispatchModalDraft({
      type: "OPEN_EDIT_MANUAL",
      payload: {
        editingEntryId: selectedEntry.id,
        selectedMeal: selectedEntry.mealType,
        quantity: qty,
        quantityInput: formatQuantity(qty),
        manual: {
          name: selectedEntry.name,
          calories: formatQuantity(roundOne(perServing(selectedEntry.calories, qty))),
          protein: formatQuantity(roundOne(perServing(selectedEntry.protein, qty))),
          carbs: formatQuantity(roundOne(perServing(selectedEntry.carbs, qty))),
          fat: formatQuantity(roundOne(perServing(selectedEntry.fat, qty))),
          fiber: formatQuantity(roundOne(perServing(selectedEntry.fiber, qty))),
          sodiumMg: formatQuantity(roundOne(perServing(selectedEntry.sodiumMg, qty))),
          potassiumMg: formatQuantity(roundOne(perServing(selectedEntry.potassiumMg, qty))),
          calciumMg: formatQuantity(roundOne(perServing(selectedEntry.calciumMg, qty))),
          ironMg: formatQuantity(roundOne(perServing(selectedEntry.ironMg, qty))),
          vitaminCMg: formatQuantity(roundOne(perServing(selectedEntry.vitaminCMg, qty))),
        },
      },
    });

    closeEntryDetail();
  };

  const handleDeleteSelectedEntry = () => {
    if (!ensureEditableDate()) return;
    if (!selectedEntry) return;

    const entryToDelete = selectedEntry;

    showAlert({
      title: "Delete entry?",
      message: `Delete ${entryToDelete.name} from ${MEAL_LABELS[entryToDelete.mealType]}?`,
      actions: [
        { label: "Cancel", style: "secondary" },
        {
          label: "Delete", style: "primary", onPress: async () => {
            setIsSaving(true);
            try {
              const uid = requireUserUid();
              await deleteLoggedFoodEntry(uid, selectedDateKey, entryToDelete.id);
              setEntries((prev) => prev.filter((item) => item.id !== entryToDelete.id));
              closeEntryDetail();
            } catch (error) {
              showAlert({
                title: "Could not delete entry",
                message: getUserFriendlyErrorMessage(
                  error,
                  "Please try again in a moment.",
                ),
              });
            } finally {
              setIsSaving(false);
            }
          }
        }
      ]
    })
  }

  const ensureEditableDate = () => {
    if (canEditSelectedDate) return true;
    showAlert({
      title: "Week locked",
      message: "You can edit only logs from Monday to Sunday of the current week.",
    });
    return false;
  };

  const requireUserUid = () => {
    if (!user?.uid) {
      throw new Error("You must be signed in to log meals.");
    }
    return user.uid;
  };
  
  useEffect(() => {
    let mounted = true;

    const loadLog = async () => {
      if (!user?.uid) {
        if (mounted) {
          setEntries([]);
          setIsLoadingLog(false);
        }
        return;
      }

      if (isMigratingLogs) {
        if (mounted) {
          setIsLoadingLog(true);
        }
        return;
      }

      setIsLoadingLog(true);

      try {
        const log = await loadDailyNutritionLog(user.uid, selectedDateKey);
        if (mounted) {
          setEntries(log.entries);
        }
      } catch (error) {
        if (mounted) {
          showAlert({
            title: "Could not load nutrition log",
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

    loadLog().catch(() => {
      if (mounted) {
        setIsLoadingLog(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [isMigratingLogs, showAlert, selectedDateKey, user?.uid]);

  const selectedFood = useMemo(
    () => results.find((item) => item.id === selectedFoodId) ?? null,
    [results, selectedFoodId],
  );

  useEffect(() => {
    if (!selectedFood) {
      setServingGramsOverride("");
      setServingMlOverride("");
      return;
    }

    if (selectedFood.nutrientBasis === "100ml") {
      const suggestedMl = selectedFood.servingSizeMl ?? 100;
      setServingMlOverride(formatQuantity(roundOne(suggestedMl)));
      setServingGramsOverride("");
      return;
    }

    const suggestedGrams = selectedFood.servingSizeGrams ?? 100;
    setServingGramsOverride(formatQuantity(roundOne(suggestedGrams)));
    setServingMlOverride("");
  }, [selectedFood]);

  const groupedEntries = useMemo(() => {
    return MEAL_ORDER.reduce<Record<MealType, LoggedFoodEntry[]>>((acc, meal) => {
      acc[meal] = entries.filter((entry) => entry.mealType === meal);
      return acc;
    }, {
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: [],
    });
  }, [entries]);

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.calories += entry.calories;
        acc.protein += entry.protein;
        acc.carbs += entry.carbs;
        acc.fat += entry.fat;
        acc.fiber += entry.fiber;
        acc.sodiumMg += entry.sodiumMg;
        acc.potassiumMg += entry.potassiumMg;
        acc.calciumMg += entry.calciumMg;
        acc.ironMg += entry.ironMg;
        acc.vitaminCMg += entry.vitaminCMg;
        return acc;
      },
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sodiumMg: 0,
        potassiumMg: 0,
        calciumMg: 0,
        ironMg: 0,
        vitaminCMg: 0,
      },
    );
  }, [entries]);

  const openAddModal = (meal: MealType) => {
    if (!ensureEditableDate()) return;
    dispatchModalDraft({ type: "OPEN_ADD", meal });
  };

  const openBarcodeScanner = (meal: MealType) => {
    if (!ensureEditableDate()) return;

    if (!user?.uid) {
      showAlert({
        title: "Sign-in required",
        message: "Please sign in to scan foods.",
      });
      return;
    }

    setBarcodeDraft({
      visible: true,
      meal,
      isResolving: false,
    });
  };

  const closeBarcodeScanner = () => {
    if (barcodeDraft.isResolving) return;
    setBarcodeDraft(initialBarcodeScannerDraft);
  };

  const handleBarcodeScanned = async (barcodeValue: string) => {
    setBarcodeDraft((prev) => ({ ...prev, isResolving: true }));

    try {
      const item = await getFoodByBarcode(barcodeValue);
      dispatchModalDraft({
        type: "OPEN_CATALOG_ITEM",
        payload: {
          selectedMeal: barcodeDraft.meal,
          item,
        },
      });
      setBarcodeDraft(initialBarcodeScannerDraft);
    } catch (error) {
      showAlert({
        title: "Barcode lookup failed",
        message: getUserFriendlyErrorMessage(
          error,
          "No nutrition match found. Try food search or manual entry.",
        ),
      });
      setBarcodeDraft((prev) => ({ ...prev, isResolving: false }));
    }
  };

  const closePlateCaptureModal = () => {
    if (plateDraft.isAnalyzing) return;
    setPlateDraft(initialPlateCaptureDraft);
  };

  const handlePlateWeightInputChange = (raw: string) => {
    setPlateDraft((prev) => ({
      ...prev,
      totalWeightLabel: raw.replace(",", ".").replace(/[^0-9.]/g, ""),
    }));
  };

  const handleCapturePlate = async (meal: MealType) => {
    if (!ensureEditableDate()) return;

    if (!user?.uid) {
      showAlert({
        title: "Sign-in required",
        message: "Please sign in to log meals.",
      });
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      showAlert({
        title: "Camera permission needed",
        message: "Please allow camera access to capture your plate.",
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.75,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset?.base64 || !asset.uri) {
      showAlert({
        title: "Unsupported image",
        message: "We could not process this photo. Please try again.",
      });
      return;
    }

    setPlateDraft({
      visible: true,
      meal,
      imageUri: asset.uri,
      imageBase64: asset.base64,
      mimeType: asset.mimeType ?? "image/jpeg",
      totalWeightLabel: "",
      isAnalyzing: false,
    });
  };

  const handleRetakePlatePhoto = () => {
    if (plateDraft.isAnalyzing) return;
    const meal = plateDraft.meal;
    setPlateDraft(initialPlateCaptureDraft);
    void handleCapturePlate(meal);
  };

  const handleAnalyzePlate = async () => {
    const totalWeightGrams = Number(plateDraft.totalWeightLabel);
    if (!Number.isFinite(totalWeightGrams) || totalWeightGrams <= 0) {
      showAlert({
        title: "Add plate weight",
        message: "Enter the total food weight in grams before analyzing.",
      });
      return;
    }

    if (!plateDraft.imageBase64) {
      showAlert({
        title: "Missing photo",
        message: "Capture a plate photo before analyzing.",
      });
      return;
    }

    setPlateDraft((prev) => ({ ...prev, isAnalyzing: true }));

    try {
      const result = await analyzePlateFoodImage({
        imageBase64: plateDraft.imageBase64,
        mimeType: plateDraft.mimeType,
        totalWeightGrams,
      });

      if (result.items.length === 0) {
        showAlert({
          title: "No foods detected",
          message: "Try another photo with the plate clearly visible.",
        });
        return;
      }

      dispatchModalDraft({
        type: "OPEN_PLATE_MANUAL",
        payload: {
          selectedMeal: plateDraft.meal,
          manual: buildPlateManualState(result),
        },
      });
      setPlateDraft(initialPlateCaptureDraft);
    } catch (error) {
      showAlert({
        title: "Plate analysis failed",
        message: getPlateAnalysisErrorMessage(error),
      });
    } finally {
      setPlateDraft((prev) => (
        prev.visible ? { ...prev, isAnalyzing: false } : prev
      ));
    }
  };

  const handleSearchFoods = async () => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      showAlert({
        title: "Search is too short",
        message: "Please type at least 2 characters.",
      });
      return;
    }

    setIsSearching(true);

    try {
      const data = await searchFoodCatalog({
        query,
        pageSize: 20,
      });

      setResults(data);
      setSelectedFoodId(data[0]?.id ?? null);
    } catch (error) {
      showAlert({
        title: "Search failed",
        message: getUserFriendlyErrorMessage(
          error,
          "Could not fetch foods right now. Try again.",
        ),
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddEntry = async () => {
    if (!ensureEditableDate()) return;
    const existingEntry = editingEntryId ? entries.find((entry) => entry.id === editingEntryId) ?? null : null;
    try {
      let newEntry: LoggedFoodEntry;

      if (entryMode === "search") {
        if (!selectedFood) {
          showAlert({
            title: "No food selected",
            message: "Select one search result before adding.",
          });
          return;
        }
        const isVolumeBased = selectedFood.nutrientBasis === "100ml";
        const overrideValue = Number(isVolumeBased ? servingMlOverride : servingGramsOverride);
        const hasValidOverride = Number.isFinite(overrideValue) && overrideValue > 0;

        const servingSize = hasValidOverride
          ? overrideValue
          : isVolumeBased
            ? (selectedFood.servingSizeMl ?? 100)
            : (selectedFood.servingSizeGrams ?? 100);

        const consumedBaseUnits = servingSize * quantity;

        newEntry = {
          id: existingEntry?.id ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          mealType: selectedMeal,
          name: selectedFood.name,
          source: selectedFood.source,
          quantity: roundOne(quantity),
          unit: "serving",
          calories: roundOne((selectedFood.caloriesPer100g * consumedBaseUnits) / 100),
          protein: roundOne((selectedFood.proteinPer100g * consumedBaseUnits) / 100),
          carbs: roundOne((selectedFood.carbsPer100g * consumedBaseUnits) / 100),
          fat: roundOne((selectedFood.fatPer100g * consumedBaseUnits) / 100),
          fiber: roundOne((selectedFood.fiberPer100g * consumedBaseUnits) / 100),
          sodiumMg: roundOne((selectedFood.sodiumMgPer100g * consumedBaseUnits) / 100),
          potassiumMg: roundOne((selectedFood.potassiumMgPer100g * consumedBaseUnits) / 100),
          calciumMg: roundOne((selectedFood.calciumMgPer100g * consumedBaseUnits) / 100),
          ironMg: roundOne((selectedFood.ironMgPer100g * consumedBaseUnits) / 100),
          vitaminCMg: roundOne((selectedFood.vitaminCMgPer100g * consumedBaseUnits) / 100),
          loggedAt: existingEntry?.loggedAt ?? new Date().toISOString(),
        };
      } else {
        const name = manualName.trim();
        const cals = Number(manualCalories);
        const protein = Number(manualProtein);
        const carbs = Number(manualCarbs);
        const fat = Number(manualFat);
        const fiber = Number(manualFiber);
        const sodiumMg = Number(manualSodiumMg);
        const potassiumMg = Number(manualPotassiumMg);
        const calciumMg = Number(manualCalciumMg);
        const ironMg = Number(manualIronMg);
        const vitaminCMg = Number(manualVitaminCMg);

        if (!name) {
          showAlert({
            title: "Missing food name",
            message: "Please enter the food name for manual entry.",
          });
          return;
        }

        const values = [cals, protein, carbs, fat, fiber, sodiumMg, potassiumMg, calciumMg, ironMg, vitaminCMg];
        if (values.some((value) => !Number.isFinite(value) || value < 0)) {
          showAlert({
            title: "Invalid numbers",
            message: "Calories and macros must be valid non-negative numbers.",
          });
          return;
        }

        newEntry = {
          id: existingEntry?.id ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          mealType: selectedMeal,
          name,
          source: existingEntry?.source ?? "Manual",
          quantity: roundOne(quantity),
          unit: "serving",
          calories: roundOne(cals * quantity),
          protein: roundOne(protein * quantity),
          carbs: roundOne(carbs * quantity),
          fat: roundOne(fat * quantity),
          fiber: roundOne(fiber * quantity),
          sodiumMg: roundOne(sodiumMg * quantity),
          potassiumMg: roundOne(potassiumMg * quantity),
          calciumMg: roundOne(calciumMg * quantity),
          ironMg: roundOne(ironMg * quantity),
          vitaminCMg: roundOne(vitaminCMg * quantity),
          loggedAt: existingEntry?.loggedAt ?? new Date().toISOString(),
        };
      }

      const uid = requireUserUid();

      setIsSaving(true);
      try {
        await upsertLoggedFoodEntry(uid, selectedDateKey, newEntry);

        setEntries((prev) =>
          existingEntry
            ? prev.map((entry) => (entry.id === existingEntry.id ? newEntry : entry))
            : [...prev, newEntry],
        );

        dispatchModalDraft({ type: "CLOSE_MODAL" });
      } finally {
        setIsSaving(false);
      }
    } catch (error) {
      showAlert({
        title: "Could not save entry",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    }
  };

  const handleQuantityInputChange = (raw: string) => {
    const normalized = raw.replace(",", ".").replace(/[^0-9.]/g, "");
    setQuantityInput(normalized);

    if (!normalized || normalized === ".") {
      return;
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      setQuantity(clampQuantity(parsed));
    }
  };

  const commitQuantityInput = () => {
    const parsed = Number(quantityInput);

    if (Number.isFinite(parsed)) {
      const clamped = clampQuantity(parsed);
      setQuantity(clamped);
      setQuantityInput(formatQuantity(clamped));
      return;
    }

    setQuantityInput(formatQuantity(quantity));
  };

  const decreaseQuantity = () => {
    const next = clampQuantity(quantity - QUANTITY_STEP);
    setQuantity(next);
    setQuantityInput(formatQuantity(next));
  };

  const increaseQuantity = () => {
    const next = clampQuantity(quantity + QUANTITY_STEP);
    setQuantity(next);
    setQuantityInput(formatQuantity(next));
  };

  const nutritionModalController: NutritionScreenModalController = {
    state: {
      visible: isModalVisible,
      isSaving,
      selectedMeal,
      entryMode,
      search: {
        query: searchQuery,
        isSearching,
        results,
        selectedFoodId,
        servingGramsOverride,
        servingMlOverride,
      },
      manual: {
        name: manualName,
        calories: manualCalories,
        protein: manualProtein,
        carbs: manualCarbs,
        fat: manualFat,
        fiber: manualFiber,
        sodiumMg: manualSodiumMg,
        potassiumMg: manualPotassiumMg,
        calciumMg: manualCalciumMg,
        ironMg: manualIronMg,
        vitaminCMg: manualVitaminCMg,
      },
      quantityLabel: quantityInput,
      modalTitle: editingEntryId ? "Update food entry" : "Add food entry",
      submitLabel: editingEntryId ? "Update Entry" : "Add Entry",
    },
    actions: {
      setEntryMode,
      setSearchQuery,
      handleSearchFoods,
      setSelectedFoodId,
      setServingGramsOverride,
      setServingMlOverride,
      setManualName,
      setManualCalories,
      setManualProtein,
      setManualCarbs,
      setManualFat,
      setManualFiber,
      setManualSodiumMg,
      setManualPotassiumMg,
      setManualCalciumMg,
      setManualIronMg,
      setManualVitaminCMg,
      setQuantityLabel: handleQuantityInputChange,
      onQuantityBlur: commitQuantityInput,
      decreaseQuantity,
      increaseQuantity,
      handleAddEntry,
      onClose: () => {
        dispatchModalDraft({ type: "CLOSE_MODAL" });
      },
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
                <Text style={styles.title}>Diet / Nutrition</Text>
              </View>
            </View>

            <View style={styles.datePickerBlock}>

              <Pressable
                style={styles.datePickerTrigger}
                onPress={() => setIsDatePickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={
                  "Change nutrition log date. Current " + formatDateForDisplay(selectedDateKey)
                }
                accessibilityHint="Opens date picker"
                hitSlop={8}
              >
                <View style={styles.datePickerLeft}>
                  <CalendarDays size={16} color={appTheme.colors.mutedText} strokeWidth={2.2} />
                  <Text style={styles.datePickerValue}>{formatDateForDisplay(selectedDateKey)}</Text>
                </View>

                <ChevronDown size={16} color={appTheme.colors.mutedText} strokeWidth={2.2} />
              </Pressable>
            </View>
          </AppCard>

          <AppCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Daily totals</Text>

            <View style={styles.macroGrid}>
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{Math.round(totals.calories)} kcal</Text>
                <Text style={styles.macroLabel}>Calories</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{roundOne(totals.protein)} g</Text>
                <Text style={styles.macroLabel}>Protein</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{roundOne(totals.carbs)} g</Text>
                <Text style={styles.macroLabel}>Carbs</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{roundOne(totals.fat)} g</Text>
                <Text style={styles.macroLabel}>Fat</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{roundOne(totals.fiber)} g</Text>
                <Text style={styles.macroLabel}>Fibre</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{Math.round(totals.sodiumMg)} mg</Text>
                <Text style={styles.macroLabel}>Sodium</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{Math.round(totals.potassiumMg)} mg</Text>
                <Text style={styles.macroLabel}>Potassium</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{Math.round(totals.calciumMg)} mg</Text>
                <Text style={styles.macroLabel}>Calcium</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{roundOne(totals.ironMg)} mg</Text>
                <Text style={styles.macroLabel}>Iron</Text>
              </View>

              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{roundOne(totals.vitaminCMg)} mg</Text>
                <Text style={styles.macroLabel}>Vitamin C</Text>
              </View>
            </View>
          </AppCard>

          {MEAL_ORDER.map((meal) => {
            const mealEntries = groupedEntries[meal];

            return (
              <AppCard key={meal} style={styles.sectionCard}>
                <View style={styles.mealHeaderRow}>
                  <Text style={styles.sectionTitle}>{MEAL_LABELS[meal]}</Text>

                  {canEditSelectedDate ? (
                    <View style={styles.mealActionsRow}>
                      <Pressable
                        style={styles.addMealButton}
                        onPress={() => handleCapturePlate(meal)}
                        accessibilityRole="button"
                        accessibilityLabel={`Capture ${MEAL_LABELS[meal]} plate`}
                      >
                        <Camera size={14} color={appTheme.colors.text} strokeWidth={2.4} />
                        <Text style={styles.addMealText}>Photo</Text>
                      </Pressable>

                      <Pressable
                        style={styles.addMealButton}
                        onPress={() => openBarcodeScanner(meal)}
                        accessibilityRole="button"
                        accessibilityLabel={`Scan ${MEAL_LABELS[meal]} barcode`}
                      >
                        <Barcode size={14} color={appTheme.colors.text} strokeWidth={2.4} />
                        <Text style={styles.addMealText}>Scan</Text>
                      </Pressable>

                      <Pressable
                        style={styles.addMealButton}
                        onPress={() => openAddModal(meal)}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${MEAL_LABELS[meal]} entry`}
                      >
                        <Plus size={14} color={appTheme.colors.text} strokeWidth={2.4} />
                        <Text style={styles.addMealText}>Add</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                {mealEntries.length === 0 ? (
                  <Text style={styles.emptyText}>No entries yet.</Text>
                ) : (
                  <View style={styles.entriesList}>
                    {mealEntries.map((entry) => (
                      <Pressable key={entry.id} style={styles.entryRow} onPress={() => openEntryDetail(entry)} accessibilityRole="button" accessibilityLabel={`View ${entry.name} details`}>
                        <View style={styles.entryLeft}>
                          <Text style={styles.entryName}>{entry.name}</Text>
                          <Text style={styles.entryMeta}>
                            {formatQuantity(entry.quantity)} serving
                          </Text>
                        </View>

                        <View style={styles.entryRight}>
                          <Text style={styles.entryCalories}>
                            {Math.round(entry.calories)} kcal
                          </Text>
                          <Text style={styles.entryMacros}>
                            P {roundOne(entry.protein)} • C {roundOne(entry.carbs)} • F {roundOne(entry.fat)} • Fi {roundOne(entry.fiber)}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </AppCard>
            );
          })}

          {authLoading || isLoadingLog ? (
            <AppCard style={styles.sectionCard}>
              <Text style={styles.emptyText}>Loading nutrition log...</Text>
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
      <PlateFoodCaptureModal
        visible={plateDraft.visible}
        imageUri={plateDraft.imageUri}
        totalWeightLabel={plateDraft.totalWeightLabel}
        isAnalyzing={plateDraft.isAnalyzing}
        onChangeTotalWeight={handlePlateWeightInputChange}
        onAnalyze={handleAnalyzePlate}
        onRetake={handleRetakePlatePhoto}
        onClose={closePlateCaptureModal}
      />
      <BarcodeFoodScannerModal
        visible={barcodeDraft.visible}
        isResolving={barcodeDraft.isResolving}
        onBarcode={(value) => {
          void handleBarcodeScanned(value);
        }}
        onClose={closeBarcodeScanner}
      />
      <NutritionScreenModal controller={nutritionModalController} />
      <NutritionEntryDetailModal 
      visible={isEntryDetailVisible} 
      entry={selectedEntry} 
      isBusy={isSaving} 
      canEdit={canEditSelectedDate} 
      onClose={closeEntryDetail} 
      onUpdateEntry={handleEditSelectedEntry} 
      onDeleteEntry={handleDeleteSelectedEntry} />
    </SafeAreaView>
  );
}

