import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAhXBrsdEEgQj3XOAFA_MyVV_EWMeZGdko",
  authDomain: "sbamboosekuwa.firebaseapp.com",
  databaseURL: "https://sbamboosekuwa-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sbamboosekuwa",
  storageBucket: "sbamboosekuwa.firebasestorage.app",
  messagingSenderId: "3718010989",
  appId: "1:3718010989:web:482a5009f898c6537bc764"
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
