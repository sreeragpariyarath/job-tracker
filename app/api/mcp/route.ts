import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authorizeMcp, type McpIdentity } from "@/lib/mcp/auth";
import { createTrackerMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const identity: { value?: McpIdentity } = {};
  const denied = await authorizeMcp(request, identity);
  if (denied) return denied;
  const server = createTrackerMcpServer(identity.value);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return Response.json({ error: "MCP request failed" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  } finally { await server.close(); }
}
async function unsupported(request: Request) {
  const denied = await authorizeMcp(request);
  return denied ?? new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "private, no-store" } });
}
export const GET = unsupported;
export const DELETE = unsupported;
