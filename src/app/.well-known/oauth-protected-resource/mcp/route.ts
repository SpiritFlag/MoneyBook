import { generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { mcpConfig, mcpScopes } from "@/lib/mcp-auth";
import { features, unavailableFeatureResponse } from "@/lib/features";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!features.mcp) return unavailableFeatureResponse();
  try {
    const config = mcpConfig();
    return Response.json(generateProtectedResourceMetadata({ authServerUrls: [config.issuer], resourceUrl: config.resource, additionalMetadata: { resource_name: "MoneyBook (read only)", scopes_supported: mcpScopes, bearer_methods_supported: ["header"] } }), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "oauth_not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export function OPTIONS() {
  if (!features.mcp) return unavailableFeatureResponse();
  return metadataCorsOptionsRequestHandler()();
}
