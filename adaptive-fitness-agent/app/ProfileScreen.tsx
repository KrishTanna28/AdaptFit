import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { User } from "firebase/auth/react-native";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";
import { Camera, Pencil } from "lucide-react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { signOut } from "firebase/auth";
import { auth, db } from "../services/firebase";
import { publishIntelligenceEvent } from "../services/intelligenceEvents";

import {
    getUserFriendlyErrorMessage,
    useAppAlert,
} from "../components/ui/AppAlert";
import AppCard from "../components/ui/AppCard";
import AppButton from "../components/ui/AppButton";
import { appTheme } from "../theme/designSystem";
import { globalStyles } from "../theme/globalStyles";
import { styles } from "./ProfileScreen.styles";
import { Gender, ProfileFormData, EMPTY_PROFILE_FORM, GENDER_LABELS, FITNESS_GOAL_LABELS, LIFESTYLE_LABELS, DIET_TYPE_LABELS } from "./profileConfig"
import ProfileEditModal from "./ProfileEditModal"

type ProfileScreenProps = {
    user: User;
};

const FIRESTORE_SAVE_TIMEOUT_MS = 8000;
const MAX_PHOTO_BYTES = 700 * 1024;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    return Promise.race<T>([
        promise,
        new Promise<T>((_resolve, reject) => {
            const timeoutId = setTimeout(() => {
                clearTimeout(timeoutId);
                reject(new Error("save-timeout"));
            }, timeoutMs);
        }),
    ]);
}

function parsePositiveNumber(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
}

function toDisplayNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value === "string") {
        return value;
    }

    return "";
}

function toEnumOrEmpty<T extends string>(
    value: unknown,
    allowed: ReadonlyArray<T>,
): T | "" {
    if (typeof value === "string" && allowed.includes(value as T)) {
        return value as T;
    }

    return "";
}

function parseGender(value: unknown): Gender | "" {
    if (typeof value !== "string") {
        return "";
    }

    const normalized = value.trim().toUpperCase();
    if (normalized === "MALE") {
        return "MALE";
    }
    if (normalized === "FEMALE") {
        return "FEMALE";
    }
    return "";
}

function parseProfileFromFirestore(raw: unknown): ProfileFormData {
    if (!raw || typeof raw !== "object") {
        return { ...EMPTY_PROFILE_FORM };
    }

    const data = raw as Record<string, unknown>;
    const allergies = Array.isArray(data.allergies)
        ? data.allergies.filter((item): item is string => typeof item === "string").join(", ")
        : "";

    return {
        name: typeof data.name === "string" ? data.name : "",
        age: toDisplayNumber(data.age),
        gender: parseGender(data.gender),
        heightCm: toDisplayNumber(data.heightCm),
        weightKg: toDisplayNumber(data.weightKg),
        fitnessGoal: toEnumOrEmpty(data.fitnessGoal, ["LOSE_WEIGHT", "GAIN_MUSCLE", "MAINTAIN"]),
        lifestyle: toEnumOrEmpty(data.lifestyle, [
            "SEDENTARY",
            "LIGHT",
            "MODERATE",
            "ACTIVE",
            "VERY_ACTIVE",
        ]),
        dietType: toEnumOrEmpty(data.dietType, ["VEG", "NON_VEG", "VEGAN"]),
        allergies,
        foodRestrictions:
            typeof data.foodRestrictions === "string" ? data.foodRestrictions : "",
        injuries: typeof data.injuries === "string" ? data.injuries : "",
        medicalConditions:
            typeof data.medicalConditions === "string" ? data.medicalConditions : "",
        photoDataUri: typeof data.photoDataUri === "string" ? data.photoDataUri : null,
    };
}

type FirestoreProfilePayload = ReturnType<typeof toFirestoreProfilePayload>;

function arStringArraysEqual(left: string[], right: string[]){
    if(left.length !== right.length){
        return false;
    }
    for(let i = 0; i < left.length; i++){
        if (left[i] !== right[i]) {
            return false;
        }
    }
    return true;
}

function arProfileValuesEqual(left: FirestoreProfilePayload[keyof FirestoreProfilePayload], right: FirestoreProfilePayload[keyof FirestoreProfilePayload]){
    const leftIsArray = Array.isArray(left);
    const rightIsArray = Array.isArray(right);
    if(leftIsArray || rightIsArray){
        if(!leftIsArray || !rightIsArray){
            return false;
        }
        return arStringArraysEqual(left as string[], right as string[]);
    }
    return left === right;
}

function setPartialProfileValue<K extends keyof FirestoreProfilePayload>(
    target: Partial<FirestoreProfilePayload>,
    key: K,
    value: FirestoreProfilePayload[K],
){  
    target[key] = value;
}

