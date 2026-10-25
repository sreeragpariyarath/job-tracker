import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isOwner } from "../auth-policy";
import { mcpConfig } from "./config";

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export type McpIdentity = { sub: string; clientId: string; scopes: string[] };
export async function authorizeMcp(request: Request, identity?: { value?: McpIdentity }): Promise<Response | null> {
  let config;
  try { config = mcpConfig(); } catch { return reject("Authentication is not configured", 503); }
  const origin = request.headers.get("origin");
  // Server-to-server clients normally omit Origin. Browser origins must be explicitly trusted.
  if (origin && origin !== new URL(config.resource).origin) return reject("Origin is not allowed", 403);
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  const challenge = 'Bearer resource_metadata="' + config.metadata + '", scope="read:applications"';
  if (!token) return reject("Bearer token required", 401, challenge);
  try {
    let keys = keySets.get(config.issuer);
    if (!keys) { keys = createRemoteJWKSet(new URL(".well-known/jwks.json", config.issuer)); keySets.set(config.issuer, keys); }
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.issuer, audience: config.resource, algorithms: ["RS256"], requiredClaims: ["exp", "sub", "iat"],
    });
    if (!isOwner(payload.sub)) return reject("Access denied", 403);
    const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
    if (!scopes.includes("read:applications")) return reject("Read permission required", 403, challenge + ', error="insufficient_scope"');
    if (identity) identity.value = { sub: payload.sub!, clientId: typeof payload.azp === "string" ? payload.azp : typeof payload.client_id === "string" ? payload.client_id : "unknown", scopes };
    return null;
  } catch {
    return reject("Invalid or expired access token", 401, challenge + ', error="invalid_token"');
  }
}
function reject(error: string, status: number, challenge?: string) {
  return Response.json({ error }, { status, headers: {
    "Cache-Control": "private, no-store", ...(challenge ? { "WWW-Authenticate": challenge } : {}),
  } });
}
