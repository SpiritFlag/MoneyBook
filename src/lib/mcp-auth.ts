import type { AuthInfo } from "@modelcontextprotocol/server";

export const mcpMetadataPath = "/.well-known/oauth-protected-resource/mcp";
export const mcpScopes = ["profile", "offline_access"];
export type McpConfig = { resource: string; issuer: string; clientId: string };
export type OAuthAccessToken = {
  subject: string; clientId: string; scopes: string[]; revoked: boolean;
  expired: boolean; expiration: number | null; aud?: string[];
};

export function mcpAuthOptions(config: McpConfig) {
  // mcp-handler concatenates resourceUrl + resourceMetadataPath; it expects an origin here.
  return { required: true, requiredScopes: ["profile"], resourceMetadataPath: mcpMetadataPath, resourceUrl: new URL(config.resource).origin };
}

export function mcpConfig(env: Record<string, string | undefined> = process.env): McpConfig {
  // Require the configured OAuth client and a token bound to this exact MCP resource.
  const resource = env.MCP_RESOURCE_URL;
  const issuer = env.CLERK_AUTHORIZATION_SERVER;
  const clientId = env.CLERK_OAUTH_CLIENT_ID;
  if (!resource || !issuer || !clientId || [resource, issuer, clientId].includes("[SENSITIVE]")) throw new Error("MCP OAuth configuration missing");
  const resourceUrl = new URL(resource), issuerUrl = new URL(issuer);
  const valid = (url: URL) => (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) && !url.username && !url.password && !url.search && !url.hash;
  if (!valid(resourceUrl) || !valid(issuerUrl) || resourceUrl.pathname !== "/mcp" || issuerUrl.pathname !== "/") throw new Error("Invalid MCP OAuth configuration");
  return { resource: resourceUrl.href, issuer: issuerUrl.origin, clientId };
}

export function oauthIdentity(token: OAuthAccessToken, bearer: string, config: McpConfig, now = Math.floor(Date.now() / 1000)): AuthInfo | undefined {
  if (token.revoked || token.expired || token.expiration === null || !Number.isFinite(token.expiration) || token.expiration <= now || !token.aud?.includes(config.resource)) return undefined;
  if (token.clientId !== config.clientId || !/^user_[A-Za-z0-9]+$/.test(token.subject)) return undefined;
  return { token: bearer, clientId: token.clientId, scopes: token.scopes, expiresAt: token.expiration, resource: new URL(config.resource), extra: { userId: token.subject } };
}

export function mcpUserId(authInfo: AuthInfo | undefined): string {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== "string" || !/^user_[A-Za-z0-9]+$/.test(userId)) throw new Error("MCP authentication required");
  return userId;
}