function buildPartialProfilePayload(currentProfile : ProfileFormData, nextProfile : ProfileFormData): Partial<FirestoreProfilePayload>{
    const current = toFirestoreProfilePayload(currentProfile);
    const next = toFirestoreProfilePayload(nextProfile);
    const partial: Partial<FirestoreProfilePayload> = {};
    (Object.keys(next) as Array<keyof FirestoreProfilePayload>).forEach((key) => {
        if(!arProfileValuesEqual(current[key], next[key])){
            setPartialProfileValue(partial, key, next[key]);
        }
    });
    return partial;
}

function normalizeCsvToArray(value: string) {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function toFirestoreProfilePayload(profile: ProfileFormData) {
    return {
        name: profile.name.trim(),
        age: parsePositiveNumber(profile.age),
        gender: profile.gender || null,
        heightCm: parsePositiveNumber(profile.heightCm),
        weightKg: parsePositiveNumber(profile.weightKg),
        fitnessGoal: profile.fitnessGoal || null,
        lifestyle: profile.lifestyle || null,
        dietType: profile.dietType || null,
        allergies: normalizeCsvToArray(profile.allergies),
        foodRestrictions: profile.foodRestrictions.trim() || null,
        injuries: profile.injuries.trim(),
        medicalConditions: profile.medicalConditions.trim() || null,
        photoDataUri: profile.photoDataUri,
    };
}

function buildProfileHistorySnapshot(profile: ProfileFormData) {
    const snapshot = toFirestoreProfilePayload(profile);
    return {
        ...snapshot,
        photoDataUri: null,
    };
}

function isFilledText(value: string) {
    return value.trim().length > 0;
}

function toFallbackValue(value: string) {
    return value.trim() || "-";
}

export default function ProfileScreen({ user }: ProfileScreenProps) {
    const { showAlert } = useAppAlert();
    const [profile, setProfile] = useState<ProfileFormData>({ ...EMPTY_PROFILE_FORM });
    const [draftProfile, setDraftProfile] = useState<ProfileFormData>({
        ...EMPTY_PROFILE_FORM,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [isPhotoMenuOpen, setIsPhotoMenuOpen] = useState(false);

    const completionChecks = useMemo(
        () => [
            isFilledText(profile.name),
            parsePositiveNumber(profile.age) !== null,
            isFilledText(profile.gender),
            parsePositiveNumber(profile.heightCm) !== null,
            parsePositiveNumber(profile.weightKg) !== null,
            profile.fitnessGoal !== "",
            profile.lifestyle !== "",
            profile.dietType !== "",
        ],
        [profile],
    );

    const completionPercent = Math.round(
        (completionChecks.filter(Boolean).length / completionChecks.length) * 100,
    );

    const shouldShowCompletionPrompt = completionPercent < 100;

    const saveProfile = useCallback(
        async (nextProfile: ProfileFormData, successTitle?: string) => {
            setIsSaving(true);
            try{
                const currentDisplayName = profile.name.trim() || user.displayName || null;
                const nextDisplayName = nextProfile.name.trim() || user.displayName || null;
                const partialProfile = buildPartialProfilePayload(profile, nextProfile);
                const hasProfileChanges = Object.keys(partialProfile).length > 0;
                const hasDisplayNameChange = currentDisplayName !== nextDisplayName;
                
                if(!hasProfileChanges && !hasDisplayNameChange){
                    if(successTitle){
                        showAlert({title: successTitle, message: "No changes to save"});
                    }
                    return true;
                }
                const useRef = doc(db, "users", user.uid);
                const patch: Record<string, unknown> = {
                    profileUpdatedAt: serverTimestamp(),
                }
                if(hasProfileChanges){
                    patch.profile = partialProfile;
                }
                if(hasDisplayNameChange){
                    patch.displayName = nextDisplayName;
                }
                patch.email = user.email?? null;

                await  withTimeout(
                    setDoc(useRef, patch, { merge: true}),
                    FIRESTORE_SAVE_TIMEOUT_MS,
                );

                if (hasProfileChanges) {
                    const historyRef = collection(db, "users", user.uid, "profileHistory");
                    const changedFields = Object.keys(partialProfile);

                    await addDoc(historyRef, {
                        changedAt: serverTimestamp(),
                        changedFields,
                        snapshot: buildProfileHistorySnapshot(nextProfile),
                        source: "profile_update",
                    });

                    void publishIntelligenceEvent({
                        type: "profile_updated",
                        payload: {
                            changedFields,
                        },
                    });
                }
                if(successTitle){
                    showAlert({title: successTitle, message: "Saved changes"});
                }
                return true;
            } catch(error) {
                const errorText = error instanceof Error ? error.message : "";
                const message = /save-timeout/i.test(errorText) ? 
                "Couldn't reach Firestore in time. Check your internet and try again."
                : getUserFriendlyErrorMessage(
                    error,
                    "We coultn't save you profile right now. Please try again."
                );

                showAlert({
                    title: "Couldn't save profile",
                    message
                })

                return false;
            } finally {
                setIsSaving(false);
            }
        }, [profile, showAlert, user.displayName, user.email, user.uid]
    );

    useEffect(() => {
        let isMounted = true;

        const loadProfile = async () => {
            setIsLoading(true);

            try {
                const userRef = doc(db, "users", user.uid);
                const snapshot = await getDoc(userRef);
                const firestoreProfile = snapshot.data()?.profile;

                if (isMounted) {
                    const parsedProfile = parseProfileFromFirestore(firestoreProfile);
                    const profileWithResolvedName = {
                        ...parsedProfile,
                        name: parsedProfile.name.trim() || user.displayName || "",

                    }
                    setProfile(profileWithResolvedName);
                    setDraftProfile(profileWithResolvedName);
                }
            } catch (error) {
                if (isMounted) {
                    const fallbackProfile = {
                        ...EMPTY_PROFILE_FORM,
                        name: user.displayName || "",
                    }
                    setProfile(fallbackProfile);
                    setDraftProfile(fallbackProfile);
                    showAlert({
                        title: "Couldn't load profile",
                        message: getUserFriendlyErrorMessage(
                            error,
                            "We couldn't load your profile details right now.",
                        ),
                    });
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        loadProfile().catch(() => {
            if (isMounted) {
                setIsLoading(false);
            }
        });

        return () => {
            isMounted = false;
        };
    }, [showAlert, user.uid, user.displayName]);

    const handleUploadPhoto = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permission.status !== "granted") {
            showAlert({
                title: "Permission needed",
                message: "Please allow media library access to upload a profile photo.",
            });
            return;
        }

        const pickerResult = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.25,
            base64: true,
        });

        if (pickerResult.canceled) {
            return;
        }

        const firstAsset = pickerResult.assets[0];
        if (!firstAsset?.base64) {
            showAlert({
                title: "Unsupported photo",
                message: "We couldn't process this image. Please try a different photo.",
            });
            return;
        }

        const estimatedBytes = Math.ceil((firstAsset.base64.length * 3) / 4);
        if (estimatedBytes > MAX_PHOTO_BYTES) {
            showAlert({
                title: "Photo too large",
                message:
                    "Choose a smaller image. Firestore has document size limits for profile photos.",
            });
            return;
        }

        const mimeType = firstAsset.mimeType ?? "image/jpeg";
        const photoDataUri = `data:${mimeType};base64,${firstAsset.base64}`;
        const nextProfile = { ...profile, photoDataUri };

        setProfile(nextProfile);
        const didSave = await saveProfile(nextProfile);

        if (!didSave) {
            setProfile(profile);
        }
    }, [profile, saveProfile, showAlert]);

    const handleRemovePhoto = useCallback(async () => {
        if (!profile.photoDataUri) {
            showAlert({
                title: "No photo to remove",
                message: "Your profile is already using the default photo.",
            });
            return;
        }

        const nextProfile = { ...profile, photoDataUri: null };
        setProfile(nextProfile);
        const didSave = await saveProfile(nextProfile);

        if (!didSave) {
            setProfile(profile);
        }
    }, [profile, saveProfile, showAlert]);

    const handleTogglePhotoMenu = () => {
        setIsPhotoMenuOpen((prev) => !prev);
    };

    const handleUploadPhotoFromMenu = () => {
        setIsPhotoMenuOpen(false);
        void handleUploadPhoto();
    }

    const handleRemovePhotoFromMenu = () => {
        setIsPhotoMenuOpen(false);
        void handleRemovePhoto();
    }

    const handleOpenEditModal = () => {
        setIsPhotoMenuOpen(false);
        setDraftProfile(profile);
        setIsEditModalVisible(true);
    };

    const handleCloseEditModal = () => {
        setIsEditModalVisible(false);
    };

    const handleSaveEditModal = async () => {
        const didSave = await saveProfile(draftProfile, "Profile updated");

        if (didSave) {
            setProfile(draftProfile);
            setIsEditModalVisible(false);
        }
    };

    const handleLogout = async () => {
        try {
            await GoogleSignin.signOut().catch(() => {
                // Firebase sign-out is the source of truth for leaving the app.
            });
            await signOut(auth);
        } catch (error) {
            const message = getUserFriendlyErrorMessage(
                error,
                "We couldn't log you out right now. Please try again.",
            );

            showAlert({
                title: "Couldn't log out",
                message,
            });
        }
    };

    const profileRows = [
        { label: "Name", value: toFallbackValue(profile.name || user.displayName || "") },
        { label: "Email", value: user.email || "-" },
        { label: "Age", value: toFallbackValue(profile.age) },
        { label: "Gender", value: profile.gender === "" ? "-" : GENDER_LABELS[profile.gender] },
        { label: "Height (cm)", value: toFallbackValue(profile.heightCm) },
        { label: "Weight (kg)", value: toFallbackValue(profile.weightKg) },
        {
            label: "Fitness Goal",
            value:
                profile.fitnessGoal === "" ? "-" : FITNESS_GOAL_LABELS[profile.fitnessGoal],
        },
        {
            label: "Lifestyle",
            value: profile.lifestyle === "" ? "-" : LIFESTYLE_LABELS[profile.lifestyle],
        },
        {
            label: "Diet Type",
            value: profile.dietType === "" ? "-" : DIET_TYPE_LABELS[profile.dietType],
        },
        { label: "Allergies", value: toFallbackValue(profile.allergies) },
        {
            label: "Food Restrictions",
            value: toFallbackValue(profile.foodRestrictions),
        },
        { label: "Injuries", value: toFallbackValue(profile.injuries) },
        {
            label: "Medical Conditions",
            value: toFallbackValue(profile.medicalConditions),
        },
    ];

    return (
        <SafeAreaView style={globalStyles.screen} edges={["top", "left", "right"]}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={() => setIsPhotoMenuOpen(false)}
            >
                <View style={styles.container}>
                    <AppCard style={styles.headerCard}>
                        <View style={styles.photoMenuContainer}>
                            <Pressable
                                onPress={handleTogglePhotoMenu}
                                style={styles.photoPressable}
                                accessibilityRole="button"
                                accessibilityLabel="Manage profile photo"
                            >
                                {profile.photoDataUri ? (
                                    <Image source={{ uri: profile.photoDataUri }} style={styles.avatarImage} />
                                ) : (
                                    <View style={styles.avatarFallback}>
                                        <Camera size={26} color={appTheme.colors.primary} strokeWidth={2} />
                                    </View>
                                )}
                            </Pressable>
                            {isPhotoMenuOpen ? (
                                <View style={styles.photoDropdown}>
                                    <Pressable
                                        onPress={handleUploadPhotoFromMenu}
                                        style={[styles.photoDropdownAction, styles.photoDropdownActionWithDivider]}
                                    >
                                        <Text style={styles.photoDropdownActionText}>Upload photo</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={handleRemovePhotoFromMenu}
                                        style={styles.photoDropdownAction}
                                    >
                                        <Text style={styles.photoDropdownActionText}>Remove photo</Text>
                                    </Pressable>
                                </View>
                            ) : null}
                        </View>
                        <Text style={styles.title}>{user.displayName}</Text>
                        <Text style={styles.subtitle}>{user.email}</Text>
                    </AppCard>

                    {shouldShowCompletionPrompt ? (
                        <AppCard style={styles.completionCard}>
                            <View style={styles.completionHeaderRow}>
                                <Text style={styles.completionTitle}>Complete your profile</Text>
                                <Text style={styles.completionPercent}>{completionPercent}%</Text>
                            </View>
                            <View style={styles.progressTrack}>
                                <View
                                    style={[styles.progressFill, { width: `${completionPercent}%` as `${number}%` }]}
                                />
                            </View>
                        </AppCard>
                    ) : null}

                    <AppCard style={styles.detailsCard}>
                        <View style={styles.detailsHeaderRow}>
                            <Text style={styles.sectionTitle}>Profile Details</Text>
                            <Pressable
                                onPress={handleOpenEditModal}
                                style={styles.editButton}
                                accessibilityRole="button"
                                accessibilityLabel="Edit profile details"
                            >
                                <Pencil size={18} color={appTheme.colors.primary} strokeWidth={2.2} />
                            </Pressable>
                        </View>

                        {profileRows.map((row) => (
                            <View style={styles.previewRow} key={row.label}>
                                <Text style={styles.previewLabel}>{row.label}</Text>
                                <Text style={styles.previewValue}>{row.value}</Text>
                            </View>
                        ))}
                    </AppCard>
                    <AppButton title="Log out" variant="secondary" tone="danger" onPress={handleLogout} />
                    
                </View>
                
            </ScrollView>

            <ProfileEditModal
                visible={isEditModalVisible}
                isLoading={isLoading}
                isSaving={isSaving}
                draftProfile={draftProfile}
                onChangeDraft={setDraftProfile}
                onClose={handleCloseEditModal}
                onSave={() => {
                    void handleSaveEditModal();
                }}
            />
        </SafeAreaView>
    );
}
