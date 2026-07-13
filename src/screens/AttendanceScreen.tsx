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
  AppState,
  RefreshControl
} from "react-native";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { Picker } from "@react-native-picker/picker";
import { signAttendancePayload } from "../utils/crypto";
import { AttendanceApiClient } from "../services/api";
import { useReadinessGuard } from "../hooks/useReadinessGuard";
import LocationDisclosureModal from "../components/LocationDisclosureModal";
import { styles } from "./AttendanceScreen.styles";

interface AttendanceScreenProps {
  studentId: string;
  privateKey: string;
  onRevoked: () => Promise<void>;
}

interface AttendanceRecord {
  id: number;
  student_id: string;
  timestamp: string;
  status: string;
  signature?: string;
  schedule?: {
    course_code: string;
    section: string;
    lab_room: string;
    schedule: string;
    date: string;
  };
}

export default function AttendanceScreen({ studentId, privateKey, onRevoked }: AttendanceScreenProps) {
  const {
    isOnline,
    isGpsEnabled,
    hasLocationPermission,
    requestLocationPermission,
  } = useReadinessGuard();

  const [activeTab, setActiveTab] = useState<"checkin" | "history">("checkin");

  const [labRooms, setLabRooms] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [roomPin, setRoomPin] = useState("");
  const [currentTimestamp, setCurrentTimestamp] = useState("");
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);

  const [historyLogs, setHistoryLogs] = useState<AttendanceRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false);

  const loadLabRoomsAndCheckStatus = useCallback(async () => {
    try {
      setIsLoadingRooms(true);

      const localPublicKey = await SecureStore.getItemAsync("student_public_key");
      const statusRes: any = await AttendanceApiClient.checkDeviceRevoked(studentId);

      const isKeyMismatched =
        statusRes?.currentPublicKey &&
        localPublicKey &&
        statusRes.currentPublicKey !== localPublicKey;

      if (statusRes?.isRevoked || isKeyMismatched) {
        Alert.alert(
          "Session Expired",
          "This device has been deauthorized or your account was authorized on another device. Please register or recover your account again.",
          [{ text: "OK", onPress: async () => await onRevoked() }]
        );
        return;
      }

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

  const fetchHistory = useCallback(async () => {
    if (!studentId) return;
    try {
      setIsLoadingHistory(true);
      const res = await AttendanceApiClient.fetchStudentHistory(studentId);
      if (res.success && Array.isArray(res.data)) {
        setHistoryLogs(res.data);
      }
    } catch (error) {
      console.warn("Error fetching history:", error);
    } finally {
      setIsLoadingHistory(false);
      setIsRefreshingHistory(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadLabRoomsAndCheckStatus();
  }, [loadLabRoomsAndCheckStatus]);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadLabRoomsAndCheckStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadLabRoomsAndCheckStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        loadLabRoomsAndCheckStatus();
        if (activeTab === "history") {
          fetchHistory();
        }
      }
    });

    return () => subscription.remove();
  }, [loadLabRoomsAndCheckStatus, activeTab, fetchHistory]);

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

  const handleLocationAccept = async () => {
    setShowLocationDisclosure(false);
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert(
        "Permission Denied",
        "Location permission is required to verify campus proximity during attendance submission."
      );
    }
  };

  const handleLogAttendance = async () => {
    if (!isOnline) {
      Alert.alert("Network Disconnected", "An active internet connection is required to submit cryptographic check-in.");
      return;
    }

    if (!isGpsEnabled) {
      Alert.alert("Location Services Disabled", "Please enable Location Services (GPS) in system settings.");
      return;
    }

    if (!hasLocationPermission) {
      setShowLocationDisclosure(true);
      return;
    }

    if (!selectedRoom || !roomPin) {
      Alert.alert("Missing Input", "Please select a room and enter the 4-digit session PIN.");
      return;
    }

    setIsSubmitting(true);

    try {
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
        fetchHistory();
      } else {
        Alert.alert("Check-In Denied", response.message);

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

  const isFormLock = !isOnline || !isGpsEnabled || !hasLocationPermission;

  const getButtonLabel = () => {
    if (isSubmitting) return "";
    if (!isOnline) return "REQUIRES INTERNET CONNECTION";
    if (!isGpsEnabled) return "ENABLE LOCATION SERVICES";
    if (!hasLocationPermission) return "ALLOW LOCATION ACCESS";
    return "SECURELY LOG ATTENDANCE";
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        activeTab === "history" ? (
          <RefreshControl
            refreshing={isRefreshingHistory}
            onRefresh={() => {
              setIsRefreshingHistory(true);
              fetchHistory();
            }}
          />
        ) : undefined
      }
    >
      <LocationDisclosureModal
        visible={showLocationDisclosure}
        onAccept={handleLocationAccept}
        onDecline={() => setShowLocationDisclosure(false)}
      />

      <View style={styles.statusHero}>
        <View style={styles.studentBadge}>
          <Text style={styles.studentBadgeText}>ID: {studentId}</Text>
        </View>
        <Text style={styles.heroTitle}>Student Portal</Text>
        <View style={styles.accentBar} />
        <Text style={styles.tagline}>Secure cryptographic validation mapping tracker.</Text>

        {/* Tab Segment Switcher */}
        <View style={styles.tabSegmentContainer}>
          <TouchableOpacity
            style={[
              styles.tabSegmentButton,
              activeTab === "checkin" && styles.tabSegmentActive,
            ]}
            onPress={() => setActiveTab("checkin")}
          >
            <Text
              style={[
                styles.tabSegmentText,
                activeTab === "checkin" && styles.tabSegmentTextActive,
              ]}
            >
              LOG CHECK-IN
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabSegmentButton,
              activeTab === "history" && styles.tabSegmentActive,
            ]}
            onPress={() => setActiveTab("history")}
          >
            <Text
              style={[
                styles.tabSegmentText,
                activeTab === "history" && styles.tabSegmentTextActive,
              ]}
            >
              ATTENDANCE HISTORY
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === "checkin" ? (
        <View style={styles.contentContainer}>
          <View style={styles.timeCard}>
            <View style={styles.timeDetails}>
              <Text style={styles.timeLabel}>Device Synced Time</Text>
              <Text style={styles.timeValue}>{currentTimestamp || "Synchronizing clocks..."}</Text>
            </View>
          </View>

          {/* Readiness Status Indicators */}
          <View style={styles.readinessContainer}>
            <View style={[styles.statusPill, isOnline ? styles.pillSuccess : styles.pillError]}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? "#059669" : "#DC2626" }]} />
              <Text style={[styles.pillText, { color: isOnline ? "#065F46" : "#991B1B" }]}>
                {isOnline ? "NETWORK CONNECTED" : "NETWORK DISCONNECTED"}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (!hasLocationPermission) {
                  setShowLocationDisclosure(true);
                }
              }}
              style={[
                styles.statusPill,
                isGpsEnabled && hasLocationPermission ? styles.pillSuccess : styles.pillWarning
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isGpsEnabled && hasLocationPermission ? "#059669" : "#D97706" }
                ]}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: isGpsEnabled && hasLocationPermission ? "#065F46" : "#92400E" }
                ]}
              >
                {!isGpsEnabled
                  ? "LOCATION DISABLED"
                  : !hasLocationPermission
                    ? "PERMISSION REQUIRED"
                    : "LOCATION ACTIVE"}
              </Text>
            </TouchableOpacity>
          </View>

          {isFormLock && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (!hasLocationPermission) {
                  setShowLocationDisclosure(true);
                }
              }}
              style={styles.readinessNotice}
            >
              <Text style={styles.readinessNoticeText}>
                {!isOnline
                  ? "An active internet connection is required to submit attendance."
                  : !isGpsEnabled
                    ? "Location services (GPS) are turned off in system settings."
                    : "Location permission is required for campus geofence validation. Tap to allow."}
              </Text>
            </TouchableOpacity>
          )}

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
            style={[
              styles.submitButton,
              (isSubmitting || isFormLock) && styles.submitButtonDisabled
            ]}
            onPress={handleLogAttendance}
            disabled={isSubmitting || isLoadingRooms}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{getButtonLabel()}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.revokeButton} onPress={handleDeviceRevocation}>
            <Text style={styles.revokeButtonText}>Deauthorize This Device</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          <Text style={styles.historyHeader}>Recent Attendance Logs</Text>

          {isLoadingHistory && !isRefreshingHistory ? (
            <ActivityIndicator size="large" color="#011B51" style={{ marginVertical: 32 }} />
          ) : historyLogs.length === 0 ? (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                No past attendance records found for this student ID.
              </Text>
            </View>
          ) : (
            historyLogs.map((log) => {
              const dateObj = new Date(log.timestamp);
              const formattedDate = dateObj.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const formattedTime = dateObj.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              });

              const isLate = log.status === "LATE";
              const isManual = log.signature && log.signature.includes("OVERRIDE");

              return (
                <View key={log.id} style={styles.historyCard}>
                  <View style={styles.historyRow}>
                    <Text style={styles.historyCourseText}>
                      {log.schedule?.course_code || "CLASS SESSION"} (Sec {log.schedule?.section || "N/A"})
                    </Text>
                    <View style={isLate ? styles.badgeLate : styles.badgeOnTime}>
                      <Text style={isLate ? styles.badgeLateText : styles.badgeOnTimeText}>
                        {isLate ? "LATE" : "ON TIME"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.historySubText}>
                    Facility: {log.schedule?.lab_room || "Laboratory"}
                  </Text>

                  {isManual && (
                    <View style={styles.badgeOverride}>
                      <Text style={styles.badgeOverrideText}>Manual Override</Text>
                    </View>
                  )}

                  <Text style={styles.historyDateText}>
                    {formattedDate} • {formattedTime}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}