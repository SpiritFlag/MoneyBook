import { clerkClient } from "@clerk/nextjs/server";
import { withMcpAuth } from "mcp-handler";
import { mcpAuthOptions, mcpConfig, oauthIdentity } from "@/lib/mcp-auth";
import { createMoneybookMcpHandler } from "@/lib/mcp-server";
import { createNeonBookSnapshotReader } from "@/lib/neon-repository";
import { features, unavailableFeatureResponse } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = features.mcp ? createMoneybookMcpHandler(userId => createNeonBookSnapshotReader(userId, process.env.DATABASE_URL ?? "")()) : null;

async function authenticated(request: Request) {
  if (!handler || !features.mcp) return unavailableFeatureResponse();
  let config;
  try { config = mcpConfig(); } catch {
    return Response.json({ error: "oauth_not_configured" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  const response = await withMcpAuth(handler, async (_, bearer) => {
    if (!bearer) return undefined;
    try {
      // Online verification also checks revocation for the existing opaque Clerk tokens.
      const clerk = await clerkClient();
      return oauthIdentity(await clerk.idPOAuthAccessToken.verify(bearer, { audience: config.resource }), bearer, config);
    } catch { return undefined; }
  }, mcpAuthOptions(config))(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export { authenticated as GET, authenticated as POST, authenticated as DELETE };

export function OPTIONS() {
  if (!features.mcp) return unavailableFeatureResponse();
  return new Response(null, { status: 204, headers: { Allow: "GET, HEAD, POST, DELETE, OPTIONS", "Cache-Control": "private, no-store" } });
}
