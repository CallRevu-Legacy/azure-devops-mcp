#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Utility script to generate a secure encryption key for PAT storage.
 * Run with: node scripts/generate-encryption-key.js
 */

import { randomBytes } from "crypto";

function generateEncryptionKey() {
  const key = randomBytes(32).toString("hex");
  console.log("\n=== Encryption Key Generated ===\n");
  console.log(key);
  console.log("\n=== IMPORTANT ===");
  console.log("1. Store this key securely in Azure Key Vault");
  console.log("2. Never commit this key to source control");
  console.log("3. Use this key in the ENCRYPTION_KEY environment variable");
  console.log("4. If you lose this key, you will need to re-register all PATs\n");
}

generateEncryptionKey();
