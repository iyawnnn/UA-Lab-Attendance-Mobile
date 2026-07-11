// src/services/api.ts

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export interface RegisterPayload {
  studentId: string;
  firstName: string;
  lastName: string;
  publicKey: string;
  recoveryPin: string;
}

export interface AttendancePayload {
  studentId: string;
  labRoom: string;
  timestamp: string;
  signature: string;
  roomPin: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  isRevoked?: boolean;
  data?: any;
}

export const AttendanceApiClient = {
  async registerStudent(payload: RegisterPayload): Promise<ApiResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/student/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: "Network request failed while registering device.",
      };
    }
  },

  async submitAttendance(payload: AttendancePayload): Promise<ApiResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/student/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: "Network request failed while submitting attendance.",
      };
    }
  },

  async fetchLabRooms(): Promise<ApiResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/student/rooms`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: "Network request failed while fetching laboratory facilities.",
      };
    }
  },

  async checkDeviceRevoked(studentId: string): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${BASE_URL}/api/student/check-status?studentId=${encodeURIComponent(studentId)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );
      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: "Network request failed while checking device status.",
      };
    }
  },

  async recoverDevice(studentId: string, pin: string, newPublicKey?: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/student/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, pin, newPublicKey }),
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: "Network request failed while recovering device.",
      };
    }
  },
};