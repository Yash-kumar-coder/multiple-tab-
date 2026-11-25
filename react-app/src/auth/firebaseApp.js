import { initializeApp, getApps, deleteApp } from "firebase/app";
import { getAuth, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

const primaryApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(primaryApp);
export const db = getFirestore(primaryApp);

/**
 * Runs an async callback with a temporary secondary Firebase Auth instance
 * so the primary admin session is never logged out when creating users.
 */
export async function withSecondaryAuth(callback) {
  const secondaryName = `xauth-secondary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    return await callback(secondaryAuth);
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch (_) {
      // Ignore cleanup signOut errors
    }
    try {
      await deleteApp(secondaryApp);
    } catch (_) {
      // Ignore cleanup deleteApp errors
    }
  }
}
