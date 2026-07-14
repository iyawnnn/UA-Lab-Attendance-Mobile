const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export interface GoogleAuthResponse {
  success: boolean;
  message?: string;
  isRegistered?: boolean;
  sessionToken?: string;
  student?: {
    id: number;
    studentId: string;
    email: string;
    firstName: string;
    lastName: string;
    publicKey: string;
  };
  googleProfile?: {
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface RegisterPayload {
  idToken: string;
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
  sessionToken?: string;
  student?: any;
}

export const AttendanceApiClient = {
  /* Authenticate Google ID token with Next.js backend */
  async googleAuthStudent(idToken: string): Promise<GoogleAuthResponse> {
    try {
      const response = await fetch(`${BASE_URL}/api/student/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: "Network request failed during Google authentication.",
      };
    }
  },

  /* Register first-time student profile and bind ECDSA key pair */
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

  async fetchStudentHistory(studentId: string): Promise<ApiResponse> {
    try {
      const response = await fetch(
        `${BASE_URL}/api/student/history?studentId=${encodeURIComponent(studentId)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );
      return await response.json();
    } catch (error) {
      return {
        success: false,
        message: "Network request failed while fetching attendance history.",
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
};