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
  const [isOnboardingStep, setIsOnboardingStep] = useState(false);

  const [googleIdToken, setGoogleIdToken] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [recoveryPin, setRecoveryPin] = useState("");

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

      /* Clears cached Google session state to force account picker prompt */
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

      if (authResult.isRegistered && authResult.student && authResult.sessionToken) {
        let currentPrivateKey = await SecureStore.getItemAsync("student_private_key");
        let currentPublicKey = await SecureStore.getItemAsync("student_public_key");

        if (!currentPrivateKey || !currentPublicKey) {
          const keyPair = generateDeviceKeyPair();
          currentPrivateKey = keyPair.privateKeyBase64;
          currentPublicKey = keyPair.publicKeyBase64;
        }

        await onRegistrationSuccess(
          authResult.student.studentId,
          authResult.student.email,
          authResult.sessionToken,
          currentPrivateKey,
          currentPublicKey
        );
        return;
      }

      if (!authResult.isRegistered && authResult.googleProfile) {
        setGoogleEmail(authResult.googleProfile.email);
        setFirstName(authResult.googleProfile.firstName);
        setLastName(authResult.googleProfile.lastName);
        setIsOnboardingStep(true);
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
      Alert.alert(
        "Missing Input",
        "Please provide your Student ID and 6-digit Recovery PIN."
      );
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
          {isOnboardingStep
            ? "Complete one-time student profile onboarding."
            : "Sign in with your institutional Google account."}
        </Text>
      </View>

      <View style={styles.formContainer}>
        {!isOnboardingStep ? (
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

            <View style={styles.domainNotice}>
              <Text style={styles.domainNoticeText}>
                Access is strictly restricted to valid @ua.edu.ph accounts.
              </Text>
            </View>
          </>
        ) : (
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
              onPress={() => setIsOnboardingStep(false)}
            >
              <Text style={styles.secondaryButtonText}>
                ← Cancel and Switch Account
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}