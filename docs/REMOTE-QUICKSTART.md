# Quick Start Guide: Remote Azure DevOps MCP Server

This guide provides a quick overview of setting up the remote MCP server.

## What Was Added

This implementation adds remote server capabilities to the Azure DevOps MCP server:

- **Transport**: Uses Streamable HTTP (MCP 2024-11-05+ standard) instead of local stdio
- **Authentication**: Entra ID Bearer tokens authenticate users
- **Storage**: Personal Access Tokens stored encrypted in Azure Table Storage
- **Isolation**: Each user's requests use their own PAT for proper access control

## Quick Start

### 1. Install Dependencies

The following new dependencies were added:
```bash
npm install express @azure/data-tables cors
npm install --save-dev @types/express @types/cors
```

### 2. Generate Encryption Key

```bash
npm run generate-key
```

Store this key securely in Azure Key Vault.

### 3. Set Environment Variables

```bash
export AZURE_STORAGE_CONNECTION_STRING="your-connection-string"
export ENCRYPTION_KEY="your-64-char-hex-key"
export ALLOWED_ORIGINS="https://yourdomain.com"
```

### 4. Run Locally (for testing)

```bash
npm run build
node dist/index.js myorg --remote --port 3000
```

### 5. Test the Server

```bash
# Health check
curl http://localhost:3000/health

# Register a PAT (requires Entra ID token)
curl -X POST http://localhost:3000/api/pat \
  -H "Authorization: Bearer YOUR_ENTRA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pat": "your-pat", "organization": "myorg"}'

# Connect MCP client to http://localhost:3000/mcp
```

## Files Added

### Core Implementation
- `src/encryption.ts` - AES-256-GCM encryption service
- `src/pat-storage.ts` - Azure Table Storage integration for PATs
- `src/remote-server.ts` - HTTP server with Streamable HTTP transport

### Tests
- `test/src/encryption.test.ts` - Encryption service tests (13 tests)
- `test/src/pat-storage.test.ts` - PAT storage tests (12 tests)

### Documentation
- `docs/REMOTE-DEPLOYMENT.md` - Complete deployment guide
- `.env.example` - Environment variable template
- `scripts/generate-encryption-key.js` - Encryption key generator

### Configuration Updates
- `src/index.ts` - Added `--remote` and `--port` CLI options
- `package.json` - Added dependencies and `generate-key` script
- `jest.config.cjs` - Added module mappings for new files

## Architecture

```
Client (with Entra ID token)
    ↓
HTTP Request to /mcp
    ↓
Authentication Middleware
    ↓ (validates token, retrieves PAT)
StreamableHTTPServerTransport
    ↓
MCP Server (configured with user's PAT)
    ↓
Azure DevOps API (using user's PAT)
```

## Security Considerations

### ⚠️ Important: JWT Validation

The current implementation **decodes** JWT tokens but does **not validate** signatures. This is clearly marked with security warnings in the code.

**Before production deployment**, you must:
1. Implement proper JWT signature validation
2. Verify token issuer, audience, and expiration
3. Validate signing keys against Azure AD's JWKS endpoint
4. Consider using `@azure/msal-node` for proper token validation

See `src/remote-server.ts` lines 83-98 for the authentication implementation.

### Production Checklist

- [ ] Implement JWT signature validation
- [ ] Store encryption key in Azure Key Vault
- [ ] Enable HTTPS (automatic with Azure App Service)
- [ ] Configure CORS with specific origins
- [ ] Set up Application Insights monitoring
- [ ] Enable Azure Monitor logging
- [ ] Configure rate limiting
- [ ] Set up automated PAT rotation reminders
- [ ] Review and test disaster recovery procedures

## Deployment Options

### Option 1: Azure App Service (Recommended)
- Easy to deploy and manage
- Built-in SSL/TLS
- Auto-scaling available
- See `docs/REMOTE-DEPLOYMENT.md` for full instructions

### Option 2: Azure Container Instances
- More control over environment
- Can use custom Docker images
- Suitable for development/testing

### Option 3: Azure Kubernetes Service
- For high-scale deployments
- Advanced orchestration capabilities
- Higher operational overhead

## Testing

Run all tests:
```bash
npm test
```

Run specific test suites:
```bash
npm test -- encryption.test.ts
npm test -- pat-storage.test.ts
```

Test coverage:
- Overall: 98.68% statements
- Encryption service: 100% coverage
- PAT storage: 83.87% coverage

## Next Steps

1. Review the [complete deployment guide](./REMOTE-DEPLOYMENT.md)
2. Set up Azure resources (Storage Account, Key Vault, App Service)
3. Implement JWT validation for production
4. Configure monitoring and alerting
5. Test with real users
6. Document your deployment process

## Support

For issues or questions:
- Review `docs/REMOTE-DEPLOYMENT.md`
- Check `SECURITY.md` for security considerations
- Review `TROUBLESHOOTING.md` for common issues
