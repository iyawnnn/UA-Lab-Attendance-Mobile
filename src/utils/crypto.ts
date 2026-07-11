// src/utils/crypto.ts

import QuickCrypto from "react-native-quick-crypto";

export interface DeviceKeyPair {
  publicKeyBase64: string;
  privateKeyBase64: string;
}

/**
 * Generates an asymmetric ECDSA key pair using P-256 in standard PEM format.
 * PEM format guarantees clean string serialization in expo-secure-store.
 */
export function generateDeviceKeyPair(): DeviceKeyPair {
  const { publicKey, privateKey } = QuickCrypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return {
    publicKeyBase64: publicKey.toString(),
    privateKeyBase64: privateKey.toString(),
  };
}

/**
 * Generates a deterministic ECDSA digital signature using the PEM private key.
 */
export function signAttendancePayload(message: string, privateKeyPem: string): string {
  // 1. Create PrivateKey object directly from PEM string
  const keyObject = QuickCrypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem",
    type: "pkcs8",
  });

  // 2. Sign message string
  const sign = QuickCrypto.createSign("SHA256");
  sign.update(message);

  const signatureBuffer = sign.sign(keyObject);

  // 3. Return signature as Base64 string
  return signatureBuffer.toString("base64");
}