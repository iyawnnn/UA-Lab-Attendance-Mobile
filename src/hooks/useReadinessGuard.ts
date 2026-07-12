// src/hooks/useReadinessGuard.ts

import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";
import { AppState } from "react-native";

export interface ReadinessState {
  isOnline: boolean;
  isGpsEnabled: boolean;
  hasLocationPermission: boolean;
  isChecking: boolean;
  requestLocationPermission: () => Promise<boolean>;
  checkReadiness: () => Promise<void>;
}

export function useReadinessGuard(): ReadinessState {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isGpsEnabled, setIsGpsEnabled] = useState<boolean>(true);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkReadiness = useCallback(async () => {
    setIsChecking(true);
    try {
      // 1. Check GPS Hardware Service status
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      setIsGpsEnabled(servicesEnabled);

      // 2. Check Foreground Location Permissions
      const perm = await Location.getForegroundPermissionsAsync();
      setHasLocationPermission(perm.granted);

      // 3. Verify Internet Connectivity via lightweight ping
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000";

        const response = await fetch(`${baseUrl}/api/student/rooms`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        setIsOnline(response.ok || response.status < 500);
      } catch (networkError) {
        setIsOnline(false);
      }
    } catch (err) {
      console.warn("Readiness check error:", err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setHasLocationPermission(granted);
      return granted;
    } catch (error) {
      console.warn("Location permission request error:", error);
      return false;
    }
  };

  useEffect(() => {
    checkReadiness();
    const interval = setInterval(checkReadiness, 4000);
    return () => clearInterval(interval);
  }, [checkReadiness]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkReadiness();
      }
    });

    return () => subscription.remove();
  }, [checkReadiness]);

  return {
    isOnline,
    isGpsEnabled,
    hasLocationPermission,
    isChecking,
    requestLocationPermission,
    checkReadiness,
  };
}