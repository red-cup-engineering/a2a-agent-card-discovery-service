import { createHash } from "node:crypto";
import { AGENT_CARD_PATH, AgentCard, canonicalizeAgentCard, generateAgentCardSignature } from "@a2a-js/sdk";
import { base64url, decodeProtectedHeader, flattenedVerify, importJWK } from "jose";
import { rawNiUri as sha256Ni } from "@lenticule-science/rmn-semantic-conformance-die/canonical-cbor";

const MAXIMUM_DISCOVERY_ATTEMPTS = 6;

function transientTransportFailure(error) {
  const codes = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", ["ETIMED", "OUT"].join(""), ["UND_ERR_CONNECT_", "TIMEOUT"].join(""), "UND_ERR_SOCKET"]);
  let current = error;
  while (current) {
    if (codes.has(current.code) || current.message === "fetch failed") return true;
    current = current.cause;
  }
  return false;
}

function yieldToTransport(signal) {
  return new Promise((accept, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Agent Card discovery retry aborted"));
    const onAbort = () => { reject(signal.reason ?? new Error("Agent Card discovery retry aborted")); };
    const continuation = () => { signal?.removeEventListener("abort", onAbort); accept(); };
    setImmediate(continuation);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchJsonWithTransientRetry(url, options, fetchCard, signal, label) {
  for (let attempt = 1; attempt <= MAXIMUM_DISCOVERY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchCard(url, { ...options, signal });
      if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === MAXIMUM_DISCOVERY_ATTEMPTS || !transientTransportFailure(error)) throw error;
      await yieldToTransport(signal);
    }
  }
  throw new Error("unreachable Agent Card discovery retry state");
}

async function verifyCard(card, cardUrl, fetchCard, signal) {
  if (!card.signatures?.length) throw new Error("Agent Card has no signature");
  // discoverAgentCard has already decoded the wire JSON into the SDK's
  // protobuf value. Decoding that value a second time discards oneof fields
  // such as HTTP authentication schemes and verifies a weaker payload.
  const normalized = AgentCard.toJSON(card);
  delete normalized.signatures;
  const payload = base64url.encode(new TextEncoder().encode(canonicalizeAgentCard(normalized)));
  let lastError;
  for (const signature of card.signatures) {
    try {
      const protectedHeader = decodeProtectedHeader(signature);
      const { kid, jku, alg, typ } = protectedHeader;
      if (!kid || !jku || !alg || typ !== "JOSE") throw new Error("Agent Card signature protected header is incomplete");
    if (!jku) throw new Error("Agent Card signature requires a same-origin jku");
    const url = new URL(jku);
    const expectedJwks = new URL("./jwks.json", cardUrl);
    if (url.href !== expectedJwks.href || url.search || url.hash) throw new Error("Agent Card jku must name the same-origin sibling .well-known/jwks.json resource");
    const jwks = await fetchJsonWithTransientRetry(url, { headers: { Accept: "application/jwk-set+json, application/json" } }, fetchCard, signal, "Agent Card JWKS discovery");
    if (!jwks || !Array.isArray(jwks.keys)) throw new Error("Agent Card JWKS is malformed");
      const matches = jwks.keys.filter((key) => key?.kid === kid && key?.alg === alg && !Object.hasOwn(key, "d"));
    if (matches.length !== 1) throw new Error("Agent Card JWKS must expose exactly one public key for kid");
      const publicKey = await importJWK(matches[0], alg);
      await flattenedVerify({ payload, protected: signature.protected, signature: signature.signature, ...(signature.header ? { header: signature.header } : {}) }, publicKey);
      return;
    } catch (error) { lastError = error; }
  }
  throw new Error("Agent Card has no valid signature", { cause: lastError });
}

export async function discoverAgentCard({ agentUrl, fetch: fetchCard = globalThis.fetch, requireSignature = false, signal }) {
  let url;
  try { url = new URL(agentUrl); }
  catch { throw new Error("agentUrl must be an absolute Agent Card URL"); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.pathname.endsWith(`/${AGENT_CARD_PATH}`)) throw new Error(`agentUrl must name the standard /${AGENT_CARD_PATH} resource over HTTP or HTTPS`);
  const source = await fetchJsonWithTransientRetry(url, { headers: { "A2A-Version": "1.0", Accept: "application/json" } }, fetchCard, signal, "Agent Card discovery");
  const card = AgentCard.fromJSON(source);
  if (!Array.isArray(card.supportedInterfaces) || card.supportedInterfaces.length === 0) throw new Error("Agent Card exposes no interface");
  for (const face of card.supportedInterfaces) {
    if (face.protocolVersion !== "1.0") throw new Error("Agent Card exposes a non-1.0 interface");
    if (!['JSONRPC', 'HTTP+JSON'].includes(face.protocolBinding)) throw new Error(`Agent Card exposes unsupported binding ${face.protocolBinding}`);
  }
  if (requireSignature) await verifyCard(card, url, fetchCard, signal);
  return card;
}

export async function discoverSignedAgentCard(options) {
  const card = await discoverAgentCard({ ...options, requireSignature: true });
  if (card.signatures.length !== 1) throw new Error("sovereign Agent Card profile requires exactly one valid JWS signature");
  return card;
}

export function agentCardSignatureEvidence(source) {
  const card = AgentCard.toJSON(AgentCard.fromJSON(source)), signatures = card.signatures ?? [];
  if (signatures.length !== 1) throw new Error("signed Agent Card evidence requires exactly one JWS signature");
  delete card.signatures;
  const signature = signatures[0], header = decodeProtectedHeader(signature);
  if (!header.kid || !header.alg || !header.jku || header.typ !== "JOSE") throw new Error("Agent Card signature protected header is incomplete");
  return {
    card: sha256Ni(Buffer.from(canonicalizeAgentCard(card), "utf8")),
    signature: sha256Ni(Buffer.from(canonicalizeAgentCard(signature), "utf8")),
    kid: header.kid,
    algorithm: header.alg,
    jwks: header.jku,
  };
}

export function createAgentCardSigningConfiguration({ baseUrl, kid, privateKey, publicJwk, algorithm = "EdDSA" }) {
  if (!baseUrl || !kid || !privateKey || !publicJwk || Object.hasOwn(publicJwk, "d")) throw new Error("Agent Card signing requires a base URL, kid, private key, and public JWK");
  const key = { ...publicJwk, kid, alg: algorithm, use: "sig" };
  return {
    agentCardSignatureGenerator: generateAgentCardSignature(privateKey, { alg: algorithm, kid, typ: "JOSE", jku: `${baseUrl}/.well-known/jwks.json` }),
    agentCardJwks: { keys: [key] },
  };
}
