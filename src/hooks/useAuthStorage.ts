import { useState, useEffect, useCallback } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";

export interface AuthState {
  isLoading: boolean;
  isRegistered: boolean;
  studentId: string | null;
  email: string | null;
  sessionToken: string | null;
  privateKey: string | null;
  publicKey: string | null;
}

export function useAuthStorage() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isRegistered: false,
    studentId: null,
    email: null,
    sessionToken: null,
    privateKey: null,
    publicKey: null,
  });

  const clearCredentials = useCallback(async () => {
    await SecureStore.deleteItemAsync("student_id");
    await SecureStore.deleteItemAsync("student_email");
    await SecureStore.deleteItemAsync("session_token");
    await SecureStore.deleteItemAsync("student_private_key");
    await SecureStore.deleteItemAsync("student_public_key");

    setState({
      isLoading: false,
      isRegistered: false,
      studentId: null,
      email: null,
      sessionToken: null,
      privateKey: null,
      publicKey: null,
    });
  }, []);

  const checkCredentials = useCallback(async () => {
    try {
      const storedId = await SecureStore.getItemAsync("student_id");
      const storedEmail = await SecureStore.getItemAsync("student_email");
      const storedToken = await SecureStore.getItemAsync("session_token");
      const storedPrivateKey = await SecureStore.getItemAsync("student_private_key");
      const storedPublicKey = await SecureStore.getItemAsync("student_public_key");

      if (storedId && storedPrivateKey && storedToken && storedPublicKey) {
        /* Compares local public key against database to detect device key rotations */
        try {
          const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000";
          const response = await fetch(
            `${baseUrl}/api/student/check-status?studentId=${encodeURIComponent(
              storedId
            )}&sessionToken=${encodeURIComponent(
              storedToken
            )}&publicKey=${encodeURIComponent(storedPublicKey)}`
          );

          if (response.ok) {
            const data = await response.json();
            if (data.isRevoked) {
              await clearCredentials();
              return;
            }
          }
        } catch (networkError) {
          // Allows local persistence during temporary offline states
        }

        setState({
          isLoading: false,
          isRegistered: true,
          studentId: storedId,
          email: storedEmail,
          sessionToken: storedToken,
          privateKey: storedPrivateKey,
          publicKey: storedPublicKey,
        });
      } else {
        await clearCredentials();
      }
    } catch (error) {
      await clearCredentials();
    }
  }, [clearCredentials]);

  useEffect(() => {
    checkCredentials();
  }, [checkCredentials]);

  /* Polls backend every 5 seconds and on app resume to trigger remote logouts */
  useEffect(() => {
    if (!state.isRegistered || !state.studentId || !state.publicKey) return;

    const interval = setInterval(() => {
      checkCredentials();
    }, 5000);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkCredentials();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [state.isRegistered, state.studentId, state.publicKey, checkCredentials]);

  const saveCredentials = async (
    studentId: string,
    email: string,
    sessionToken: string,
    privateKeyBase64: string,
    publicKeyBase64: string
  ) => {
    await SecureStore.setItemAsync("student_id", studentId);
    await SecureStore.setItemAsync("student_email", email);
    await SecureStore.setItemAsync("session_token", sessionToken);
    await SecureStore.setItemAsync("student_private_key", privateKeyBase64);
    await SecureStore.setItemAsync("student_public_key", publicKeyBase64);

    setState({
      isLoading: false,
      isRegistered: true,
      studentId,
      email,
      sessionToken,
      privateKey: privateKeyBase64,
      publicKey: publicKeyBase64,
    });
  };

  return {
    ...state,
    saveCredentials,
    clearCredentials,
    refreshCredentials: checkCredentials,
  };
}