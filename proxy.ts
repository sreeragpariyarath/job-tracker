import { NextResponse, type NextRequest } from "next/server";
import { getAuth0 } from "./lib/auth0";
import { authConfigured } from "./lib/auth-policy";

export async function proxy(request: NextRequest) {
  if (!authConfigured()) {
    return new NextResponse(request.nextUrl.pathname.startsWith("/api/")
      ? JSON.stringify({ error: "Authentication is not configured" })
      : "Authentication is not configured. Set the required Auth0 environment variables.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "Content-Type": request.nextUrl.pathname.startsWith("/api/") ? "application/json" : "text/plain" },
    });
  }
  const response = await getAuth0().middleware(request);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
export const config = { matcher: ["/", "/auth/:path*", "/api/applications/:path*", "/mcp/approve/:path*"] };
