export interface DiscoveredAgentCard extends Record<string, unknown> {
  readonly signatures: readonly unknown[];
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly supportedInterfaces: readonly Readonly<Record<string, unknown>>[];
}

export interface DiscoverAgentCardOptions {
  readonly agentUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly requireSignature?: boolean;
  readonly signal?: AbortSignal;
}

export declare function discoverAgentCard(options: DiscoverAgentCardOptions): Promise<DiscoveredAgentCard>;
export declare function discoverSignedAgentCard(options: Omit<DiscoverAgentCardOptions, "requireSignature">): Promise<DiscoveredAgentCard>;
export declare function agentCardSignatureEvidence(source: unknown): Readonly<{
  card: string;
  signature: string;
  kid: string;
  algorithm: string;
  jwks: string;
}>;
