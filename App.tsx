import React from "react";
import { StyleSheet, View, ActivityIndicator, Text, StatusBar } from "react-native";
import { useAuthStorage } from "./src/hooks/useAuthStorage";
import RegistrationScreen from "./src/screens/RegistrationScreen";
import AttendanceScreen from "./src/screens/AttendanceScreen";

export default function App() {
  const { isLoading, isRegistered, studentId, privateKey, saveCredentials, clearCredentials } = useAuthStorage();

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#011B51" />
        <Text style={styles.loadingText}>Authenticating Security Keys...</Text>
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#011B51" />
      {isRegistered && studentId && privateKey ? (
        <AttendanceScreen 
          studentId={studentId} 
          privateKey={privateKey} 
          onRevoked={clearCredentials} 
        />
      ) : (
        <RegistrationScreen onRegistrationSuccess={saveCredentials} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "600",
    color: "#011B51",
  },
});