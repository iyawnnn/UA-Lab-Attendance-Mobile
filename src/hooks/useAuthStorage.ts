// src/hooks/useAuthStorage.ts

import { useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

export interface AuthState {
  isLoading: boolean;
  isRegistered: boolean;
  studentId: string | null;
  privateKey: string | null;
}

export function useAuthStorage() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isRegistered: false,
    studentId: null,
    privateKey: null,
  });

  // Evaluates device secure partition slots on app boot
  const checkCredentials = useCallback(async () => {
    try {
      const storedId = await SecureStore.getItemAsync("student_id");
      const storedKey = await SecureStore.getItemAsync("student_private_key");

      if (storedId && storedKey) {
        setState({
          isLoading: false,
          isRegistered: true,
          studentId: storedId,
          privateKey: storedKey,
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
      setState({
        isLoading: false,
        isRegistered: false,
        studentId: null,
        privateKey: null,
      });
    }
  }, []);

  useEffect(() => {
    checkCredentials();
  }, [checkCredentials]);

  // Permanently links credentials to isolated hardware partitions upon registration
  const saveCredentials = async (studentId: string, privateKeyBase64: string) => {
    await SecureStore.setItemAsync("student_id", studentId);
    await SecureStore.setItemAsync("student_private_key", privateKeyBase64);
    
    setState({
      isLoading: false,
      isRegistered: true,
      studentId,
      privateKey: privateKeyBase64,
    });
  };

  // Completely flushes storage records if a key revocation event triggers
  const clearCredentials = async () => {
    await SecureStore.deleteItemAsync("student_id");
    await SecureStore.deleteItemAsync("student_private_key");
    
    setState({
      isLoading: false,
      isRegistered: false,
      studentId: null,
      privateKey: null,
    });
  };

  return {
    ...state,
    saveCredentials,
    clearCredentials,
    refreshCredentials: checkCredentials,
  };
}