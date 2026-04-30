import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { Minus, Plus, X } from "lucide-react-native";
import AppButton from "../components/ui/AppButton";
import AppTextField from "../components/ui/AppTextField";
import { appTheme } from "../theme/designSystem";
import { styles } from "./NutritionScreen.styles";
import type { FoodCatalogItem, MealType } from "../services/nutritionApi";

type EntryMode = "search" | "manual";

type NutritionSearchState = {
    query: string;
    isSearching: boolean;
    results: FoodCatalogItem[];
    selectedFoodId: string | null;
    servingGramsOverride: string;
    servingMlOverride: string;
};

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

type NutritionScreenModalState = {
    visible: boolean;
    isSaving: boolean;
    selectedMeal: MealType;
    entryMode: EntryMode;
    search: NutritionSearchState;
    manual: NutritionManualState;
    quantityLabel: string;
    modalTitle?: string;
    submitLabel?: string;
};

type NutritionScreenModalActions = {
    setEntryMode: (mode: EntryMode) => void;
    setSearchQuery: (value: string) => void;
    handleSearchFoods: () => void;
    setSelectedFoodId: (id: string | null) => void;
    setServingGramsOverride: (value: string) => void;
    setServingMlOverride: (value: string) => void;
    setManualName: (value: string) => void;
    setManualCalories: (value: string) => void;
    setManualProtein: (value: string) => void;
    setManualCarbs: (value: string) => void;
    setManualFat: (value: string) => void;
    setManualFiber: (value: string) => void;
    setManualSodiumMg: (value: string) => void;
    setManualPotassiumMg: (value: string) => void;
    setManualCalciumMg: (value: string) => void;
    setManualIronMg: (value: string) => void;
    setManualVitaminCMg: (value: string) => void;
    setQuantityLabel: (value: string) => void;
    onQuantityBlur: () => void;
    decreaseQuantity: () => void;
    increaseQuantity: () => void;
    handleAddEntry: () => void;
    onClose: () => void;
};

export type NutritionScreenModalController = {
    state: NutritionScreenModalState;
    actions: NutritionScreenModalActions;
};

type NutritionScreenModalProps = {
    controller: NutritionScreenModalController;
};

const MEAL_LABELS: Record<MealType, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snacks: "Snacks",
};

function roundOne(value: number) {
    return Math.round(value * 10) / 10;
}

function formatServingInfo(item: FoodCatalogItem) {
    if (item.servingSizeMl && item.servingSizeMl > 0) {
        return `Serving: ${roundOne(item.servingSizeMl)} ml`;
    }

    if (item.servingSizeGrams && item.servingSizeGrams > 0) {
        return `Serving: ${roundOne(item.servingSizeGrams)} g`;
    }

    if (item.servingText) {
        return `Serving: ${item.servingText}`;
    }

    return "";
}

