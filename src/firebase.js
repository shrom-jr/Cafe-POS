import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyB8TE_Iz1CcgE1UopHJGYbPCtsx2_xaTh8",
  authDomain: "sanjibcottage.firebaseapp.com",
  databaseURL: "https://sanjibcottage-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sanjibcottage",
  storageBucket: "sanjibcottage.firebasestorage.app",
  messagingSenderId: "90981516338",
  appId: "1:90981516338:web:565c3e4e0d281375f5a82b"
};

const app = initializeApp(firebaseConfig);

// Explicitly passing databaseURL guarantees connection to the Asia-Southeast instance
export const db = getDatabase(app, firebaseConfig.databaseURL);
export const auth = getAuth(app);

let authBootstrap;

/**
 * Gives each POS terminal a Firebase identity without changing the app's
 * existing staff PIN and role workflow. The shared promise also prevents
 * listeners and writes from racing duplicate anonymous sign-ins at startup.
 */
export function ensureFirebaseAuth() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  if (!authBootstrap) {
    authBootstrap = signInAnonymously(auth)
      .then(({ user }) => user)
      .catch((error) => {
        authBootstrap = undefined;
        throw error;
      });
  }

  return authBootstrap;
}
