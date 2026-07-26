import { initializeApp } from "firebase/app";
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
