// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TableClient, TableEntity } from "@azure/data-tables";
import { EncryptionService } from "./encryption.js";

/**
 * Entity stored in Azure Table Storage for user PAT mappings
 */
interface UserPatEntity extends TableEntity {
  partitionKey: string; // userId
  rowKey: string; // always "pat"
  encryptedPat: string;
  organization: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Service for managing Personal Access Token storage.
 * Stores encrypted PATs in Azure Table Storage, mapped to user identities.
 */
export class PatStorageService {
  private tableClient: TableClient;
  private encryptionService: EncryptionService;

  constructor(connectionString?: string, encryptionKey?: string) {
    const storageConnectionString = connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!storageConnectionString) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING environment variable must be set for remote server mode");
    }

    this.tableClient = TableClient.fromConnectionString(storageConnectionString, "UserPats");
    this.encryptionService = new EncryptionService(encryptionKey);
  }

  /**
   * Initialize the table storage (create table if it doesn't exist)
   */
  async initialize(): Promise<void> {
    try {
      await this.tableClient.createTable();
    } catch (error: unknown) {
      // Table might already exist, check if it's a "table already exists" error
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 409) {
        // Table already exists, this is fine
        return;
      }
      throw error;
    }
  }

  /**
   * Store or update a PAT for a user
   */
  async storePat(userId: string, organization: string, pat: string): Promise<void> {
    const encryptedPat = this.encryptionService.encrypt(pat);
    const now = new Date();

    const entity: UserPatEntity = {
      partitionKey: userId,
      rowKey: "pat",
      encryptedPat,
      organization,
      createdAt: now,
      updatedAt: now,
    };

    await this.tableClient.upsertEntity(entity, "Replace");
  }

  /**
   * Retrieve and decrypt a PAT for a user
   */
  async getPat(userId: string): Promise<{ pat: string; organization: string } | null> {
    try {
      const entity = await this.tableClient.getEntity<UserPatEntity>(userId, "pat");
      const pat = this.encryptionService.decrypt(entity.encryptedPat);
      return {
        pat,
        organization: entity.organization,
      };
    } catch (error: unknown) {
      // Entity not found
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a PAT for a user
   */
  async deletePat(userId: string): Promise<void> {
    try {
      await this.tableClient.deleteEntity(userId, "pat");
    } catch (error: unknown) {
      // Entity not found, that's fine
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) {
        return;
      }
      throw error;
    }
  }

  /**
   * Check if a PAT exists for a user
   */
  async hasPat(userId: string): Promise<boolean> {
    const result = await this.getPat(userId);
    return result !== null;
  }
}
