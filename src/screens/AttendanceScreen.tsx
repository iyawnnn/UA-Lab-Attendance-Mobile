// src/screens/AttendanceScreen.tsx

import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
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

  useEffect(() => {
    async function loadInitialData() {
      try {
        const response = await AttendanceApiClient.fetchLabRooms();
        if (response.success && Array.isArray(response.data)) {
          setLabRooms(response.data);
        } else {
          Alert.alert("Data Error", "Could not fetch laboratory facilities.");
        }
      } catch (error) {
        Alert.alert("Network Error", "Failed to communicate with facility registry server.");
      } finally {
        setIsLoadingRooms(false);
      }
    }
    loadInitialData();
  }, []);

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

        if (response.message?.includes("DEVICE_REVOKED") || response.message?.includes("not found")) {
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
          <Text style={styles.label}>Facility Selection</Text>
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