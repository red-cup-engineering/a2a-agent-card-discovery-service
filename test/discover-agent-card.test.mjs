import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { generateAgentCardSignature } from "@a2a-js/sdk";
import { exportJWK } from "jose";

import { discoverSignedAgentCard } from "../src/discover-agent-card.mjs";

const BASE_URL = "https://provider.invalid";
const CARD_URL = `${BASE_URL}/.well-known/agent-card.json`;
const JWKS_URL = `${BASE_URL}/.well-known/jwks.json`;

function unsignedCard() {
  return {
    name: "Transient discovery fixture",
    description: "Exercises the read-only signed Agent Card discovery seam.",
    supportedInterfaces: [{ url: `${BASE_URL}/a2a/jsonrpc`, protocolBinding: "JSONRPC", tenant: "", protocolVersion: "1.0" }],
    provider: { url: "https://emsenn.net/", organization: "A2A Services Section" },
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    securitySchemes: {}, securityRequirements: [],
    defaultInputModes: ["application/rmn+cbor"], defaultOutputModes: ["application/rmn+cbor"],
    skills: [], signatures: [],
  };
}

async function signedFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519"), kid = "discovery-test-ed25519";
  const generator = generateAgentCardSignature(privateKey, { alg: "EdDSA", kid, typ: "JOSE", jku: JWKS_URL });
  const card = await generator(unsignedCard());
  const key = { ...(await exportJWK(publicKey)), kid, alg: "EdDSA", use: "sig" };
  return { card, jwks: { keys: [key] } };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("signed discovery retries transient card and JWKS transport failures", async () => {
  const fixture = await signedFixture(), attempts = { card: 0, jwks: 0 };
  const fetch = async (url) => {
    if (String(url) === CARD_URL) {
      attempts.card += 1;
      if (attempts.card === 1) throw Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
      return json(fixture.card);
    }
    assert.equal(String(url), JWKS_URL);
    attempts.jwks += 1;
    if (attempts.jwks === 1) throw new TypeError("fetch failed", { cause: Object.assign(new Error("socket closed"), { code: "UND_ERR_SOCKET" }) });
    return json(fixture.jwks);
  };
  const card = await discoverSignedAgentCard({ agentUrl: CARD_URL, fetch });
  assert.equal(card.name, "Transient discovery fixture");
  assert.deepEqual(attempts, { card: 2, jwks: 2 });
});

test("an invalid signature remains a semantic refusal and is not retried", async () => {
  const fixture = await signedFixture(), attempts = { card: 0, jwks: 0 };
  fixture.card.signatures[0].signature = `${fixture.card.signatures[0].signature[0] === "A" ? "B" : "A"}${fixture.card.signatures[0].signature.slice(1)}`;
  const fetch = async (url) => {
    if (String(url) === CARD_URL) { attempts.card += 1; return json(fixture.card); }
    attempts.jwks += 1; return json(fixture.jwks);
  };
  await assert.rejects(discoverSignedAgentCard({ agentUrl: CARD_URL, fetch }), /no valid signature/u);
  assert.deepEqual(attempts, { card: 1, jwks: 1 });
});

test("HTTP refusal is not retried", async () => {
  let attempts = 0;
  await assert.rejects(discoverSignedAgentCard({
    agentUrl: CARD_URL,
    fetch: async () => { attempts += 1; return json({ refused: true }, 503); },
  }), /Agent Card discovery returned HTTP 503/u);
  assert.equal(attempts, 1);
});

test("one explicit customer cancellation interrupts retry", async () => {
  let attempts = 0;
  const controller = new AbortController();
  const pending = discoverSignedAgentCard({
    agentUrl: CARD_URL,
    signal: controller.signal,
    fetch: async () => { attempts += 1; throw Object.assign(new Error("reset"), { code: "ECONNRESET" }); },
  });
  controller.abort(new Error("customer cancellation"));
  await assert.rejects(pending, /customer cancellation/u);
  assert.equal(attempts, 1);
});
