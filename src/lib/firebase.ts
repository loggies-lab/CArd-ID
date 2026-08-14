import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase Web SDK Configuration for card-id-app
const firebaseConfig = {
  projectId: "card-id-app",
  appId: "1:327141290136:web:5def45841a77f9bb00e0ed",
  storageBucket: "card-id-app.firebasestorage.app",
  apiKey: "AIzaSyDTDFVWZH8WkxE79qJmazF_lFOB2gnNjWM",
  authDomain: "card-id-app.firebaseapp.com",
  messagingSenderId: "327141290136",
};

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Cloud Firestore Database
const db = getFirestore(app);

export { app, db };
