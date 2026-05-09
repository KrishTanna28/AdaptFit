import { type User } from "firebase/auth/react-native";

export function needsPasswordSetup(user : User | null) {
    if (!user) return false;

    const hasGoogleProvided = user.providerData.some(
        (provider) => provider.providerId === "google.com"
    );

    const hasPasswordProvider = user.providerData.some(
        (provider) => provider.providerId === "password"
    );
    return hasGoogleProvided && !hasPasswordProvider;
}

export function needsEmailVerification(user: User | null) {
    if (!user) return false;

    const hasPasswordProvider = user.providerData.some(
        (provider) => provider.providerId === "password"
    );

    const hasGoogleProvided = user.providerData.some(
        (provider) => provider.providerId === "google.com"
    );

    return hasPasswordProvider && !hasGoogleProvided && !user.emailVerified;
}
