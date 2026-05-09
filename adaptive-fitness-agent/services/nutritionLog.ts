import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { FoodSource, MealType } from "./nutritionApi";
import { toNumber } from "./helperFunctions";


export type LoggedFoodEntry = {
    id: string;
    mealType: MealType;
    name: string;
    source: FoodSource;
    quantity: number;
    unit: "serving";
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodiumMg: number;
    potassiumMg: number;
    calciumMg: number;
    ironMg: number;
    vitaminCMg: number;
    loggedAt: string;
}

type DailyNutritionLog = {
    dateKey: string,
    entries: LoggedFoodEntry[]
}

function normalizeEntry(raw: Partial<LoggedFoodEntry>): LoggedFoodEntry {
    const mealType: MealType =
        raw.mealType === "breakfast" ||
            raw.mealType === "lunch" ||
            raw.mealType === "dinner" ||
            raw.mealType === "snacks"
            ? raw.mealType
            : "snacks";

    const source: FoodSource =
        raw.source === "USDA" || raw.source === "OpenFoodFacts" || raw.source === "Manual"
            ? raw.source
            : "Manual";

    return {
        id: typeof raw.id === "string" && raw.id ? raw.id : "entry-" + Date.now().toString(),
        mealType,
        name: typeof raw.name === "string" ? raw.name : "",
        source,
        quantity: toNumber(raw.quantity, 1),
        unit: "serving",
        calories: toNumber(raw.calories, 0),
        protein: toNumber(raw.protein, 0),
        carbs: toNumber(raw.carbs, 0),
        fat: toNumber(raw.fat, 0),
        fiber: toNumber(raw.fiber, 0),
        sodiumMg: toNumber(raw.sodiumMg, 0),
        potassiumMg: toNumber(raw.potassiumMg, 0),
        calciumMg: toNumber(raw.calciumMg, 0),
        ironMg: toNumber(raw.ironMg, 0),
        vitaminCMg: toNumber(raw.vitaminCMg, 0),
        loggedAt:
            typeof raw.loggedAt === "string" && raw.loggedAt
                ? raw.loggedAt
                : new Date().toISOString(),
    };
}

function dayDocRef(uid: string, dateKey: string) {
    return doc(db, "users", uid, "nutritionLogs", dateKey);
}

function entryDocRef(uid: string, dateKey: string, entryId: string) {
    return doc(db, "users", uid, "nutritionLogs", dateKey, "entries", entryId);
}

function entriesCollectionRef(uid: string, dateKey: string) {
    return collection(db, "users", uid, "nutritionLogs", dateKey, "entries");
}

function sortByLoggedAt(entries: LoggedFoodEntry[]) {
    return [...entries].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

export async function loadDailyNutritionLog(
    uid: string,
    dateKey: string
): Promise<DailyNutritionLog> {
    const entrySnapshot = await getDocs(entriesCollectionRef(uid, dateKey));
    const entryDocEntries = entrySnapshot.docs.map((entryDoc) =>
        normalizeEntry({
            id: entryDoc.id,
            ...((entryDoc.data() ?? {}) as Partial<LoggedFoodEntry>),
        })
    );

    return {
        dateKey,
        entries: sortByLoggedAt(entryDocEntries),
    };
}

export async function upsertLoggedFoodEntry(
    uid: string,
    dateKey: string,
    entry: LoggedFoodEntry,
) {
    const normalized = normalizeEntry(entry);
    await Promise.all([
        setDoc(entryDocRef(uid, dateKey, normalized.id), normalized, { merge: true }),
        setDoc(
            dayDocRef(uid, dateKey),
            {
                dateKey,
                usesEntryDocs: true,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        ),
    ]);
}

export async function deleteLoggedFoodEntry(
    uid: string,
    dateKey: string,
    entryId: string,
) {
    await Promise.all([
        deleteDoc(entryDocRef(uid, dateKey, entryId)),
        setDoc(
            dayDocRef(uid, dateKey),
            {
                dateKey,
                usesEntryDocs: true,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        ),
    ]);
}

