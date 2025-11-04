// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { EncryptionService } from "../../src/encryption";

describe("EncryptionService", () => {
  describe("encryption and decryption", () => {
    it("should encrypt and decrypt a string successfully", () => {
      const key = EncryptionService.generateKey();
      const service = new EncryptionService(key);
      const plaintext = "my-secret-pat-token";

      const encrypted = service.encrypt(plaintext);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should produce different encrypted values for the same input", () => {
      const key = EncryptionService.generateKey();
      const service = new EncryptionService(key);
      const plaintext = "my-secret-pat-token";

      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });

    it("should handle empty strings", () => {
      const key = EncryptionService.generateKey();
      const service = new EncryptionService(key);
      const plaintext = "";

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle special characters", () => {
      const key = EncryptionService.generateKey();
      const service = new EncryptionService(key);
      const plaintext = "p@ssw0rd!#$%^&*()_+-=[]{}|;:',.<>?/~`";

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle unicode characters", () => {
      const key = EncryptionService.generateKey();
      const service = new EncryptionService(key);
      const plaintext = "Hello 世界 🌍";

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should fail to decrypt with wrong key", () => {
      const key1 = EncryptionService.generateKey();
      const key2 = EncryptionService.generateKey();
      const service1 = new EncryptionService(key1);
      const service2 = new EncryptionService(key2);
      const plaintext = "my-secret-pat-token";

      const encrypted = service1.encrypt(plaintext);

      expect(() => {
        service2.decrypt(encrypted);
      }).toThrow();
    });

    it("should fail to decrypt invalid format", () => {
      const key = EncryptionService.generateKey();
      const service = new EncryptionService(key);

      expect(() => {
        service.decrypt("invalid-format");
      }).toThrow("Invalid encrypted data format");
    });
  });

  describe("key generation", () => {
    it("should generate a valid key", () => {
      const key = EncryptionService.generateKey();
      expect(key).toBeDefined();
      expect(key.length).toBe(64); // 32 bytes * 2 (hex encoding)
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate different keys each time", () => {
      const key1 = EncryptionService.generateKey();
      const key2 = EncryptionService.generateKey();
      expect(key1).not.toBe(key2);
    });

    it("should accept a generated key", () => {
      const key = EncryptionService.generateKey();
      expect(() => {
        new EncryptionService(key);
      }).not.toThrow();
    });
  });

  describe("constructor validation", () => {
    it("should throw error if no key provided and no environment variable", () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;

      expect(() => {
        new EncryptionService();
      }).toThrow("ENCRYPTION_KEY environment variable must be set");

      if (originalKey) {
        process.env.ENCRYPTION_KEY = originalKey;
      }
    });

    it("should use environment variable if no key provided", () => {
      const key = EncryptionService.generateKey();
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = key;

      expect(() => {
        new EncryptionService();
      }).not.toThrow();

      if (originalKey) {
        process.env.ENCRYPTION_KEY = originalKey;
      } else {
        delete process.env.ENCRYPTION_KEY;
      }
    });

    it("should throw error for invalid key length", () => {
      expect(() => {
        new EncryptionService("too-short");
      }).toThrow("ENCRYPTION_KEY must be 64 hex characters");
    });
  });
});
