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

    // Check redirect sign-in result when returning from redirect auth
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user && !isCancelled) {
          setCurrentUser(result.user);
          const profile = await getOrCreateUserProfile(result.user);
          setUserProfile(profile);
        }
      })
      .catch((err) => {
        console.warn("Google Redirect Auth Notice:", err?.message);
      });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setCurrentUser(user);
        try {
          const token = await user.getIdToken();
          if (!isCancelled) setIdToken(token);

          setTimeout(async () => {
            if (isCancelled) return;
            try {
              const profile = await getOrCreateUserProfile(user);
              if (!isCancelled) setUserProfile(profile);
            } catch (err) {
              console.warn("User profile fetch delayed retry:", err);
            } finally {
              if (!isCancelled) setLoading(false);
            }
          }, 250);
        } catch (err) {
          console.error("Failed to load user token:", err);
          if (!isCancelled) setLoading(false);
        }
      } else {
        setCurrentUser(null);
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
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.warn("Popup authentication error/notice:", err?.code, err?.message);
      if (err.code === "auth/popup-blocked" || err.code === "auth/cancelled-popup-request") {
        await signInWithRedirect(auth, provider);
      } else {
        throw err;
      }
    }
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
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
