Thanks in helping make Azure DevOps more secure for everyone.

## Security

Microsoft takes the security of our software products and services seriously, which includes all source code repositories managed through our GitHub organizations, which include [Microsoft](https://github.com/Microsoft), [Azure](https://github.com/Azure), [DotNet](https://github.com/dotnet), [AspNet](https://github.com/aspnet) and [Xamarin](https://github.com/xamarin).

If you believe you have found a security vulnerability in any Microsoft-owned repository that meets [Microsoft's definition of a security vulnerability](https://aka.ms/security.md/definition), please report it to us as described below.

## Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them to the Microsoft Security Response Center (MSRC) at [https://msrc.microsoft.com/create-report](https://aka.ms/security.md/msrc/create-report).

If you prefer to submit without logging in, send email to [secure@microsoft.com](mailto:secure@microsoft.com). If possible, encrypt your message with our PGP key; please download it from the [Microsoft Security Response Center PGP Key page](https://aka.ms/security.md/msrc/pgp).

You should receive a response within 24 hours. If for some reason you do not, please follow up via email to ensure we received your original message. Additional information can be found at [microsoft.com/msrc](https://www.microsoft.com/msrc).

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

If you are reporting for a bug bounty, more complete reports can contribute to a higher bounty award. Please visit our [Microsoft Bug Bounty Program](https://aka.ms/security.md/msrc/bounty) page for more details about our active programs.

## Preferred Languages

We prefer all communications to be in English.

## Policy

Microsoft follows the principle of [Coordinated Vulnerability Disclosure](https://aka.ms/security.md/cvd).

## Remote Server Security Considerations

When deploying the Azure DevOps MCP Server in remote mode (HTTP+SSE), additional security considerations apply:

### Authentication & Authorization

- **Entra ID Token Validation**: The current implementation decodes JWT tokens but does not perform full cryptographic validation. In production deployments, implement proper JWT validation using Microsoft authentication libraries.
- **PAT Storage**: Personal Access Tokens are encrypted at rest using AES-256-GCM encryption. The encryption key must be stored securely in Azure Key Vault.
- **User Isolation**: Each user's requests are executed using their own Personal Access Token, ensuring proper Azure DevOps access controls are enforced.

### Network Security

- **HTTPS Only**: Always use HTTPS in production. Azure App Service provides managed SSL certificates.
- **CORS Configuration**: Configure `ALLOWED_ORIGINS` environment variable to restrict which domains can access the server.
- **Private Endpoints**: Consider using Azure Private Endpoints to restrict network access to the server.

### Key Management

- **Encryption Key Rotation**: Periodically rotate encryption keys. Note that rotating keys requires re-encrypting all stored PATs.
- **Key Vault Integration**: Store encryption keys in Azure Key Vault with appropriate access policies.
- **Audit Logging**: Enable Azure Monitor and Key Vault audit logging to track access patterns.

### Monitoring

- **Application Insights**: Enable Application Insights for monitoring and alerting on authentication failures.
- **Failed Authentication Tracking**: Monitor for repeated authentication failures which may indicate an attack.
- **Anomaly Detection**: Use Azure Security Center to detect unusual access patterns.

For more details, see the [Remote Deployment Guide](./docs/REMOTE-DEPLOYMENT.md).
