import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { features } from "./lib/features";

const webAuthentication = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // A streamed notFound page can otherwise send HTTP 200 after the layout flushes.
  if (!features.buddyReviews && request.nextUrl.pathname === "/buddy") return new NextResponse("페이지를 찾을 수 없어요.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  // Dormant review routes return 404 themselves without starting a Clerk handshake.
  if (!features.buddyReviews && request.nextUrl.pathname === "/api/buddy-reviews") return NextResponse.next();
  // MCP verifies OAuth bearer tokens itself. Never trigger browser session handshakes here.
  if (request.nextUrl.pathname === "/mcp" || request.nextUrl.pathname === "/api/cron/trash" || request.nextUrl.pathname.startsWith("/.well-known/")) return NextResponse.next();
  return webAuthentication(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
