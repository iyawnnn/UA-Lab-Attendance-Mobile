// src/screens/AttendanceScreen.tsx

import React, { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState
} from "react-native";
import * as Location from "expo-location";
import { Picker } from "@react-native-picker/picker";
import { signAttendancePayload } from "../utils/crypto";
import { AttendanceApiClient } from "../services/api";
import { styles } from "./AttendanceScreen.styles";

interface AttendanceScreenProps {
  studentId: string;
  privateKey: string;
  onRevoked: () => Promise<void>;
}

export default function AttendanceScreen({ studentId, privateKey, onRevoked }: AttendanceScreenProps) {
  const [labRooms, setLabRooms] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [roomPin, setRoomPin] = useState("");
  const [currentTimestamp, setCurrentTimestamp] = useState("");
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Background Revocation Check & Active Room Fetch
  const loadLabRoomsAndCheckStatus = useCallback(async () => {
    try {
      setIsLoadingRooms(true);

      // 1. Silent revocation & key-transfer verification
      const statusRes = await AttendanceApiClient.checkDeviceRevoked(studentId);
      if (statusRes.success && statusRes.isRevoked) {
        Alert.alert(
          "Session Expired",
          "This device has been deauthorized or your account was authorized on another device. Please register or recover your account again.",
          [{ text: "OK", onPress: async () => await onRevoked() }]
        );
        return;
      }

      // 2. Fetch active facilities
      const response = await AttendanceApiClient.fetchLabRooms();
      if (response.success && Array.isArray(response.data)) {
        setLabRooms(response.data);
      } else {
        Alert.alert("Data Error", "Could not fetch laboratory facilities.");
      }
    } catch (error) {
      console.warn("Network Error during background check:", error);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [studentId, onRevoked]);

  // Initial load
  useEffect(() => {
    loadLabRoomsAndCheckStatus();
  }, [loadLabRoomsAndCheckStatus]);

  // Real-time background session validation every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadLabRoomsAndCheckStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadLabRoomsAndCheckStatus]);

  // Instant re-verification whenever the student re-opens or switches back to the app
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        loadLabRoomsAndCheckStatus();
      }
    });

    return () => subscription.remove();
  }, [loadLabRoomsAndCheckStatus]);

  // Clock tick
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTimestamp(
        now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
        " • " +
        now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogAttendance = async () => {
    if (!selectedRoom || !roomPin) {
      Alert.alert("Missing Input", "Please select a room and enter the 4-digit session PIN.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location access is required to verify proximity.");
        setIsSubmitting(false);
        return;
      }

      await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const timestampISO = new Date().toISOString();
      const messageToSign = `${studentId}-${selectedRoom}-${timestampISO}`;
      const signatureBase64 = signAttendancePayload(messageToSign, privateKey);

      const response = await AttendanceApiClient.submitAttendance({
        studentId,
        labRoom: selectedRoom,
        timestamp: timestampISO,
        signature: signatureBase64,
        roomPin,
      });

      if (response.success) {
        Alert.alert("Attendance Logged", response.message);
        setRoomPin("");
      } else {
        Alert.alert("Check-In Denied", response.message);

        // Auto-logout if signature or device key validation fails
        const isSecurityOrRevocationError =
          response.message?.includes("DEVICE_REVOKED") ||
          response.message?.includes("not found") ||
          response.message?.includes("signature") ||
          response.message?.includes("Security verification");

        if (isSecurityOrRevocationError) {
          await onRevoked();
        }
      }
    } catch (error: any) {
      console.error("Attendance Submission Error:", error);

      let friendlyMessage = "An unexpected error occurred during verification.";
      if (error?.message?.includes("Network") || error?.message?.includes("fetch")) {
        friendlyMessage = "Unable to connect to the server. Please check your internet connection.";
      } else if (error?.message?.includes("Location")) {
        friendlyMessage = "Could not retrieve GPS coordinates. Please verify location services are enabled on your phone.";
      } else if (error?.message) {
        friendlyMessage = error.message;
      }

      Alert.alert("Verification Error", friendlyMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeviceRevocation = () => {
    Alert.alert(
      "Confirm Revocation",
      "Are you sure you want to remove authorization for this device?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            await onRevoked();
          }
        }
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.statusHero}>
        <View style={styles.studentBadge}>
          <Text style={styles.studentBadgeText}>ID: {studentId}</Text>
        </View>
        <Text style={styles.heroTitle}>Log Attendance</Text>
        <View style={styles.accentBar} />
        <Text style={styles.tagline}>Secure cryptographic validation mapping tracker.</Text>
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.timeCard}>
          <View style={styles.timeDetails}>
            <Text style={styles.timeLabel}>Device Synced Time</Text>
            <Text style={styles.timeValue}>{currentTimestamp || "Synchronizing clocks..."}</Text>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={styles.label}>Facility Selection</Text>
            <TouchableOpacity onPress={loadLabRoomsAndCheckStatus} disabled={isLoadingRooms}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#011B51" }}>
                {isLoadingRooms ? "Refreshing..." : "Refresh Rooms"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.pickerContainer}>
            {isLoadingRooms ? (
              <ActivityIndicator size="small" color="#011B51" style={{ padding: 14 }} />
            ) : (
              <Picker
                selectedValue={selectedRoom}
                onValueChange={(itemValue) => setSelectedRoom(itemValue)}
                style={styles.picker}
              >
                <Picker.Item label="Select lab room..." value="" />
                {labRooms.map((room, index) => (
                  <Picker.Item key={index} label={room} value={room} />
                ))}
              </Picker>
            )}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Room PIN</Text>
          <TextInput
            style={styles.pinInput}
            placeholder="0000"
            placeholderTextColor="#94A3B8"
            maxLength={4}
            keyboardType="number-pad"
            value={roomPin}
            onChangeText={(val) => setRoomPin(val.replace(/\D/g, ""))}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleLogAttendance}
          disabled={isSubmitting || isLoadingRooms}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>SECURELY LOG ATTENDANCE</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.revokeButton} onPress={handleDeviceRevocation}>
          <Text style={styles.revokeButtonText}>Deauthorize This Device</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}