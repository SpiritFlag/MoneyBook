import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { mcpConfig } from "@/lib/mcp-auth";
import { features, unavailableFeatureResponse } from "@/lib/features";

export const dynamic = "force-dynamic";
// Compatibility discovery for older MCP clients; keep Clerk's real issuer/endpoints intact.
export async function GET() {
  if (!features.mcp) return unavailableFeatureResponse();
  try {
    const { issuer } = mcpConfig();
    const response = await fetch(`${issuer}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!response.ok) throw new Error("OAuth metadata unavailable");
    const metadata = await response.json();
    if (metadata.issuer !== issuer) throw new Error("OAuth issuer mismatch");
    return Response.json(metadata, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "oauth_metadata_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export function OPTIONS() {
  if (!features.mcp) return unavailableFeatureResponse();
  return metadataCorsOptionsRequestHandler()();
}
