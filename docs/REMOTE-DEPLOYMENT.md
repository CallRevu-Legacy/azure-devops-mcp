# Remote Server Deployment Guide

This guide explains how to deploy the Azure DevOps MCP server as a remote service in Azure, with user-scoped authentication using Personal Access Tokens.

## Overview

The remote server mode allows you to run the Azure DevOps MCP server as an HTTP service with Streamable HTTP transport. This enables clients to connect to the server remotely without running it locally.

**Key Security Features:**

- User authentication via Entra ID tokens
- Personal Access Tokens (PATs) stored encrypted in Azure Table Storage
- Each user's requests are executed with their own PAT, ensuring proper access control
- Encrypted storage using AES-256-GCM with a server-side encryption key

## Prerequisites

1. **Azure Resources:**
   - Azure Storage Account (for storing encrypted PATs)
   - Azure App Service or Container Instance (for hosting the server)
   - Azure Key Vault (recommended for storing the encryption key)

2. **Environment Setup:**
   - Node.js 20+
   - Azure CLI (for deployment)

## Configuration

### Environment Variables

The following environment variables must be set when running in remote mode:

| Variable                          | Required | Description                                                                         |
| --------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `AZURE_STORAGE_CONNECTION_STRING` | Yes      | Connection string for Azure Table Storage                                           |
| `ENCRYPTION_KEY`                  | Yes      | 64-character hex string for encrypting PATs (use `EncryptionService.generateKey()`) |
| `ALLOWED_ORIGINS`                 | No       | Comma-separated list of allowed CORS origins                                        |

### Generating an Encryption Key

You can generate a secure encryption key using the built-in npm script:

```bash
npm run generate-key
```

Or via command line directly:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**⚠️ IMPORTANT:** Store this key securely in Azure Key Vault and never commit it to source control.

## Running Locally in Remote Mode

For testing purposes, you can run the server locally in remote mode:

```bash
# Set environment variables
export AZURE_STORAGE_CONNECTION_STRING="your-connection-string"
export ENCRYPTION_KEY="your-64-character-hex-key"
export ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8080"

# Start the server in remote mode
npm run build
node dist/index.js myorg --remote --port 3000
```

## Deploying to Azure App Service

### 1. Create Azure Resources

```bash
# Variables
RESOURCE_GROUP="mcp-server-rg"
LOCATION="eastus"
STORAGE_ACCOUNT="mcpserverstorage"
APP_SERVICE_PLAN="mcp-server-plan"
WEB_APP="mcp-server"
KEY_VAULT="mcp-server-kv"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS

# Get storage connection string
STORAGE_CONN=$(az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query connectionString -o tsv)

# Create Key Vault
az keyvault create \
  --name $KEY_VAULT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Generate and store encryption key
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
az keyvault secret set \
  --vault-name $KEY_VAULT \
  --name "encryption-key" \
  --value $ENCRYPTION_KEY

# Create App Service Plan
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

# Create Web App
az webapp create \
  --name $WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --runtime "NODE:20-lts"
```

### 2. Configure Application Settings

```bash
# Enable managed identity
az webapp identity assign \
  --name $WEB_APP \
  --resource-group $RESOURCE_GROUP

# Get the managed identity
IDENTITY_ID=$(az webapp identity show \
  --name $WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --query principalId -o tsv)

# Grant Key Vault access to managed identity
az keyvault set-policy \
  --name $KEY_VAULT \
  --object-id $IDENTITY_ID \
  --secret-permissions get

# Configure app settings
az webapp config appsettings set \
  --name $WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --settings \
    AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN" \
    ENCRYPTION_KEY="@Microsoft.KeyVault(SecretUri=https://${KEY_VAULT}.vault.azure.net/secrets/encryption-key/)" \
    ALLOWED_ORIGINS="https://yourdomain.com" \
    ORGANIZATION="your-ado-org" \
    REMOTE_MODE="true" \
    PORT="8080"

# Configure startup command
az webapp config set \
  --name $WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --startup-file "node dist/index.js \$ORGANIZATION --remote --port \$PORT"
```

### 3. Deploy the Application

```bash
# Build the project
npm run build

# Create deployment package
cd dist
zip -r ../deploy.zip .
cd ..

# Deploy to App Service
az webapp deployment source config-zip \
  --name $WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --src deploy.zip
```

## Client Usage

### 1. Registering a PAT

Users must first register their Personal Access Token:

```bash
# Get Entra ID token
TOKEN=$(az account get-access-token --resource https://your-server.azurewebsites.net --query accessToken -o tsv)

# Register PAT
curl -X POST https://your-server.azurewebsites.net/api/pat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pat": "your-azure-devops-pat",
    "organization": "your-ado-org"
  }'
```

### 2. Connecting to the MCP Server

Configure your MCP client to connect to the remote server using Streamable HTTP:

```json
{
  "servers": {
    "ado-remote": {
      "type": "streamable-http",
      "url": "https://your-server.azurewebsites.net/mcp",
      "headers": {
        "Authorization": "Bearer ${ENTRA_TOKEN}"
      }
    }
  }
}
```

The Streamable HTTP transport provides better performance and reliability compared to SSE, with built-in session management and support for reconnection.

## Security Considerations

1. **Token Rotation:**
   - PATs should be rotated regularly
   - Consider implementing expiration checks and notifications

2. **Access Control:**
   - The server validates Entra ID tokens (implement full JWT validation in production)
   - Each user's PAT is used for their requests, ensuring proper Azure DevOps permissions

3. **Network Security:**
   - Use HTTPS only (App Service provides SSL certificates)
   - Configure ALLOWED_ORIGINS to restrict CORS access
   - Consider using Azure Front Door or Application Gateway for additional protection

4. **Key Management:**
   - Store the encryption key in Azure Key Vault
   - Enable Key Vault audit logging
   - Rotate encryption keys periodically (requires re-encrypting all PATs)

5. **Monitoring:**
   - Enable Application Insights for monitoring
   - Set up alerts for authentication failures
   - Monitor for unusual access patterns

## Troubleshooting

### Connection Issues

```bash
# Check server health
curl https://your-server.azurewebsites.net/health

# Check logs
az webapp log tail --name $WEB_APP --resource-group $RESOURCE_GROUP
```

### Authentication Errors

- Verify the Entra ID token is valid and not expired
- Ensure the user has registered their PAT
- Check that the PAT has the necessary permissions in Azure DevOps

### Storage Errors

- Verify the storage connection string is correct
- Check that the table "UserPats" exists (it's created automatically on first run)
- Verify network connectivity to Azure Storage

## API Reference

### Health Check

```
GET /health
```

Returns server status and version information.

### Register/Update PAT

```
POST /api/pat
Authorization: Bearer {entra-token}
Content-Type: application/json

{
  "pat": "your-pat-token",
  "organization": "your-org"
}
```

### MCP Streamable HTTP Endpoint

```
GET|POST|DELETE /mcp
Authorization: Bearer {entra-token}
X-Session-Id: {session-id} (optional, for subsequent requests)
```

Handles all MCP communication using the Streamable HTTP protocol. Supports:

- **GET**: Establish streaming connection or resume session
- **POST**: Send JSON-RPC messages to the server
- **DELETE**: Close the session
