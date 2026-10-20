import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

const webAuthentication = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // MCP verifies OAuth bearer tokens itself. Never trigger browser session handshakes here.
  if (request.nextUrl.pathname === "/api/mcp" || request.nextUrl.pathname.startsWith("/.well-known/")) return NextResponse.next();
  return webAuthentication(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
