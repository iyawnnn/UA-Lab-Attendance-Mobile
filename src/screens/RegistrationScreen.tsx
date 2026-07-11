// src/screens/RegistrationScreen.tsx

import React, { useState } from "react";
import { 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert 
} from "react-native";
import { generateDeviceKeyPair } from "../utils/crypto";
import { AttendanceApiClient } from "../services/api";
import { styles } from "./RegistrationScreen.styles";

interface RegistrationScreenProps {
  onRegistrationSuccess: (studentId: string, privateKeyBase64: string) => Promise<void>;
}

export default function RegistrationScreen({ onRegistrationSuccess }: RegistrationScreenProps) {
  const [studentId, setStudentId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [recoveryPin, setRecoveryPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isNameLocked, setIsNameLocked] = useState(false);

  const handleIdCheck = async () => {
    if (studentId.trim().length >= 4 && !isNameLocked && !isRecoveryMode) {
      try {
        const res: any = await AttendanceApiClient.checkDeviceRevoked(studentId.trim());
        const fetchedFirstName = res?.firstName || res?.first_name;
        const fetchedLastName = res?.lastName || res?.last_name;

        if (res?.isRevoked && fetchedFirstName) {
          setFirstName(fetchedFirstName);
          setLastName(fetchedLastName || "");
          setIsNameLocked(true);
        }
      } catch (err) {
        console.warn("Silent ID check error:", err);
      }
    }
  };

  const handleRegister = async () => {
    const activeStudentId = studentId.trim();
    const activeFirstName = firstName.trim() || "Student";
    const activeLastName = lastName.trim() || "User";

    if (!activeStudentId || !recoveryPin) {
      Alert.alert("Missing Parameters", "Please enter your Student ID and 4-digit Security PIN.");
      return;
    }

    if (recoveryPin.length !== 4 || isNaN(Number(recoveryPin))) {
      Alert.alert("Invalid PIN", "Security PIN must be exactly 4 digits.");
      return;
    }

    setIsSubmitting(true);

    try {
      const keyPair = generateDeviceKeyPair();

      const response = await AttendanceApiClient.registerStudent({
        studentId: activeStudentId,
        firstName: activeFirstName,
        lastName: activeLastName,
        publicKey: keyPair.publicKeyBase64,
        recoveryPin,
      });

      if (response.success) {
        Alert.alert("Success", response.message || "Device registered successfully!");
        await onRegistrationSuccess(activeStudentId, keyPair.privateKeyBase64);
      } else {
        if (response.message && response.message.toLowerCase().includes("already registered")) {
          Alert.alert(
            "Device Already Registered",
            "This Student ID is currently linked to an active device. Would you like to recover and transfer authorization to this phone?",
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Recover Account", 
                onPress: () => {
                  setIsRecoveryMode(true);
                  setRecoveryPin("");
                } 
              }
            ]
          );
        } else {
          Alert.alert("Registration Denied", response.message);
        }
      }
    } catch (error) {
      Alert.alert("Network Failure", "Unable to connect to the authentication servers.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverDevice = async () => {
    const activeStudentId = studentId.trim();

    if (!activeStudentId || !recoveryPin) {
      Alert.alert("Missing Parameters", "Please enter your Student ID and 4-digit Security PIN.");
      return;
    }

    if (recoveryPin.length !== 4 || isNaN(Number(recoveryPin))) {
      Alert.alert("Invalid PIN", "Security PIN must be exactly 4 digits.");
      return;
    }

    setIsSubmitting(true);

    try {
      const recoveryResponse = await AttendanceApiClient.recoverDevice(activeStudentId, recoveryPin);

      if (!recoveryResponse.success) {
        Alert.alert("Recovery Failed", recoveryResponse.message);
        setIsSubmitting(false);
        return;
      }

      const statusRes: any = await AttendanceApiClient.checkDeviceRevoked(activeStudentId);
      const fetchedFirstName = statusRes?.firstName || statusRes?.first_name;
      const fetchedLastName = statusRes?.lastName || statusRes?.last_name;

      if (fetchedFirstName) {
        setFirstName(fetchedFirstName);
        setLastName(fetchedLastName || "");
      }

      setIsNameLocked(true);
      setIsRecoveryMode(false);
      setRecoveryPin("");

      Alert.alert(
        "Old Device Revoked",
        `Account verified for ${fetchedFirstName || "Student"}. Old device access revoked. Please enter a new 4-digit Security PIN to register this phone.`
      );
    } catch (error) {
      Alert.alert("Network Failure", "Unable to complete recovery request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearLockedAccount = () => {
    setIsNameLocked(false);
    setStudentId("");
    setFirstName("");
    setLastName("");
    setRecoveryPin("");
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.brandHero}>
        <Text style={styles.heroTitle}>Student</Text>
        <Text style={styles.heroSubTitle}>Lab Attendance System</Text>
        <View style={styles.accentBar} />
        <Text style={styles.tagline}>
          {isRecoveryMode 
            ? "Revoke old device access using your 4-digit Security PIN." 
            : isNameLocked 
              ? "Account verified. Set a new Security PIN for this device."
              : "One-time setup for secure verification tracking."}
        </Text>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.sectionHeading}>
          {isRecoveryMode ? "Device Recovery" : "Register Device"}
        </Text>

        {isNameLocked && !isRecoveryMode && (
          <View style={{ backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", borderWidth: 1, padding: 12, borderRadius: 10, marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#1E40AF" }}>
              Account Found: {firstName} {lastName}
            </Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Student ID</Text>
          <TextInput 
            style={[styles.input, isNameLocked && !isRecoveryMode && { backgroundColor: "#F1F5F9", color: "#64748B" }]} 
            placeholder="e.g. 2024-1234" 
            placeholderTextColor="#94A3B8"
            value={studentId}
            onChangeText={setStudentId}
            onBlur={handleIdCheck}
            editable={!isNameLocked || isRecoveryMode}
            autoCapitalize="characters"
          />
        </View>

        {!isRecoveryMode && (
          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>First Name</Text>
              <TextInput 
                style={[styles.input, isNameLocked && { backgroundColor: "#F1F5F9", color: "#334155", fontWeight: "700" }]} 
                placeholder="Jane" 
                placeholderTextColor="#94A3B8"
                value={firstName}
                onChangeText={setFirstName}
                editable={!isNameLocked}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput 
                style={[styles.input, isNameLocked && { backgroundColor: "#F1F5F9", color: "#334155", fontWeight: "700" }]} 
                placeholder="Doe" 
                placeholderTextColor="#94A3B8"
                value={lastName}
                onChangeText={setLastName}
                editable={!isNameLocked}
              />
            </View>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {isRecoveryMode ? "Current Security PIN" : isNameLocked ? "New Security PIN" : "Security PIN"}
          </Text>
          <TextInput 
            style={styles.input} 
            placeholder={isRecoveryMode ? "Enter 4-Digit PIN" : "Create 4-Digit PIN"} 
            placeholderTextColor="#94A3B8"
            maxLength={4}
            secureTextEntry
            keyboardType="number-pad"
            value={recoveryPin}
            onChangeText={setRecoveryPin}
          />
        </View>

        <TouchableOpacity 
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} 
          onPress={isRecoveryMode ? handleRecoverDevice : handleRegister}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {isRecoveryMode ? "REVOKE OLD DEVICE" : "REGISTER DEVICE"}
            </Text>
          )}
        </TouchableOpacity>

        {isNameLocked && !isRecoveryMode ? (
          <TouchableOpacity 
            style={{ alignSelf: "center", marginTop: 20, marginBottom: 24 }} 
            onPress={handleClearLockedAccount}
          >
            <Text style={{ color: "#64748B", fontWeight: "600", fontSize: 13 }}>
              Not your account? Clear and try again
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={{ alignSelf: "center", marginTop: 20, marginBottom: 24 }} 
            onPress={() => {
              setIsRecoveryMode(!isRecoveryMode);
              setRecoveryPin("");
            }}
          >
            <Text style={{ color: "#011B51", fontWeight: "600", fontSize: 13 }}>
              {isRecoveryMode 
                ? "← Return to New Device Registration" 
                : "Already registered on another device? Recover Account"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}