export default function NutritionScreenModal({ controller }: NutritionScreenModalProps) {
    const { state, actions } = controller;

    const {
        visible,
        isSaving,
        selectedMeal,
        entryMode,
        search,
        manual,
        quantityLabel,
        modalTitle,
        submitLabel,
    } = state;

    const selectedFood = search.results.find((item) => item.id === search.selectedFoodId) ?? null;
    const quantityNumber = Number(quantityLabel);
    const quantityValue = Number.isFinite(quantityNumber) && quantityNumber > 0 ? quantityNumber : 1;
    const basisUnit = selectedFood?.nutrientBasis === "100ml" ? "ml" : "g";
    const servingValueText = basisUnit === "ml" ? search.servingMlOverride : search.servingGramsOverride;
    const servingValue = Number(servingValueText);
    const servingPerQuantity = Number.isFinite(servingValue) && servingValue > 0 ? servingValue : 100;
    const estimatedTotalAmount = roundOne(servingPerQuantity * quantityValue);

    return (
        <Modal
            transparent
            animationType="fade"
            visible={visible}
            onRequestClose={() => {
                if (!isSaving) {
                    actions.onClose();
                }
            }}
        >
            <View style={styles.modalOverlay}>
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => {
                        if (!isSaving) {
                            actions.onClose();
                        }
                    }}
                />

                <View style={styles.modalCard}>
                    <ScrollView
                        contentContainerStyle={styles.modalContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: appTheme.spacing.md,
                            }}
                        >
                            <Text style={styles.modalTitle}>{modalTitle ?? "Add food entry"}</Text>

                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Close modal"
                                disabled={isSaving}
                                onPress={actions.onClose}
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
                        <Text style={styles.hintText}>Meal: {MEAL_LABELS[selectedMeal]}</Text>

                        <Text style={styles.fieldLabel}>Entry type</Text>
                        <View style={styles.modeRow}>
                            <Pressable
                                style={[styles.modeButton, entryMode === "search" && styles.modeButtonActive]}
                                onPress={() => actions.setEntryMode("search")}
                            >
                                <Text
                                    style={[
                                        styles.modeButtonText,
                                        entryMode === "search" && styles.modeButtonTextActive,
                                    ]}
                                >
                                    Search
                                </Text>
                            </Pressable>

                            <Pressable
                                style={[styles.modeButton, entryMode === "manual" && styles.modeButtonActive]}
                                onPress={() => actions.setEntryMode("manual")}
                            >
                                <Text
                                    style={[
                                        styles.modeButtonText,
                                        entryMode === "manual" && styles.modeButtonTextActive,
                                    ]}
                                >
                                    Manual
                                </Text>
                            </Pressable>
                        </View>

                        {entryMode === "search" ? (
                            <View style={styles.block}>
                                <AppTextField
                                    label="Food search"
                                    placeholder="Example: chicken breast, oats, paneer"
                                    value={search.query}
                                    onChangeText={actions.setSearchQuery}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />

                                <View style={styles.searchButtonWrap}>
                                    <AppButton
                                        title={search.isSearching ? "Searching..." : "Search Food"}
                                        onPress={actions.handleSearchFoods}
                                        loading={search.isSearching}
                                    />
                                </View>

                                {search.results.length > 0 ? (
                                    <View style={styles.searchResultsWrap}>
                                        {search.results.map((item) => {
                                            const active = item.id === search.selectedFoodId;
                                            return (
                                                <Pressable
                                                    key={item.id}
                                                    style={[styles.resultRow, active && styles.resultRowActive]}
                                                    onPress={() => actions.setSelectedFoodId(item.id)}
                                                >
                                                    <View style={styles.resultLeft}>
                                                        <Text style={styles.resultTitle}>{item.name}</Text>
                                                        <Text style={styles.resultMeta}>{item.brand ? item.brand : ""}</Text>
                                                        <Text style={styles.resultMeta}>{formatServingInfo(item)}</Text>
                                                    </View>

                                                    <View style={styles.resultRight}>
                                                        <Text style={styles.resultCalories}>
                                                            {Math.round(item.caloriesPer100g)} kcal / 100 {item.nutrientBasis === "100ml" ? "ml" : "g"}
                                                        </Text>
                                                        <Text style={styles.resultMacros}>
                                                            P {roundOne(item.proteinPer100g)} • C {roundOne(item.carbsPer100g)} • F {roundOne(item.fatPer100g)} • Fi {roundOne(item.fiberPer100g)} / 100 {item.nutrientBasis === "100ml" ? "ml" : "g"}
                                                        </Text>
                                                        <Text style={styles.resultMeta}>
                                                            Na {roundOne(item.sodiumMgPer100g)} mg • K {roundOne(item.potassiumMgPer100g)} mg • Ca {roundOne(item.calciumMgPer100g)} mg
                                                        </Text>
                                                        <Text style={styles.resultMeta}>
                                                            Fe {roundOne(item.ironMgPer100g)} mg • Vit C {roundOne(item.vitaminCMgPer100g)} mg
                                                        </Text>
                                                    </View>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                ) : null}

                                <AppTextField
                                    label={basisUnit === "ml" ? "Serving volume used for 1 quantity (ml)" : "Serving grams used for 1 quantity (g)"}
                                    placeholder="100"
                                    value={basisUnit === "ml" ? search.servingMlOverride : search.servingGramsOverride}
                                    onChangeText={basisUnit === "ml" ? actions.setServingMlOverride : actions.setServingGramsOverride}
                                    keyboardType="decimal-pad"
                                />
                                <Text style={styles.hintText}>
                                    {selectedFood
                                        ? quantityLabel +
                                        " serving" +
                                        (quantityValue > 1 ? "s" : "") +
                                        " at " +
                                        roundOne(servingPerQuantity) +
                                        " " +
                                        basisUnit +
                                        " per serving = " +
                                        estimatedTotalAmount +
                                        " " +
                                        basisUnit
                                        : "Select a food result to see estimated amount for your selected quantity."}
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.block}>
                                <AppTextField
                                    label="Food name"
                                    placeholder="Example: Homemade dal khichdi"
                                    value={manual.name}
                                    onChangeText={actions.setManualName}
                                />

                                <AppTextField
                                    label="Calories per serving"
                                    placeholder="Example: 280"
                                    value={manual.calories}
                                    onChangeText={actions.setManualCalories}
                                    keyboardType="decimal-pad"
                                />

                                <View style={styles.manualRow}>
                                    <View style={styles.manualCell}>
                                        <AppTextField
                                            label="Protein (g)"
                                            placeholder="12"
                                            value={manual.protein}
                                            onChangeText={actions.setManualProtein}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                    <View style={styles.manualCell}>
                                        <AppTextField
                                            label="Carbs (g)"
                                            placeholder="34"
                                            value={manual.carbs}
                                            onChangeText={actions.setManualCarbs}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                </View>

                                <AppTextField
                                    label="Fat (g)"
                                    placeholder="8"
                                    value={manual.fat}
                                    onChangeText={actions.setManualFat}
                                    keyboardType="decimal-pad"
                                />
                                <View style={styles.manualRow}>
                                    <View style={styles.manualCell}>
                                        <AppTextField
                                            label="Fibre (g)"
                                            placeholder="6"
                                            value={manual.fiber}
                                            onChangeText={actions.setManualFiber}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                    <View style={styles.manualCell}>
                                        <AppTextField
                                            label="Sodium (mg)"
                                            placeholder="320"
                                            value={manual.sodiumMg}
                                            onChangeText={actions.setManualSodiumMg}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                </View>

                                <View style={styles.manualRow}>
                                    <View style={styles.manualCell}>
                                        <AppTextField
                                            label="Potassium (mg)"
                                            placeholder="450"
                                            value={manual.potassiumMg}
                                            onChangeText={actions.setManualPotassiumMg}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                    <View style={styles.manualCell}>
                                        <AppTextField
                                            label="Calcium (mg)"
                                            placeholder="120"
                                            value={manual.calciumMg}
                                            onChangeText={actions.setManualCalciumMg}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                </View>

                                <View style={styles.manualRow}>
                                    <View style={styles.manualCell}>
                                        <AppTextField
                                            label="Iron (mg)"
                                            placeholder="2.4"
                                            value={manual.ironMg}
                                            onChangeText={actions.setManualIronMg}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                    <View style={styles.manualCell}>
                                        <AppTextField
                                            label="Vitamin C (mg)"
                                            placeholder="18"
                                            value={manual.vitaminCMg}
                                            onChangeText={actions.setManualVitaminCMg}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                </View>
                            </View>
                        )}

                        <Text style={styles.fieldLabel}>Quantity (servings)</Text>
                        <View style={styles.quantityRow}>
                            <Pressable style={styles.quantityButton} onPress={actions.decreaseQuantity}>
                                <Minus size={16} color={appTheme.colors.text} strokeWidth={2.4} />
                            </Pressable>
                            <TextInput
                                style={styles.quantityValue}
                                placeholder="1"
                                value={quantityLabel}
                                onChangeText={actions.setQuantityLabel}
                                onBlur={actions.onQuantityBlur}
                                keyboardType="decimal-pad"
                            />
                            <Pressable style={styles.quantityButton} onPress={actions.increaseQuantity}>
                                <Plus size={16} color={appTheme.colors.text} strokeWidth={2.4} />
                            </Pressable>
                        </View>

                        <Text style={styles.hintText}>
                            {selectedFood
                                ? `${quantityLabel} serving${quantityValue > 1 ? "s" : ""} at ${roundOne(servingPerQuantity)} ${basisUnit} per serving = ${estimatedTotalAmount} ${basisUnit}`
                                : "Select a food result to see estimated amount for your selected quantity."}
                        </Text>

                        <View style={styles.modalActions}>
                            <AppButton
                                title={submitLabel ?? "Add Entry"}
                                onPress={actions.handleAddEntry}
                                loading={isSaving}
                                disabled={isSaving}
                            />
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}