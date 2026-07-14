import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as SecureStore from "expo-secure-store";
import { generateDeviceKeyPair } from "../utils/crypto";
import { AttendanceApiClient } from "../services/api";
import { styles } from "./RegistrationScreen.styles";

interface RegistrationScreenProps {
  onRegistrationSuccess: (
    studentId: string,
    email: string,
    sessionToken: string,
    privateKeyBase64: string,
    publicKeyBase64: string
  ) => Promise<void>;
}

export default function RegistrationScreen({
  onRegistrationSuccess,
}: RegistrationScreenProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Multi-view tracker expanded to include the two separate recovery steps
  const [currentView, setCurrentView] = useState<"login" | "onboarding" | "recovery_verify" | "recovery_set_pin">("login");

  const [googleIdToken, setGoogleIdToken] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [recoveryPin, setRecoveryPin] = useState("");
  const [newRecoveryPin, setNewRecoveryPin] = useState(""); // Track replacement PIN selection

  // Temporary local state cache to carry credentials between step 1 and step 2
  const [cachedSessionToken, setCachedSessionToken] = useState("");
  const [cachedPrivateKey, setCachedPrivateKey] = useState("");
  const [cachedPublicKey, setCachedPublicKey] = useState("");

  /* Binds the web client ID to validate backend token audience */
  useEffect(() => {
    try {
      if (GoogleSignin && typeof GoogleSignin.configure === "function") {
        GoogleSignin.configure({
          webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
          offlineAccess: false,
        });
      }
    } catch (error) {
      console.warn("GoogleSignin configuration warning:", error);
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    try {
      if (!GoogleSignin || typeof GoogleSignin.hasPlayServices !== "function") {
        Alert.alert(
          "Environment Error",
          "Google Sign-In requires native client context. Launch using the built app binary."
        );
        setIsSubmitting(false);
        return;
      }

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      try {
        await GoogleSignin.signOut();
      } catch (signOutError) {
        /* Safe to ignore if no previous session exists */
      }

      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;

      if (idToken) {
        await handleGoogleAuthentication(idToken);
      } else {
        Alert.alert("Authentication Error", "Failed to retrieve Google ID token.");
        setIsSubmitting(false);
      }
    } catch (error: any) {
      setIsSubmitting(false);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }
      if (error.code === statusCodes.IN_PROGRESS) {
        return;
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert("Error", "Google Play Services are unavailable on this device.");
        return;
      }
      console.error("Native Google Sign-In Error:", error);
      Alert.alert("Error", "Google authentication failed.");
    }
  };

  const handleGoogleAuthentication = async (idToken: string) => {
    setIsSubmitting(true);
    setGoogleIdToken(idToken);

    try {
      const authResult = await AttendanceApiClient.googleAuthStudent(idToken);

      if (!authResult.success) {
        Alert.alert("Access Denied", authResult.message || "Authentication rejected.");
        setIsSubmitting(false);
        return;
      }

      if (authResult.isRegistered && authResult.studentId && authResult.sessionToken) {
        let currentPrivateKey = await SecureStore.getItemAsync("student_private_key");
        let currentPublicKey = await SecureStore.getItemAsync("student_public_key");

        const dbPublicKey = authResult.publicKey;

        const isKeyMismatched = 
          dbPublicKey && 
          currentPublicKey && 
          currentPublicKey !== dbPublicKey;

        // Secure Transfer Routing: Pre-populates identification profiles without dropping context
        if (!currentPrivateKey || !currentPublicKey || isKeyMismatched) {
          console.warn("[SECURITY] Hardware key mismatch or missing context. Routing to recovery view entry validation layout.");
          setGoogleEmail(authResult.email || "");
          setStudentId(authResult.studentId || "");
          setFirstName(authResult.firstName || "");
          setLastName(authResult.lastName || "");
          setCurrentView("recovery_verify");
          
          Alert.alert(
            "Device Re-authorization Required",
            "This account is active on another device. Please provide your 6-digit Recovery PIN to bind this phone."
          );
          setIsSubmitting(false);
          return;
        }

        await onRegistrationSuccess(
          authResult.studentId,
          authResult.email,
          authResult.sessionToken,
          currentPrivateKey,
          currentPublicKey
        );
        return;
      }

      if (!authResult.isRegistered) {
        setGoogleEmail(authResult.email || "");
        setFirstName(authResult.firstName || "");
        setLastName(authResult.lastName || "");
        setCurrentView("onboarding");
      }
    } catch (error) {
      Alert.alert("Network Error", "Failed to reach authentication backend.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    const activeStudentId = studentId.trim();
    const activePin = recoveryPin.trim();

    if (!activeStudentId || !activePin) {
      Alert.alert("Missing Input", "Please provide your Student ID and 6-digit Recovery PIN.");
      return;
    }

    if (activePin.length !== 6 || isNaN(Number(activePin))) {
      Alert.alert("Invalid Input", "Recovery PIN must consist of 6 numeric digits.");
      return;
    }

    setIsSubmitting(true);

    try {
      const keyPair = generateDeviceKeyPair();

      const regResult = await AttendanceApiClient.registerStudent({
        idToken: googleIdToken,
        studentId: activeStudentId,
        firstName,
        lastName,
        publicKey: keyPair.publicKeyBase64,
        recoveryPin: activePin,
      });

      if (regResult.success && regResult.sessionToken) {
        Alert.alert("Registration Complete", regResult.message);
        await onRegistrationSuccess(
          activeStudentId,
          googleEmail,
          regResult.sessionToken,
          keyPair.privateKeyBase64,
          keyPair.publicKeyBase64
        );
      } else {
        Alert.alert("Registration Failed", regResult.message || "Unable to register device.");
      }
    } catch (error) {
      Alert.alert("Error", "Server error encountered during onboarding.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoveryStep1Verify = async () => {
    const activeStudentId = studentId.trim();
    const activePin = recoveryPin.trim();

    if (!activeStudentId || !activePin) {
      Alert.alert("Missing Input", "Please enter your Student ID and 6-digit Recovery PIN.");
      return;
    }

    if (activePin.length !== 6 || isNaN(Number(activePin))) {
      Alert.alert("Invalid Input", "Recovery PIN must consist of 6 numeric digits.");
      return;
    }

    setIsSubmitting(true);

    try {
      const keyPair = generateDeviceKeyPair();

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/student/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: activeStudentId,
          recoveryPin: activePin,
          publicKey: keyPair.publicKeyBase64,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.sessionToken) {
        // Cache hardware credentials locally to prepare for step 2 setup confirmation processing
        setCachedSessionToken(data.sessionToken);
        setCachedPrivateKey(keyPair.privateKeyBase64);
        setCachedPublicKey(keyPair.publicKeyBase64);
        
        if (data.email) setGoogleEmail(data.email);
        if (data.firstName) setFirstName(data.firstName);
        if (data.lastName) setLastName(data.lastName);

        Alert.alert(
          "Device Transferred", 
          "Previous active terminal session successfully evicted! Let's update your Recovery PIN credentials next."
        );
        setCurrentView("recovery_set_pin"); // Route smoothly to the read-only profile update form setup layout
      } else {
        Alert.alert("Recovery Failed", data.message || "Incorrect Recovery PIN or Student ID.");
      }
    } catch (error) {
      Alert.alert("Error", "Server error encountered during recovery handshake step 1 verification.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 🔥 Multi-Step Recovery Phase 2: Commits the new or current PIN change configuration parameters
  const handleRecoveryStep2CommitPin = async () => {
    const activeStudentId = studentId.trim();
    const targetPin = newRecoveryPin.trim();

    if (!targetPin || targetPin.length !== 6 || isNaN(Number(targetPin))) {
      Alert.alert("Invalid Input", "Recovery PIN setup must consist of exactly 6 numeric digits.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/student/update-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: activeStudentId,
          newPin: targetPin,
          sessionToken: cachedSessionToken,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert("Success", "Account recovery finalized. New hardware terminal successfully bound.");
        await onRegistrationSuccess(
          activeStudentId,
          googleEmail || "UA Student",
          cachedSessionToken,
          cachedPrivateKey,
          cachedPublicKey
        );
      } else {
        Alert.alert("Error", data.message || "Failed to finalize profile PIN configuration updates.");
      }
    } catch (error) {
      Alert.alert("Error", "Server error encountered while saving recovery PIN updates.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.brandHero}>
        <Text style={styles.heroTitle}>Student</Text>
        <Text style={styles.heroSubTitle}>Lab Attendance System</Text>
        <View style={styles.accentBar} />
        <Text style={styles.tagline}>
          {currentView === "onboarding"
            ? "Complete one-time student profile onboarding."
            : currentView === "recovery_verify" || currentView === "recovery_set_pin"
              ? "Re-authorize this hardware device terminal binding."
              : "Sign in with your institutional Google account."}
        </Text>
      </View>

      <View style={styles.formContainer}>
        {currentView === "login" && (
          <>
            <Text style={styles.sectionHeading}>Institutional Login</Text>
            <Text style={styles.sectionSubHeading}>
              Please authenticate using your official @ua.edu.ph institutional email.
            </Text>

            <TouchableOpacity
              style={[
                styles.googleButton,
                isSubmitting && styles.googleButtonDisabled,
              ]}
              disabled={isSubmitting}
              onPress={handleGoogleSignIn}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.googleButtonText}>Sign In with Google SSO</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                setStudentId("");
                setRecoveryPin("");
                setNewRecoveryPin("");
                setCurrentView("recovery_verify");
              }}
            >
              <Text style={styles.secondaryButtonText}>
                Recover / Transfer Device Account
              </Text>
            </TouchableOpacity>

            <View style={styles.domainNotice}>
              <Text style={styles.domainNoticeText}>
                Access is strictly restricted to valid @ua.edu.ph accounts.
              </Text>
            </View>
          </>
        )}

        {currentView === "onboarding" && (
          <>
            <Text style={styles.sectionHeading}>One-Time Profile Setup</Text>
            <Text style={styles.sectionSubHeading}>
              Bind your Student ID and hardware key to complete onboarding.
            </Text>

            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeTitle}>Authenticated Email</Text>
              <Text style={styles.profileBadgeText}>{googleEmail}</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Student ID</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 2023001839"
                placeholderTextColor="#94A3B8"
                value={studentId}
                onChangeText={setStudentId}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={firstName}
                  editable={false}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={lastName}
                  editable={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Recovery PIN (6 Digits)</Text>
              <TextInput
                style={styles.input}
                placeholder="Create 6-Digit PIN"
                placeholderTextColor="#94A3B8"
                maxLength={6}
                secureTextEntry
                keyboardType="number-pad"
                value={recoveryPin}
                onChangeText={setRecoveryPin}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                isSubmitting && styles.submitButtonDisabled,
              ]}
              onPress={handleCompleteOnboarding}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>COMPLETE SETUP & REGISTER</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setCurrentView("login")}
            >
              <Text style={styles.secondaryButtonText}>
                ← Cancel and Switch Account
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Recovery Phase 1 view block: Requests credentials to verify identity and trigger active remote logout */}
        {currentView === "recovery_verify" && (
          <>
            <Text style={styles.sectionHeading}>Device Authorization Transfer</Text>
            <Text style={styles.sectionSubHeading}>
              Provide your credentials to authenticate and clear previous active sessions.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Student ID</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Student ID"
                placeholderTextColor="#94A3B8"
                value={studentId}
                onChangeText={setStudentId}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Current Recovery PIN (6 Digits)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Current 6-Digit PIN"
                placeholderTextColor="#94A3B8"
                maxLength={6}
                secureTextEntry
                keyboardType="number-pad"
                value={recoveryPin}
                onChangeText={setRecoveryPin}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                isSubmitting && styles.submitButtonDisabled,
              ]}
              onPress={handleRecoveryStep1Verify}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>VERIFY & EVICT PREVIOUS TERMINAL</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setCurrentView("login")}
            >
              <Text style={styles.secondaryButtonText}>
                ← Back to Institutional Login
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* 🔥 Recovery Phase 2 view block: Personal profile identities are strictly locked down / read-only. Only the PIN can be customized */}
        {currentView === "recovery_set_pin" && (
          <>
            <Text style={styles.sectionHeading}>Profile Recovery PIN Configuration</Text>
            <Text style={styles.sectionSubHeading}>
              Device session bound. Provide your final 6-digit Recovery PIN configuration parameters.
            </Text>

            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeTitle}>Authenticated Email</Text>
              <Text style={styles.profileBadgeText}>{googleEmail}</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Student ID</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={studentId}
                editable={false}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={firstName}
                  editable={false}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={lastName}
                  editable={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Set Recovery PIN (6 Digits)</Text>
              <TextInput
                style={styles.input}
                placeholder="Type New or Current 6-Digit PIN"
                placeholderTextColor="#94A3B8"
                maxLength={6}
                secureTextEntry
                keyboardType="number-pad"
                value={newRecoveryPin}
                onChangeText={setNewRecoveryPin}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                isSubmitting && styles.submitButtonDisabled,
              ]}
              onPress={handleRecoveryStep2CommitPin}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>CONFIRM PIN & COMPLETE SETUP</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}