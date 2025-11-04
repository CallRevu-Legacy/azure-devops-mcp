// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Service for encrypting and decrypting sensitive data like Personal Access Tokens.
 * Uses AES-256-GCM encryption with the encryption key from environment variables.
 */
export class EncryptionService {
  private readonly algorithm = "aes-256-gcm";
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly authTagLength = 16; // 128 bits
  private readonly key: Buffer;

  constructor(encryptionKey?: string) {
    const keyString = encryptionKey || process.env.ENCRYPTION_KEY;
    if (!keyString) {
      throw new Error("ENCRYPTION_KEY environment variable must be set for remote server mode");
    }

    // Convert the key to a buffer, expecting it to be a hex string
    this.key = Buffer.from(keyString, "hex");
    if (this.key.length !== this.keyLength) {
      throw new Error(`ENCRYPTION_KEY must be ${this.keyLength * 2} hex characters (${this.keyLength} bytes)`);
    }
  }

  /**
   * Encrypts a string value using AES-256-GCM.
   * Returns a string in the format: iv:authTag:encryptedData (all hex encoded)
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:encryptedData
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypts a string that was encrypted with the encrypt method.
   * Expects format: iv:authTag:encryptedData (all hex encoded)
   */
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Generates a new random encryption key suitable for use with this service.
   * Returns a hex-encoded string.
   */
  static generateKey(): string {
    return randomBytes(32).toString("hex");
  }
}
