// src/hooks/useAuthStorage.ts

import { useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

export interface AuthState {
  isLoading: boolean;
  isRegistered: boolean;
  studentId: string | null;
  privateKey: string | null;
  publicKey: string | null;
}

export function useAuthStorage() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isRegistered: false,
    studentId: null,
    privateKey: null,
    publicKey: null,
  });

  const checkCredentials = useCallback(async () => {
    try {
      const storedId = await SecureStore.getItemAsync("student_id");
      const storedPrivateKey = await SecureStore.getItemAsync("student_private_key");
      const storedPublicKey = await SecureStore.getItemAsync("student_public_key");

      if (storedId && storedPrivateKey) {
        setState({
          isLoading: false,
          isRegistered: true,
          studentId: storedId,
          privateKey: storedPrivateKey,
          publicKey: storedPublicKey,
        });
      } else {
        setState({
          isLoading: false,
          isRegistered: false,
          studentId: null,
          privateKey: null,
          publicKey: null,
        });
      }
    } catch (error) {
      setState({
        isLoading: false,
        isRegistered: false,
        studentId: null,
        privateKey: null,
        publicKey: null,
      });
    }
  }, []);

  useEffect(() => {
    checkCredentials();
  }, [checkCredentials]);

  const saveCredentials = async (studentId: string, privateKeyBase64: string, publicKeyBase64: string) => {
    await SecureStore.setItemAsync("student_id", studentId);
    await SecureStore.setItemAsync("student_private_key", privateKeyBase64);
    await SecureStore.setItemAsync("student_public_key", publicKeyBase64);
    
    setState({
      isLoading: false,
      isRegistered: true,
      studentId,
      privateKey: privateKeyBase64,
      publicKey: publicKeyBase64,
    });
  };

  const clearCredentials = async () => {
    await SecureStore.deleteItemAsync("student_id");
    await SecureStore.deleteItemAsync("student_private_key");
    await SecureStore.deleteItemAsync("student_public_key");
    
    setState({
      isLoading: false,
      isRegistered: false,
      studentId: null,
      privateKey: null,
      publicKey: null,
    });
  };

  return {
    ...state,
    saveCredentials,
    clearCredentials,
    refreshCredentials: checkCredentials,
  };
}