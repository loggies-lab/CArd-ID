"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getOrCreateUserProfile, UserProfileDocument } from "@/lib/userProfile";

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfileDocument | null;
  loading: boolean;
  idToken: string | null;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  enterAsGuest: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileDocument | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(false);

        user
          .getIdToken()
          .then((token) => {
            if (!isCancelled) setIdToken(token);
          })
          .catch((err) => console.error("Failed to load user token:", err));

        getOrCreateUserProfile(user)
          .then((profile) => {
            if (!isCancelled) setUserProfile(profile);
          })
          .catch((err) => {
            console.warn("User profile background sync notice:", err);
          });
      } else {
        // Only clear if not in guest mode
        setCurrentUser((prev) => ((prev as any)?.isGuest ? prev : null));
        setUserProfile(null);
        setIdToken(null);
        setLoading(false);
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (auth.currentUser) {
      const profile = await getOrCreateUserProfile(auth.currentUser);
      setUserProfile(profile);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    if (res.user) {
      setCurrentUser(res.user);
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (res.user) {
      setCurrentUser(res.user);
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const res = await signInWithPopup(auth, provider);
      if (res?.user) {
        setCurrentUser(res.user);
        setLoading(false);
      }
    } catch (err: any) {
      console.error("Google Sign-In Error Code:", err?.code, "Message:", err?.message);
      throw err;
    }
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const enterAsGuest = () => {
    const guestUser = {
      uid: "guest_user",
      email: "guest@cardid.pro",
      displayName: "Guest Collector",
      isGuest: true,
    } as any;
    setCurrentUser(guestUser);
    setUserProfile({
      uid: "guest_user",
      email: "guest@cardid.pro",
      displayName: "Guest Collector",
      photoURL: null,
      createdAt: new Date().toISOString(),
      subscriptionTier: "free",
      scansRemaining: 50,
      monthlyScanLimit: 50,
      lastLogin: new Date().toISOString(),
    });
    setLoading(false);
  };

  const logout = async () => {
    setCurrentUser(null);
    setUserProfile(null);
    setIdToken(null);
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        idToken,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        sendPasswordReset,
        logout,
        enterAsGuest,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
