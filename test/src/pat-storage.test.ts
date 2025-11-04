// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PatStorageService } from "../../src/pat-storage";
import { EncryptionService } from "../../src/encryption";

// Mock Azure Table Storage
jest.mock("@azure/data-tables", () => {
  const entities = new Map<string, Map<string, unknown>>();

  return {
    TableClient: {
      fromConnectionString: jest.fn(() => ({
        createTable: jest.fn().mockResolvedValue(undefined),
        upsertEntity: jest.fn((entity) => {
          const partitionKey = entity.partitionKey as string;
          if (!entities.has(partitionKey)) {
            entities.set(partitionKey, new Map());
          }
          entities.get(partitionKey)!.set(entity.rowKey as string, entity);
          return Promise.resolve();
        }),
        getEntity: jest.fn((partitionKey: string, rowKey: string) => {
          const partition = entities.get(partitionKey);
          if (!partition || !partition.has(rowKey)) {
            const error = new Error("Entity not found");
            (error as unknown as { statusCode: number }).statusCode = 404;
            throw error;
          }
          return Promise.resolve(partition.get(rowKey));
        }),
        deleteEntity: jest.fn((partitionKey: string, rowKey: string) => {
          const partition = entities.get(partitionKey);
          if (!partition || !partition.has(rowKey)) {
            const error = new Error("Entity not found");
            (error as unknown as { statusCode: number }).statusCode = 404;
            throw error;
          }
          partition.delete(rowKey);
          return Promise.resolve();
        }),
      })),
    },
  };
});

describe("PatStorageService", () => {
  let service: PatStorageService;
  const testConnectionString = "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdGtleQ==;EndpointSuffix=core.windows.net";
  const testEncryptionKey = EncryptionService.generateKey();

  beforeEach(() => {
    // Set up environment variables
    process.env.AZURE_STORAGE_CONNECTION_STRING = testConnectionString;
    process.env.ENCRYPTION_KEY = testEncryptionKey;

    service = new PatStorageService(testConnectionString, testEncryptionKey);
  });

  afterEach(() => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.ENCRYPTION_KEY;
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it("should throw error if connection string not provided", () => {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
      expect(() => {
        new PatStorageService();
      }).toThrow("AZURE_STORAGE_CONNECTION_STRING environment variable must be set");
    });
  });

  describe("storePat", () => {
    it("should store a PAT successfully", async () => {
      const userId = "user123";
      const organization = "contoso";
      const pat = "my-secret-pat";

      await service.storePat(userId, organization, pat);

      const result = await service.getPat(userId);
      expect(result).toBeDefined();
      expect(result?.pat).toBe(pat);
      expect(result?.organization).toBe(organization);
    });

    it("should update an existing PAT", async () => {
      const userId = "user123";
      const organization = "contoso";
      const pat1 = "first-pat";
      const pat2 = "second-pat";

      await service.storePat(userId, organization, pat1);
      let result = await service.getPat(userId);
      expect(result?.pat).toBe(pat1);

      await service.storePat(userId, organization, pat2);
      result = await service.getPat(userId);
      expect(result?.pat).toBe(pat2);
    });

    it("should store PATs for different users independently", async () => {
      const user1 = "user1";
      const user2 = "user2";
      const organization = "contoso";
      const pat1 = "pat-for-user1";
      const pat2 = "pat-for-user2";

      await service.storePat(user1, organization, pat1);
      await service.storePat(user2, organization, pat2);

      const result1 = await service.getPat(user1);
      const result2 = await service.getPat(user2);

      expect(result1?.pat).toBe(pat1);
      expect(result2?.pat).toBe(pat2);
    });
  });

  describe("getPat", () => {
    it("should return null for non-existent user", async () => {
      const result = await service.getPat("non-existent-user");
      expect(result).toBeNull();
    });

    it("should retrieve stored PAT", async () => {
      const userId = "user123";
      const organization = "contoso";
      const pat = "my-secret-pat";

      await service.storePat(userId, organization, pat);
      const result = await service.getPat(userId);

      expect(result).toBeDefined();
      expect(result?.pat).toBe(pat);
      expect(result?.organization).toBe(organization);
    });
  });

  describe("deletePat", () => {
    it("should delete an existing PAT", async () => {
      const userId = "user123";
      const organization = "contoso";
      const pat = "my-secret-pat";

      await service.storePat(userId, organization, pat);
      expect(await service.hasPat(userId)).toBe(true);

      await service.deletePat(userId);
      expect(await service.hasPat(userId)).toBe(false);
    });

    it("should not throw error when deleting non-existent PAT", async () => {
      await expect(service.deletePat("non-existent-user")).resolves.not.toThrow();
    });
  });

  describe("hasPat", () => {
    it("should return true for existing PAT", async () => {
      const userId = "user123";
      const organization = "contoso";
      const pat = "my-secret-pat";

      await service.storePat(userId, organization, pat);
      expect(await service.hasPat(userId)).toBe(true);
    });

    it("should return false for non-existent PAT", async () => {
      expect(await service.hasPat("non-existent-user")).toBe(false);
    });

    it("should return false after deletion", async () => {
      const userId = "user123";
      const organization = "contoso";
      const pat = "my-secret-pat";

      await service.storePat(userId, organization, pat);
      expect(await service.hasPat(userId)).toBe(true);

      await service.deletePat(userId);
      expect(await service.hasPat(userId)).toBe(false);
    });
  });
});
