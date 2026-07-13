// src/components/LocationDisclosureModal.tsx

import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";

interface LocationDisclosureModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function LocationDisclosureModal({
  visible,
  onAccept,
  onDecline,
}: LocationDisclosureModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>LOCATION REQUIREMENT</Text>
          </View>

          <Text style={styles.title}>Campus Geofence Verification</Text>

          <Text style={styles.description}>
            UA Laboratory Attendance collects precise location data to verify that
            you are physically present inside designated university laboratory rooms
            during check-in.
          </Text>

          <Text style={styles.subDescription}>
            Location coordinates are accessed only while actively logging
            attendance and are verified against campus room coordinates.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <Text style={styles.declineButtonText}>NOT NOW</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.acceptButtonText}>AGREE & CONTINUE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    width: width - 40,
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#011B51",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  headerBadgeText: {
    color: "#FED702",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#011B51",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    lineHeight: 20,
    marginBottom: 10,
  },
  subDescription: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    lineHeight: 18,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  declineButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  acceptButton: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#011B51",
    alignItems: "center",
  },
  acceptButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});