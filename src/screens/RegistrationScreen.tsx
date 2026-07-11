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

  const handleRegister = async () => {
    if (!studentId || !firstName || !lastName || !recoveryPin) {
      Alert.alert("Missing Parameters", "Please fill out all identification fields.");
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
        studentId,
        firstName,
        lastName,
        publicKey: keyPair.publicKeyBase64,
        recoveryPin,
      });

      if (response.success) {
        Alert.alert("Success", "Device registered successfully!");
        await onRegistrationSuccess(studentId, keyPair.privateKeyBase64);
      } else {
        if (response.message.includes("already registered")) {
          Alert.alert(
            "Device Already Registered",
            "This Student ID is already linked to a device. Would you like to recover and link this current phone?",
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Recover Account", 
                onPress: () => setIsRecoveryMode(true) 
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
    if (!studentId || !recoveryPin) {
      Alert.alert("Missing Parameters", "Please enter your Student ID and 4-digit Security PIN.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Generate a fresh key pair for this phone
      const keyPair = generateDeviceKeyPair();

      // 2. Unlink old device and register new public key in one step
      const recoveryResponse = await AttendanceApiClient.recoverDevice(
        studentId, 
        recoveryPin, 
        keyPair.publicKeyBase64
      );

      if (recoveryResponse.success) {
        Alert.alert("Device Recovered", "Your account has been successfully transferred to this device!");
        await onRegistrationSuccess(studentId, keyPair.privateKeyBase64);
      } else {
        Alert.alert("Recovery Failed", recoveryResponse.message);
      }
    } catch (error) {
      Alert.alert("Network Failure", "Unable to complete recovery request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.brandHero}>
        <Text style={styles.heroTitle}>Student</Text>
        <Text style={styles.heroSubTitle}>Lab Attendance System</Text>
        <View style={styles.accentBar} />
        <Text style={styles.tagline}>
          {isRecoveryMode 
            ? "Transfer authorization to this device using your Security PIN." 
            : "One-time setup for secure verification tracking."}
        </Text>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.sectionHeading}>
          {isRecoveryMode ? "Recover Device" : "Register Device"}
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Student ID</Text>
          <TextInput 
            style={styles.input} 
            placeholder="e.g. 2024-1234" 
            placeholderTextColor="#94A3B8"
            value={studentId}
            onChangeText={setStudentId}
            autoCapitalize="characters"
          />
        </View>

        {!isRecoveryMode && (
          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>First Name</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Jane" 
                placeholderTextColor="#94A3B8"
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Doe" 
                placeholderTextColor="#94A3B8"
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Security PIN</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Enter 4-Digit PIN" 
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
              {isRecoveryMode ? "RECOVER & LINK DEVICE" : "REGISTER DEVICE"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={{ alignSelf: "center", marginTop: 20, marginBottom: 24 }} 
          onPress={() => setIsRecoveryMode(!isRecoveryMode)}
        >
          <Text style={{ color: "#011B51", fontWeight: "600", fontSize: 13 }}>
            {isRecoveryMode 
              ? "← Return to New Device Registration" 
              : "Already registered on another device? Recover Account"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}