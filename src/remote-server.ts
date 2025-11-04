// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getBearerHandler, WebApi } from "azure-devops-node-api";

import { PatStorageService } from "./pat-storage.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";
import { DomainsManager } from "./shared/domains.js";

interface AuthenticatedRequest extends Request {
  userId?: string;
  pat?: string;
}

/**
 * Remote MCP server that runs as an HTTP service with Streamable HTTP transport.
 * Supports user authentication and maps users to their Personal Access Tokens.
 */
export class RemoteMcpServer {
  private app: express.Application;
  private patStorage: PatStorageService;
  private sessions: Map<string, { transport: StreamableHTTPServerTransport; server: McpServer; userId: string }> = new Map();
  private enabledDomains: Set<string>;
  private orgName: string;
  private orgUrl: string;

  constructor(organization: string, domains: string[] = ["all"]) {
    this.orgName = organization;
    this.orgUrl = "https://dev.azure.com/" + organization;
    this.app = express();
    this.patStorage = new PatStorageService();

    const domainsManager = new DomainsManager(domains);
    this.enabledDomains = domainsManager.getEnabledDomains();

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize the server (create database tables, etc.)
   */
  async initialize(): Promise<void> {
    await this.patStorage.initialize();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS configuration
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps or curl requests)
          if (!origin) return callback(null, true);

          if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true,
      })
    );

    this.app.use(express.json());

    // Authentication middleware for protected routes
    this.app.use("/mcp", this.authenticateUser.bind(this));
  }

  /**
   * Authenticate user using Bearer token (Entra ID token)
   * This is a simplified implementation - in production you would validate the JWT token
   */
  private async authenticateUser(req: AuthenticatedRequest, res: Response, next: express.NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.substring(7);

    try {
      // In production, validate the Entra ID token here
      // For now, we'll extract the user ID from the token claims
      // You would typically use @azure/identity or similar to validate
      const userId = await this.extractUserIdFromToken(token);

      // Get the user's PAT
      const patInfo = await this.patStorage.getPat(userId);
      if (!patInfo) {
        res.status(403).json({
          error: "No Personal Access Token configured for this user",
          message: "Please configure your PAT using the /api/pat endpoint",
        });
        return;
      }

      // Verify organization matches
      if (patInfo.organization !== this.orgName) {
        res.status(403).json({
          error: "PAT organization mismatch",
          message: `Your PAT is configured for organization '${patInfo.organization}' but this server is for '${this.orgName}'`,
        });
        return;
      }

      req.userId = userId;
      req.pat = patInfo.pat;
      next();
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(401).json({ error: "Authentication failed" });
    }
  }

  /**
   * Extract user ID from Entra ID token
   * In production, this should validate the JWT and extract claims
   */
  private async extractUserIdFromToken(token: string): Promise<string> {
    // TODO: Implement proper JWT validation using @azure/identity
    // For now, decode the JWT (without validation) to extract the user ID
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT token format");
      }

      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      const userId = payload.oid || payload.sub || payload.email;

      if (!userId) {
        throw new Error("No user identifier found in token");
      }

      return userId;
    } catch (error) {
      throw new Error("Failed to extract user ID from token");
    }
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({ status: "healthy", version: packageVersion, organization: this.orgName });
    });

    // PAT management endpoint - requires authentication
    this.app.post("/api/pat", this.authenticateUserForPatManagement.bind(this), async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { pat, organization } = req.body;

        if (!pat || !organization) {
          res.status(400).json({ error: "Missing 'pat' or 'organization' in request body" });
          return;
        }

        if (organization !== this.orgName) {
          res.status(400).json({
            error: "Organization mismatch",
            message: `This server is configured for organization '${this.orgName}'`,
          });
          return;
        }

        const userId = req.userId!;
        await this.patStorage.storePat(userId, organization, pat);

        res.json({ success: true, message: "PAT stored successfully" });
      } catch (error) {
        console.error("Error storing PAT:", error);
        res.status(500).json({ error: "Failed to store PAT" });
      }
    });

    // MCP endpoint - handles all HTTP methods (GET, POST, DELETE) for Streamable HTTP
    this.app.all("/mcp", async (req: AuthenticatedRequest, res: Response) => {
      console.log(`${req.method} /mcp request from user:`, req.userId);

      try {
        const sessionId = req.headers["x-session-id"] as string | undefined;

        // Check if we have an existing session
        let sessionInfo = sessionId ? this.sessions.get(sessionId) : undefined;

        // If no session or user mismatch, create a new session
        if (!sessionInfo || sessionInfo.userId !== req.userId) {
          // Create a new session with a unique session ID
          const newSessionId = randomUUID();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
            onsessionclosed: async (closedSessionId) => {
              console.log(`Session closed: ${closedSessionId}`);
              this.sessions.delete(closedSessionId);
            },
            allowedOrigins: process.env.ALLOWED_ORIGINS?.split(","),
          });

          // Create MCP server instance for this user's session
          const server = this.createMcpServerForUser(req.pat!);

          // Connect the transport to the server
          await server.connect(transport);

          sessionInfo = {
            transport,
            server,
            userId: req.userId!,
          };
          this.sessions.set(newSessionId, sessionInfo);
          console.log(`Created new session: ${newSessionId} for user: ${req.userId}`);
        }

        // Handle the request with the transport
        await sessionInfo.transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to process MCP request" });
        }
      }
    });
  }

  /**
   * Simplified authentication for PAT management (only validates token, doesn't require existing PAT)
   */
  private async authenticateUserForPatManagement(req: AuthenticatedRequest, res: Response, next: express.NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const userId = await this.extractUserIdFromToken(token);
      req.userId = userId;
      next();
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(401).json({ error: "Authentication failed" });
    }
  }

  /**
   * Create an MCP server instance configured for a specific user's PAT
   */
  private createMcpServerForUser(pat: string): McpServer {
    const server = new McpServer({
      name: "Azure DevOps MCP Server (Remote)",
      version: packageVersion,
      icons: [
        {
          src: "https://cdn.vsassets.io/content/icons/favicon.ico",
        },
      ],
    });

    const userAgentComposer = new UserAgentComposer(packageVersion);
    server.server.oninitialized = () => {
      userAgentComposer.appendMcpClientInfo(server.server.getClientVersion());
    };

    // Token provider that returns the user's PAT
    const tokenProvider = async () => pat;

    // Connection provider that uses the user's PAT
    const connectionProvider = async () => {
      const authHandler = getBearerHandler(pat);
      const connection = new WebApi(this.orgUrl, authHandler, undefined, {
        productName: "AzureDevOps.MCP",
        productVersion: packageVersion,
        userAgent: userAgentComposer.userAgent,
      });
      return connection;
    };

    configureAllTools(server, tokenProvider, connectionProvider, () => userAgentComposer.userAgent, this.enabledDomains);

    return server;
  }

  /**
   * Start the HTTP server
   */
  async start(port: number = 3000): Promise<void> {
    await this.initialize();

    this.app.listen(port, () => {
      console.log(`Remote MCP server running on port ${port}`);
      console.log(`Organization: ${this.orgName}`);
      console.log(`Transport: Streamable HTTP`);
      console.log(`Enabled domains: ${Array.from(this.enabledDomains).join(", ")}`);
    });
  }
}
