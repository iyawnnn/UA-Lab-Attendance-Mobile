import { Platform } from "react-native";

// Resolve local emulator loopback boundaries cleanly
const getBackendUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  return Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
};

const BASE_URL = getBackendUrl();

export interface AttendancePayload {
  studentId: string;
  labRoom: string;
  timestamp: string;
  signature: string;
  roomPin: string;
}

export interface RegisterStudentPayload {
  idToken: string;
  studentId: string;
  firstName: string;
  lastName: string;
  publicKey: string;
  recoveryPin: string;
}

export interface RecoverStudentPayload {
  studentId: string;
  recoveryPin: string;
  newPin?: string;
  publicKey: string;
}

// Global exported namespace matching your exact mobile screen consumption patterns
export const AttendanceApiClient = {
  /**
   * Evaluates active device session token validity against database states.
   */
  checkDeviceRevoked: async (studentId: string, sessionToken: string, publicKey: string) => {
    try {
      const queryParams = new URLSearchParams({
        studentId,
        sessionToken,
        publicKey,
      });

      const targetUrl = `${BASE_URL}/api/student/check-status?${queryParams.toString()}`;
      console.log(`[API] Checking device revocation status: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "x-student-id": studentId,
          "x-session-token": sessionToken,
        },
      });

      if (response.status === 401) {
        console.warn("[API] Session shifted or revoked on backend. Triggering eviction.");
        return { revoked: true, isRevoked: true };
      }

      if (!response.ok) {
        return { success: false, revoked: false, error: `HTTP ${response.status}` };
      }

      return await response.json();
    } catch (error) {
      console.error("[API] Failed to contact check-status route:", error);
      return { revoked: false, isRevoked: false, error: "Offline or network context error handles" };
    }
  },

  /**
   * Dispatches a native Google identity token to the backend for verification.
   */
  googleAuthStudent: async (idToken: string) => {
    try {
      const endpoint = `${BASE_URL}/api/student/auth/google`;
      console.log(`[API] Dispatching Google ID Token to backend: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json();
      return {
        success: response.ok,
        ...data,
      };
    } catch (error) {
      console.error("[API] Error verifying Google Auth Token:", error);
      return { success: false, message: "Failed to connect to authentication server." };
    }
  },

  /**
   * Registers a student profile and registers their cryptographic public key bindings.
   */
  registerStudent: async (payload: RegisterStudentPayload) => {
    try {
      const endpoint = `${BASE_URL}/api/student/register`;
      console.log(`[API] Submitting onboarding profile configuration: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      return {
        success: response.ok,
        ...data,
      };
    } catch (error) {
      console.error("[API] Error during student registration onboarding:", error);
      return { success: false, message: "Failed to connect to profile registration server." };
    }
  },

  /**
   * FIX: Added dedicated recovery endpoint connector to support direct mobile key recovery requests.
   */
  recoverStudent: async (payload: RecoverStudentPayload) => {
    try {
      const endpoint = `${BASE_URL}/api/student/recover`;
      console.log(`[API] Submitting device hardware recovery handshake: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      return {
        success: response.ok,
        ...data,
      };
    } catch (error) {
      console.error("[API] Error during student profile device recovery:", error);
      return { success: false, message: "Failed to connect to account recovery server." };
    }
  },

  /**
   * Fetches active laboratory facilities from Next.js server.
   */
  fetchLabRooms: async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/student/rooms`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      
      // Safe fallback formatting prevents application data alert crashes if the tables are unseeded
      return { success: true, data: data.rooms || (Array.isArray(data) ? data : []) };
    } catch (error) {
      console.error("[API] Error fetching lab rooms:", error);
      return { success: false, data: [] };
    }
  },

  /**
   * Fetches historical check-in records for pagination mapping.
   */
  fetchStudentHistory: async (studentId: string) => {
    try {
      const response = await fetch(
        `${BASE_URL}/api/student/history?studentId=${encodeURIComponent(studentId)}`,
        {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("[API] Error loading history logs:", error);
      return { success: false, data: [] };
    }
  },

  /**
   * Submits geofenced cryptographically signed attendance payloads to backend.
   */
  submitAttendance: async (payload: AttendancePayload) => {
    try {
      const response = await fetch(`${BASE_URL}/api/student/attendance`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      return { success: response.ok, message: data.message || data.error };
    } catch (error) {
      console.error("[API] Error submitting attendance signature:", error);
      return { success: false, message: "Server connection lost during validation." };
    }
  },
};