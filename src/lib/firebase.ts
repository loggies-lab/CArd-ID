import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Dynamic auth domain to prevent Cross-Origin-Opener-Policy & cross-domain storage blocks
const getDynamicAuthDomain = () => {
  if (typeof window !== "undefined" && window.location.hostname) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "card-id-app.firebaseapp.com";
    }
    return window.location.hostname;
  }
  return "card-id-app.web.app";
};

// Firebase Web SDK Configuration for card-id-app
const firebaseConfig = {
  projectId: "card-id-app",
  appId: "1:327141290136:web:5def45841a77f9bb00e0ed",
  storageBucket: "card-id-app.firebasestorage.app",
  apiKey: "AIzaSyDTDFVWZH8WkxE79qJmazF_lFOB2gnNjWM",
  authDomain: getDynamicAuthDomain(),
  messagingSenderId: "327141290136",
};

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth
const auth = getAuth(app);

// Initialize Firestore with Multi-Tab Persistence Manager to prevent popup IndexedDB closing errors
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  db = getFirestore(app);
}

const functions = getFunctions(app);

export { app, auth, db, functions };
