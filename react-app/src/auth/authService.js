import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, withSecondaryAuth } from "./firebaseApp";
import { ADMIN_EMAIL_HASH, USER_EMAIL_DOMAIN } from "./firebaseConfig";

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isAdminEmail(email) {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) return false;
  const digest = await sha256Hex(clean);
  return digest === ADMIN_EMAIL_HASH;
}

export function toUserEmail(username) {
  const clean = (username || "").trim().toLowerCase();
  if (!clean) {
    throw new Error("Please enter a username.");
  }
  if (clean.includes("@")) {
    throw new Error("Enter username only (without @).");
  }
  return `${clean}@${USER_EMAIL_DOMAIN}`;
}

export function formatAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Invalid username/email or password.";
  }
  if (code === "auth/email-already-in-use") {
    return "This username already exists.";
  }
  if (code === "auth/weak-password") {
    return "Password must be at least 6 characters.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please try again later.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error. Please check your internet connection.";
  }
  return err?.message || "Authentication failed.";
}

export async function loginAdmin(email, password) {
  try {
    const cleanEmail = (email || "").trim();
    if (!cleanEmail || !password) {
      throw new Error("Please enter admin email and password.");
    }
    if (!(await isAdminEmail(cleanEmail))) {
      throw new Error("Only the configured admin email can use Admin login.");
    }
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    if (!(await isAdminEmail(cred.user?.email))) {
      await signOut(auth);
      throw new Error("Aapko access nahi hai");
    }
    return cred.user;
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function loginUser(username, password) {
  try {
    if (!password) {
      throw new Error("Please enter password.");
    }
    const email = toUserEmail(username);
    const cred = await signInWithEmailAndPassword(auth, email, password);

    const userRef = doc(db, "users", cred.user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists() || snap.data()?.active !== true) {
      await signOut(auth);
      throw new Error("Aapko access nahi hai");
    }

    return { user: cred.user, profile: snap.data() };
  } catch (err) {
    if (err?.message === "Aapko access nahi hai") {
      throw err;
    }
    throw new Error(formatAuthError(err));
  }
}

export async function verifyUserAccess(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() && snap.data()?.active === true ? snap.data() : null;
}

export function subscribeUserAccess(uid, onRevoked) {
  const userRef = doc(db, "users", uid);
  return onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists() || snap.data()?.active !== true) {
        onRevoked("Aapka access admin ne band kar diya hai");
      }
    },
    () => {
      onRevoked("Aapka access admin ne band kar diya hai");
    }
  );
}

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function createUserAccount(username, password) {
  try {
    const cleanUsername = (username || "").trim().toLowerCase();
    if (!cleanUsername) {
      throw new Error("Username is required.");
    }
    if (!password || password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    const email = toUserEmail(cleanUsername);

    const createdUser = await withSecondaryAuth(async (secondaryAuth) => {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      return cred.user;
    });

    await setDoc(doc(db, "users", createdUser.uid), {
      username: cleanUsername,
      role: "user",
      active: true,
      createdAt: serverTimestamp(),
    });

    return { uid: createdUser.uid, username: cleanUsername, role: "user", active: true };
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function listAllUsers() {
  try {
    const snapshot = await getDocs(collection(db, "users"));
    const users = [];
    snapshot.forEach((docSnap) => {
      users.push({ uid: docSnap.id, ...docSnap.data() });
    });
    users.sort((a, b) => {
      const ta = a.createdAt?.seconds || 0;
      const tb = b.createdAt?.seconds || 0;
      return tb - ta;
    });
    return users;
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function toggleUserActive(uid, currentActive) {
  try {
    await updateDoc(doc(db, "users", uid), { active: !currentActive });
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function updateUserUsername(uid, newUsername) {
  try {
    const clean = (newUsername || "").trim().toLowerCase();
    if (!clean || clean.includes("@")) {
      throw new Error("Enter a valid username (without @).");
    }
    await updateDoc(doc(db, "users", uid), { username: clean });
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}

export async function deleteUserRecord(uid) {
  try {
    await deleteDoc(doc(db, "users", uid));
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}
