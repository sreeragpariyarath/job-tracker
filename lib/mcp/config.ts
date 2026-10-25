import { authConfigured } from "../auth-policy";
export function mcpConfig() {
  if (!authConfigured()) throw new Error("Authentication is not configured");
  const domain = process.env.AUTH0_DOMAIN!;
  if (!/^[a-zA-Z0-9.-]+$/.test(domain)) throw new Error("Invalid Auth0 domain");
  const base = process.env.APP_BASE_URL!;
  return { resource: base + "/api/mcp", metadata: base + "/.well-known/oauth-protected-resource/api/mcp", issuer: "https://" + domain + "/" };
}
export function resourceMetadata() {
  const { resource, issuer } = mcpConfig();
  return { resource, resource_name: "Job Tracker", authorization_servers: [issuer],
    bearer_methods_supported: ["header"], scopes_supported: ["read:applications", "write:applications"] };
}
