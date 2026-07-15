import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";
import { AppState } from "react-native";

export interface ReadinessState {
  isOnline: boolean;
  isGpsEnabled: boolean;
  hasLocationPermission: boolean;
  isChecking: boolean;
  isInCampus: boolean;
  requestLocationPermission: () => Promise<boolean>;
  checkReadiness: () => Promise<void>;
}

const CAMPUS_LAT = parseFloat(process.env.EXPO_PUBLIC_CAMPUS_LAT || "15.036950");
const CAMPUS_LNG = parseFloat(process.env.EXPO_PUBLIC_CAMPUS_LNG || "120.697467");
const GEOFENCE_RADIUS = parseFloat(process.env.EXPO_PUBLIC_GEOFENCE_RADIUS_METERS || "65");

function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function useReadinessGuard(): ReadinessState {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isGpsEnabled, setIsGpsEnabled] = useState<boolean>(true);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isInCampus, setIsInCampus] = useState<boolean>(false);

  const checkReadiness = useCallback(async () => {
    setIsChecking(true);
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      setIsGpsEnabled(servicesEnabled);

      const perm = await Location.getForegroundPermissionsAsync();
      setHasLocationPermission(perm.granted);

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

      if (servicesEnabled && perm.granted) {
        // High accuracy forces the emulator to look for raw GPS mock parameters
        const activeLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (activeLocation?.coords) {
          const { latitude, longitude } = activeLocation.coords;
          const distance = getDistanceInMeters(latitude, longitude, CAMPUS_LAT, CAMPUS_LNG);
          
          // Debug logs to see exactly what coordinates are being evaluated on each interval
          console.log(
            `[GPS DEBUG] Coords: (${latitude.toFixed(6)}, ${longitude.toFixed(6)}) | ` +
            `Distance: ${distance.toFixed(1)}m | ` +
            `Target Radius: ${GEOFENCE_RADIUS}m | ` +
            `Status: ${distance <= GEOFENCE_RADIUS ? "IN CAMPUS" : "OUTSIDE CAMPUS"}`
          );

          setIsInCampus(distance <= GEOFENCE_RADIUS);
        }
      } else {
        setIsInCampus(false);
      }
    } catch (err) {
      console.warn("Readiness check error during location poll:", err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setHasLocationPermission(granted);
      if (granted) {
        await checkReadiness();
      }
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
    isInCampus,
    requestLocationPermission,
    checkReadiness,
  };
}