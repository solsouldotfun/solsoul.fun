export type RpcCluster = "devnet" | "localnet" | "unknown";

export interface RpcSourceMetadata {
  rpcEndpointLabel: string;
  rpcProvider: string;
  rpcCluster: RpcCluster;
  rpcCredentialRedacted: boolean;
}

const REDACTED_SUFFIX = ":<redacted>";

export function describeRpcSource(endpoint: string | undefined): RpcSourceMetadata {
  const parsed = parseEndpoint(endpoint);
  if (!parsed) {
    return {
      rpcEndpointLabel: "configured-rpc",
      rpcProvider: "configured-rpc",
      rpcCluster: "unknown",
      rpcCredentialRedacted: true,
    };
  }

  const rpcCluster = clusterFor(parsed);
  const rpcProvider = providerFor(parsed, rpcCluster);
  const rpcCredentialRedacted = hasCredentialMaterial(parsed);

  return {
    rpcEndpointLabel: `${rpcProvider}${rpcCredentialRedacted ? REDACTED_SUFFIX : ""}`,
    rpcProvider,
    rpcCluster,
    rpcCredentialRedacted,
  };
}

export function credentialSafeRpcLabel(source: {
  rpcEndpoint?: string;
  rpcEndpointLabel?: string;
  rpcProvider?: string;
}): string {
  if (isSafeLabel(source.rpcEndpointLabel)) {
    return source.rpcEndpointLabel;
  }
  if (isSafeLabel(source.rpcProvider)) {
    return source.rpcProvider;
  }
  if (isSafeLabel(source.rpcEndpoint)) {
    return source.rpcEndpoint;
  }
  return describeRpcSource(source.rpcEndpoint).rpcEndpointLabel;
}

function parseEndpoint(endpoint: string | undefined): URL | undefined {
  const trimmed = endpoint?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return new URL(trimmed);
  } catch {
    return undefined;
  }
}

function clusterFor(url: URL): RpcCluster {
  const host = url.hostname.toLowerCase();
  const body = `${host}${url.pathname}`.toLowerCase();
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    return "localnet";
  }
  if (body.includes("devnet")) {
    return "devnet";
  }
  return "unknown";
}

function providerFor(url: URL, cluster: RpcCluster): string {
  const host = url.hostname.toLowerCase();
  if (host === "api.devnet.solana.com") {
    return "solana-devnet";
  }
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    return "localnet-rpc";
  }
  if (host.includes("triton")) {
    return cluster === "devnet" ? "triton-devnet" : "triton-rpc";
  }
  if (host.includes("alchemy")) {
    return cluster === "devnet" ? "alchemy-devnet" : "alchemy-rpc";
  }
  if (host.includes("helius")) {
    return cluster === "devnet" ? "helius-devnet" : "helius-rpc";
  }
  if (host.includes("quicknode")) {
    return cluster === "devnet" ? "quicknode-devnet" : "quicknode-rpc";
  }
  return cluster === "devnet" ? "configured-devnet-rpc" : "configured-rpc";
}

function hasCredentialMaterial(url: URL): boolean {
  return Boolean(
    url.username ||
      url.password ||
      url.search ||
      (url.pathname && url.pathname !== "/" && url.hostname !== "api.devnet.solana.com"),
  );
}

function isSafeLabel(value: string | undefined): value is string {
  return Boolean(value && !value.includes("://") && !value.includes("?") && !value.includes("@"));
}
