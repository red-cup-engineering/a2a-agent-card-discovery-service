# A2A Agent Card Discovery Service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

**Find out what a remote agent advertises before contacting it.** This
JavaScript library fetches and validates an
[Agent-to-Agent (A2A)](https://a2a-protocol.org/) **Agent Card**—a document
describing an agent's name, supported protocols, and capabilities. It accepts
the exact standard URL of the card, checks its compatibility with A2A 1.0,
and can additionally check a published signature.

This is a **discovery and validation library**, not an agent, an agent
directory/search index, a hosted registry, or a service that executes tasks
on behalf of the discovered agent.

## Use the library

The package is `@red-cup-engineering/a2a-agent-card-discovery-service`
(version `1.0.5` in this repository's manifest). In a JavaScript workspace
with the package and its dependencies resolved:

```js
import {
  discoverAgentCard,
  discoverSignedAgentCard,
  discoverAgentCardExchange,
} from '@red-cup-engineering/a2a-agent-card-discovery-service';

const agentUrl = 'https://YOUR-AGENT-HOST/.well-known/agent-card.json';

// Read a card; signatures are optional by default.
const card = await discoverAgentCard({ agentUrl });

// Require the library's single-signature, same-origin JWKS profile.
const verifiedCard = await discoverSignedAgentCard({ agentUrl });

// Or receive a typed success/refusal outcome rather than an exception.
const exchange = await discoverAgentCardExchange({ agentUrl });
if (exchange.outcome === 'refusal') {
  console.error(exchange.value.reason);
}
```

Replace `YOUR-AGENT-HOST` with a real provider hostname. The example
requires a reachable provider: no example server is started by this package.
The low-level functions also accept an injected `fetch` and an optional
cancellation `signal` for integration and tests.

## What it checks

- The URL is absolute HTTP(S) and points to the standard
  `/.well-known/agent-card.json` resource.
- The decoded card exposes at least one supported A2A 1.0 interface with
  JSON-RPC or HTTP+JSON binding.
- When signing is required, the card must carry the valid signature profile;
  public verification keys come from the same-origin sibling
  `/.well-known/jwks.json` resource.
- Transient transport failures are retried within a bounded attempt count;
  invalid cards and HTTP refusals are not silently accepted.

`discoverAgentCard` returns a parsed Agent Card and can reject with an
error. `discoverSignedAgentCard` enforces exactly one verified signature.
`discoverAgentCardExchange` validates the request and returns a structured
`{ outcome: 'result' | 'refusal', value }` carrier. Signature-evidence and
signing-configuration helpers also exist in the package's main export; the
caller is responsible for custody of any signing key supplied to the latter.

The [`./carriers`](src/carriers.mjs) export supplies request, result and
refusal schemas, validators, and a **derived** schema-to-EAVT mapping. It is
not a storage service.

## Status, testing, and boundaries

Source: [discovery implementation](src/discover-agent-card.mjs) and
[fixture-based tests](test/discover-agent-card.test.mjs).
The tests cover signature verification, transient network failure,
cancellation, and refusal behavior. They do **not** establish that any
particular external agent is live or trustworthy, nor does validating an
Agent Card authorize its advertised capabilities or prove that its claims
are true.

From a workspace that can resolve the declared dependencies:

```sh
npm test
npm run verify
```

This repository does not create or host Agent Cards, provide agent runtime
or task execution, or accept private keys during **discovery**. Check the
owning agent's runtime and operational documentation for those concerns.
