import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground
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
  const [currentView, setCurrentView] = useState<"login" | "onboarding" | "recovery_verify" | "recovery_set_pin">("login");

  const [googleIdToken, setGoogleIdToken] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [recoveryPin, setRecoveryPin] = useState("");
  const [newRecoveryPin, setNewRecoveryPin] = useState("");

  const [cachedSessionToken, setCachedSessionToken] = useState("");
  const [cachedPrivateKey, setCachedPrivateKey] = useState("");
  const [cachedPublicKey, setCachedPublicKey] = useState("");

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
        /* Safe to ignore */
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
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
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
        const isKeyMismatched = dbPublicKey && currentPublicKey && currentPublicKey !== dbPublicKey;

        if (!currentPrivateKey || !currentPublicKey || isKeyMismatched) {
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
        setCurrentView("recovery_set_pin");
      } else {
        Alert.alert("Recovery Failed", data.message || "Incorrect Recovery PIN or Student ID.");
      }
    } catch (error) {
      Alert.alert("Error", "Server error encountered during recovery handshake step 1 verification.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
      style={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* High-Fidelity Background Image Hero Panel */}
      <ImageBackground
        source={require("../../assets/labs.jpg")}
        style={styles.brandHero}
        resizeMode="cover"
      >
        <View style={styles.heroOverlay}>
          <Image
            source={require("../../assets/ua-logo.png")} 
            style={styles.heroLogo}
          />
          <Text style={styles.heroTitle}>Student</Text>
          <Text style={styles.heroSubTitle}>Lab Attendance System</Text>
        </View>
      </ImageBackground>

      <View style={styles.formContainer}>
        {currentView === "login" && (
          <View style={styles.viewStack}>
            <Text style={styles.sectionHeading}>Institutional Login</Text>
            <View style={styles.yellowBar} />
            <Text style={styles.sectionSubHeading}>
              Sign in with your official institutional email.
            </Text>

            <View style={styles.googleButtonContainer}>
              <TouchableOpacity
                style={[
                  styles.googleButton,
                  isSubmitting && styles.googleButtonDisabled,
                ]}
                disabled={isSubmitting}
                onPress={handleGoogleSignIn}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#011B51" />
                ) : (
                  <Text style={styles.googleButtonText}>Sign In with Google</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.domainNoticeText}>
              Access parameter rules restrict identity checking exclusively to valid @ua.edu.ph accounts.
            </Text>

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
                Recover / Transfer Account to this Device
              </Text>
            </TouchableOpacity>

            <View style={styles.guidelinesContainer}>
              <Text style={styles.guidelinesTitle}>Portal Guidelines</Text>
              <View style={styles.guidelineItem}>
                <Text style={styles.guidelineNumber}>01.</Text>
                <Text style={styles.guidelineText}>Authenticate utilizing your personal structural laboratory SSO account credentials.</Text>
              </View>
              <View style={styles.guidelineItem}>
                <Text style={styles.guidelineNumber}>02.</Text>
                <Text style={styles.guidelineText}>The identity ledger automatically configures secure terminal key pairs on initial match.</Text>
              </View>
              <View style={styles.guidelineItem}>
                <Text style={styles.guidelineNumber}>03.</Text>
                <Text style={styles.guidelineText}>Verify your proximity parameter maps to clear the physical geofence boundary gates.</Text>
              </View>
            </View>
          </View>
        )}

        {currentView === "onboarding" && (
          <View style={styles.viewStack}>
            <Text style={styles.sectionHeading}>One-Time Profile Setup</Text>
            <View style={styles.yellowBar} />
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
          </View>
        )}

        {currentView === "recovery_verify" && (
          <View style={styles.viewStack}>
            <Text style={styles.sectionHeading}>Device Authorization Transfer</Text>
            <View style={styles.yellowBar} />
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
          </View>
        )}

        {currentView === "recovery_set_pin" && (
          <View style={styles.viewStack}>
            <Text style={styles.sectionHeading}>Profile Recovery PIN Configuration</Text>
            <View style={styles.yellowBar} />
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
          </View>
        )}
      </View>
    </ScrollView>
  );
}