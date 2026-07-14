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
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as SecureStore from "expo-secure-store";
import { generateDeviceKeyPair } from "../utils/crypto";
import { AttendanceApiClient } from "../services/api";
import { styles } from "./RegistrationScreen.styles";

WebBrowser.maybeCompleteAuthSession();

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

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  const androidClientId =
    process.env.EXPO_PUBLIC_ANDROID_CLIENT_ID ||
    "874121249009-m2ivtinvdc3c7pgve649htinpnhk5snn.apps.googleusercontent.com";

  /* Allows expo-auth-session to dynamically resolve redirect URIs per runtime environment */
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    androidClientId,
    iosClientId: webClientId,
  });

  /* Processes OAuth token payload upon native picker or browser return */
  useEffect(() => {
    if (response?.type === "success") {
      const idToken =
        response.params?.id_token || response.authentication?.idToken;

      if (idToken) {
        handleGoogleAuthentication(idToken);
      } else {
        Alert.alert("Authentication Error", "Failed to parse Google ID token.");
        setIsSubmitting(false);
      }
    } else if (response?.type === "error") {
      Alert.alert("Authentication Error", "Google authentication failed.");
      setIsSubmitting(false);
    } else if (response?.type === "dismiss") {
      setIsSubmitting(false);
    }
  }, [response]);

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    try {
      const res = await promptAsync();
      if (res?.type !== "success") {
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Google Auth Session Launch Error:", error);
      Alert.alert("Error", "Unable to open Google authentication window.");
      setIsSubmitting(false);
    }
  };

  /* Verifies Google ID token against backend domain security policies */
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

      /* Re-binds local keys or generates new keypair for existing student accounts */
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

      /* Routes unregistered institutional emails to first-time onboarding */
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

  /* Submits onboarding credentials and binds hardware ECDSA keys */
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
                (!request || isSubmitting) && styles.googleButtonDisabled,
              ]}
              disabled={!request || isSubmitting}
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