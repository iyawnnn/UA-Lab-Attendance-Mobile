import { useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

export interface AuthStorageData {
  isLoading: boolean;
  isRegistered: boolean;
  studentId: string | null;
  privateKey: string | null;
}

export const useAuthStorage = () => {
  const [state, setState] = useState<AuthStorageData>({
    isLoading: true,
    isRegistered: false,
    studentId: null,
    privateKey: null,
  });

  // 1. Asynchronously bootstraps stored security key signatures on boot
  const initializeAuthContext = useCallback(async () => {
    try {
      const storedId = await SecureStore.getItemAsync("student_id");
      const storedPrivateKey = await SecureStore.getItemAsync("student_private_key");
      
      if (storedId && storedPrivateKey) {
        setState({
          isLoading: false,
          isRegistered: true,
          studentId: storedId,
          privateKey: storedPrivateKey,
        });
      } else {
        setState({
          isLoading: false,
          isRegistered: false,
          studentId: null,
          privateKey: null,
        });
      }
    } catch (error) {
      console.error("[AUTH_HOOK] Failed to read encrypted storage matrix:", error);
      setState({
        isLoading: false,
        isRegistered: false,
        studentId: null,
        privateKey: null,
      });
    }
  }, []);

  useEffect(() => {
    initializeAuthContext();
  }, [initializeAuthContext]);

  /**
   * FIX: Aligned signature to cleanly receive all 5 arguments dispatched 
   * by RegistrationScreen.tsx during successful logins and onboarding.
   */
  const saveCredentials = async (
    studentId: string,
    email: string,
    sessionToken: string,
    privateKeyBase64: string,
    publicKeyBase64: string
  ) => {
    try {
      console.log(`[AUTH_HOOK] Committing fresh credentials for Student ID: ${studentId}`);
      
      // Save all parameters using keys matching your exact screen requirements
      await SecureStore.setItemAsync("student_id", studentId);
      await SecureStore.setItemAsync("student_email", email);
      await SecureStore.setItemAsync("session_token", sessionToken);
      await SecureStore.setItemAsync("student_private_key", privateKeyBase64);
      await SecureStore.setItemAsync("student_public_key", publicKeyBase64);

      setState({
        isLoading: false,
        isRegistered: true,
        studentId: studentId,
        privateKey: privateKeyBase64,
      });
    } catch (error) {
      console.error("[AUTH_HOOK] Error saving configuration records to hardware vault:", error);
      throw error;
    }
  };

  /**
   * Executes an atomic clean sweep across all storage strings. 
   * Instantly triggered when foreground or background loops catch a session shift.
   */
  const clearCredentials = async () => {
    try {
      console.log("[AUTH_HOOK] Initiating clean eviction sweep on device storage context.");
      
      await SecureStore.deleteItemAsync("student_id");
      await SecureStore.deleteItemAsync("student_email");
      await SecureStore.deleteItemAsync("session_token");
      await SecureStore.deleteItemAsync("student_private_key");
      await SecureStore.deleteItemAsync("student_public_key");

      setState({
        isLoading: false,
        isRegistered: false,
        studentId: null,
        privateKey: null,
      });
      console.log("[AUTH_HOOK] Local token state completely flushed.");
    } catch (error) {
      console.error("[AUTH_HOOK] Severe failure clearing local security sandbox:", error);
    }
  };

  return {
    isLoading: state.isLoading,
    isRegistered: state.isRegistered,
    studentId: state.studentId,
    privateKey: state.privateKey,
    saveCredentials,
    clearCredentials,
  };
};