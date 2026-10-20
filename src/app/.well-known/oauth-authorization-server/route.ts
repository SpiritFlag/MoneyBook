import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { mcpConfig } from "@/lib/mcp-auth";

export const dynamic = "force-dynamic";
// Compatibility discovery for older MCP clients; keep Clerk's real issuer/endpoints intact.
export async function GET() {
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
export const OPTIONS = metadataCorsOptionsRequestHandler();
