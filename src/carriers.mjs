import { readFileSync } from "node:fs";
import { createSchema, validateInstance } from "@red-cup-engineering/json-schema-services-section";

const schema = (name) => createSchema(JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"))).schema;
export const AGENT_CARD_DISCOVERY_REQUEST_SCHEMA = schema("request");
export const AGENT_CARD_DISCOVERY_RESULT_SCHEMA = schema("result");
export const AGENT_CARD_DISCOVERY_REFUSAL_SCHEMA = schema("refusal");
export const AGENT_CARD_DISCOVERY_EAVT = Object.freeze({ entity: "$.supportedInterfaces[*].url", attributes: Object.freeze({ "$.name": "urn:attribute:a2a-agent-card:name", "$.supportedInterfaces[*].protocolBinding": "urn:attribute:a2a-agent-card:protocol-binding", "$.supportedInterfaces[*].protocolVersion": "urn:attribute:a2a-agent-card:protocol-version", "$.signatures[*].protected": "urn:attribute:a2a-agent-card:protected-signature" }), derived: true });
function admit(value, contract, label) { const result = validateInstance(value, contract); if (!result.ok) throw new TypeError(`${label} failed schema validation: ${JSON.stringify(result.errors)}`); return value; }
export const admitAgentCardDiscoveryRequest = (value) => admit(value, AGENT_CARD_DISCOVERY_REQUEST_SCHEMA, "Agent Card discovery request");
export const admitAgentCardDiscoveryResult = (value) => admit(value, AGENT_CARD_DISCOVERY_RESULT_SCHEMA, "Agent Card discovery result");
export const admitAgentCardDiscoveryRefusal = (value) => admit(value, AGENT_CARD_DISCOVERY_REFUSAL_SCHEMA, "Agent Card discovery refusal");
