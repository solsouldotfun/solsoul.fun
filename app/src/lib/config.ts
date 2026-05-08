export const DEFAULT_RPC_URL = "http://127.0.0.1:8899";
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";

function configuredRpcUrl(): string | undefined {
  if (typeof window === "undefined") {
    return (
      process.env.RPC ??
      process.env.RPC_URL ??
      process.env.SOLANA_RPC_URL ??
      process.env.NEXT_PUBLIC_RPC ??
      process.env.NEXT_PUBLIC_RPC_URL
    );
  }
  return process.env.NEXT_PUBLIC_RPC ?? process.env.NEXT_PUBLIC_RPC_URL;
}

export function getRpcEndpoints(
  rpcUrl: string | undefined = configuredRpcUrl(),
): string[] {
  const endpoints =
    rpcUrl
      ?.split(",")
      .map((endpoint) => endpoint.trim())
      .filter((endpoint) => endpoint.length > 0) ?? [];

  return endpoints.length > 0 ? endpoints : [DEFAULT_RPC_URL];
}

export function getRpcEndpoint(
  rpcUrl: string | undefined = configuredRpcUrl(),
): string {
  return getRpcEndpoints(rpcUrl)[0] ?? DEFAULT_RPC_URL;
}

export function getRpcFallbackEndpoint(
  rpcUrl: string | undefined = configuredRpcUrl(),
): string | undefined {
  return getRpcEndpoints(rpcUrl)[1];
}

export function isLoopbackRpcEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return ["127.0.0.1", "localhost", "0.0.0.0", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isDevnetSmokeEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_DEVNET_SMOKE,
  rpcUrl: string | undefined = configuredRpcUrl(),
): boolean {
  return flag === "1" && getRpcEndpoint(rpcUrl) === DEVNET_RPC_URL;
}
