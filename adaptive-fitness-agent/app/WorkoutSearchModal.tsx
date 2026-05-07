import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { appTheme } from "../theme/designSystem";
import AppButton from "../components/ui/AppButton";
import AppTextField from "../components/ui/AppTextField";
import { styles } from "./WorkoutScreen.styles";
import type { WorkoutCatalogItem } from "../services/workoutCatalogSearch";
import type { MetIntensity } from "../services/workoutMetDataset";

export type WorkoutInputMode = "cardio" | "strength" | "sports";
export type WorkoutDetectedType = WorkoutInputMode | "other";

type WorkoutSearchState = {
    query: string;
    isSearching: boolean;
    hasSearched: boolean;
    results: WorkoutCatalogItem[];
    selectedWorkoutId: string | null;
    workoutMode: WorkoutInputMode;
    detectedType: WorkoutDetectedType;
    detectedHint: string | null;
    durationMinLabel: string;
    setsLabel: string;
    repsLabel: string;
    secPerRepLabel: string;
    restBetweenSetsSecLabel: string;
    minSessionMinLabel: string;
    intensity: MetIntensity;
};

type WorkoutSearchModalState = {
    visible: boolean;
    isSaving: boolean;
    search: WorkoutSearchState;
    modalTitle?: string;
    submitLabel?: string;
};

type WorkoutSearchModalActions = {
    setSearchQuery: (value: string) => void;
    handleSearchWorkouts: () => void;
    setSelectedWorkoutId: (id: string | null) => void;
    setDurationMinLabel: (value: string) => void;
    setSetsLabel: (value: string) => void;
    setRepsLabel: (value: string) => void;
    setSecPerRepLabel: (value: string) => void;
    setRestBetweenSetsSecLabel: (value: string) => void;
    setMinSessionMinLabel: (value: string) => void;
    setIntensity: (value: MetIntensity) => void;
    handleSaveWorkout: () => void;
    onClose: () => void;
};

export type WorkoutSearchModalController = {
    state: WorkoutSearchModalState;
    actions: WorkoutSearchModalActions;
};

type WorkoutSearchModalProps = {
    controller: WorkoutSearchModalController;
};

export default function WorkoutSearchModal({ controller }: WorkoutSearchModalProps) {
    const { state, actions } = controller;
    const { visible, isSaving, search, modalTitle, submitLabel } = state;

    const selectedWorkout = useMemo(
        () => search.results.find((item) => item.id === search.selectedWorkoutId) ?? null,
        [search.results, search.selectedWorkoutId],
    );

    const hasSearchText = search.query.trim().length >= 2;
    const detectedTypeLabel =
        search.detectedType.charAt(0).toUpperCase() + search.detectedType.slice(1);

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

                <View style={styles.modalCardWrap}>
                    <ScrollView
                        style={styles.modalCard}
                        contentContainerStyle={styles.modalContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.heroTopRow}>
                            <Text style={styles.modalTitle}>{modalTitle ?? "Add workout"}</Text>

                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Close modal"
                                disabled={isSaving}
                                onPress={actions.onClose}
                                style={styles.modalIconButton}
                            >
                                <X size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
                            </Pressable>
                        </View>
                        <View style={styles.block}>
                            <AppTextField
                                label="Workout search"
                                placeholder="Example: squat, basketball, badminton"
                                value={search.query}
                                onChangeText={actions.setSearchQuery}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />

                            <View style={styles.searchButtonWrap}>
                                <AppButton
                                    title={search.isSearching ? "Searching..." : "Search Workout"}
                                    onPress={actions.handleSearchWorkouts}
                                    loading={search.isSearching}
                                />
                            </View>

                            {search.results.length > 0 ? (
                                <View style={styles.searchResultsWrap}>
                                    {search.results.map((item) => {
                                        const active = item.id === search.selectedWorkoutId;
                                        return (
                                            <Pressable
                                                key={item.id}
                                                style={[styles.resultRow, active && styles.resultRowActive]}
                                                onPress={() => actions.setSelectedWorkoutId(item.id)}
                                            >
                                                <View style={styles.resultLeft}>
                                                    <Text style={styles.resultTitle}>{item.name}</Text>
                                                    <Text style={styles.resultMeta}>
                                                        {item.category}
                                                        {item.muscles.length
                                                            ? " • " + item.muscles.slice(0, 3).join(", ")
                                                            : ""}
                                                    </Text>
                                                    {item.equipment.length ? (
                                                        <Text style={styles.resultMeta}>
                                                            Equipment: {item.equipment.slice(0, 2).join(", ")}
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ) : search.hasSearched && hasSearchText && !search.isSearching ? (
                                <Text style={styles.emptyText}>No workouts found.</Text>
                            ) : null}
                        </View>

                        {selectedWorkout ? (
                            <View style={styles.block}>
                                <Text style={styles.fieldLabel}>Selected workout</Text>
                                <View style={[styles.resultRow, styles.resultRowActive]}>
                                    <View style={styles.resultLeft}>
                                        <Text style={styles.resultTitle}>{selectedWorkout.name}</Text>
                                        <Text style={styles.resultMeta}>{selectedWorkout.category}</Text>
                                    </View>
                                </View>

                                <Text style={styles.fieldLabel}>
                                    Workout type: {detectedTypeLabel}
                                </Text>
                                {search.workoutMode !== "strength" ? (
                                    <View style={styles.manualRow}>
                                        <View style={styles.manualCell}>
                                            <AppTextField
                                                label="Duration (min)"
                                                placeholder="30"
                                                value={search.durationMinLabel}
                                                onChangeText={actions.setDurationMinLabel}
                                                keyboardType="decimal-pad"
                                            />
                                        </View>
                                    </View>
                                ) : (
                                    <View style={styles.block}>
                                        <View style={styles.manualRow}>
                                            <View style={styles.manualCell}>
                                                <AppTextField
                                                    label="Sets"
                                                    placeholder="4"
                                                    value={search.setsLabel}
                                                    onChangeText={actions.setSetsLabel}
                                                    keyboardType="number-pad"
                                                />
                                            </View>

                                            <View style={styles.manualCell}>
                                                <AppTextField
                                                    label="Reps"
                                                    placeholder="10"
                                                    value={search.repsLabel}
                                                    onChangeText={actions.setRepsLabel}
                                                    keyboardType="number-pad"
                                                />
                                            </View>
                                        </View>

                                        <View style={styles.manualRow}>
                                            <View style={styles.manualCell}>
                                                <AppTextField
                                                    label="Seconds per rep"
                                                    placeholder="4"
                                                    value={search.secPerRepLabel}
                                                    onChangeText={actions.setSecPerRepLabel}
                                                    keyboardType="decimal-pad"
                                                />
                                            </View>

                                            <View style={styles.manualCell}>
                                                <AppTextField
                                                    label="Rest between sets (sec)"
                                                    placeholder="75"
                                                    value={search.restBetweenSetsSecLabel}
                                                    onChangeText={actions.setRestBetweenSetsSecLabel}
                                                    keyboardType="decimal-pad"
                                                />
                                            </View>
                                        </View>

                                        <View style={styles.manualRow}>
                                            <View style={styles.manualCell}>
                                                <AppTextField
                                                    label="Minimum session (min)"
                                                    placeholder="5"
                                                    value={search.minSessionMinLabel}
                                                    onChangeText={actions.setMinSessionMinLabel}
                                                    keyboardType="decimal-pad"
                                                />
                                            </View>
                                        </View>
                                    </View>
                                )}

                                <Text style={styles.fieldLabel}>Intensity</Text>
                                <View style={styles.modeRow}>
                                    {(["low", "moderate", "vigorous"] as MetIntensity[]).map((level) => {
                                        const active = search.intensity === level;
                                        return (
                                            <Pressable
                                                key={level}
                                                style={[styles.modeButton, active && styles.modeButtonActive]}
                                                onPress={() => actions.setIntensity(level)}
                                            >
                                                <Text
                                                    style={[
                                                        styles.modeButtonText,
                                                        active && styles.modeButtonTextActive,
                                                    ]}
                                                >
                                                    {level.charAt(0).toUpperCase() + level.slice(1)}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        ) : null}

                        <View style={styles.modalActions}>
                            <AppButton
                                title={submitLabel ?? "Add Workout"}
                                onPress={actions.handleSaveWorkout}
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
