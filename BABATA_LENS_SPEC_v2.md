# Babata Lens — Technical Specification & Architecture
## Revised Architecture v2

**Companion document:** `ANTIGRAVITY_IMPLEMENTATION_PROMPT.md`

This document is the architectural source of truth for Babata Lens. The companion prompt is the execution specification for Antigravity.

> **Revision goals:** preserve the strong security/provider-abstraction foundation of v1 while correcting provider coverage, mobile/desktop UX, secret handling, deployment assumptions, AI-provider flexibility, and implementation sequencing.

---

## A. Product Requirements

### A.1 Product Positioning

**Babata Lens** is a personal AI-powered intelligence workspace for cryptocurrency, market, wallet, token, and blockchain research.

The central interaction is conversational:

**User → Babata → tools → external providers → normalized data → analysis → visual result**

Babata is an analysis interface, not an oracle. It must clearly distinguish:
- FACT
- DATA
- CALCULATION
- INFERENCE
- HYPOTHESIS

It must never fabricate missing market/on-chain data.

### A.2 Personas

- **Single operator / owner** — MVP is intentionally single-user.
- **On-chain investigator** — traces addresses, transactions, contracts, and activity.
- **Market researcher** — compares market information across sources.
- **Future:** additional authenticated users.

### A.3 Core MVP Use Cases

1. Ask Babata a natural-language question.
2. Look up a token by symbol or contract.
3. Look up a wallet/address.
4. Inspect a transaction or contract where supported.
5. Compare a data point across providers.
6. View provider health without exposing secrets.
7. View charts and source/timestamp metadata.
8. Receive clear error states when providers fail.

### A.4 Provider Coverage

The architecture MUST support the user's intended provider ecosystem without hard-coding the UI or agent to any one vendor.

Target provider adapters:

| Capability | Initial/target adapters |
|---|---|
| AI | Anthropic-compatible, OpenRouter, Google AI/Gemini-compatible |
| Market data | CoinGecko, CoinMarketCap |
| Ethereum/blockchain | Etherscan, Alchemy |
| Solana/blockchain | Solscan, Alchemy where applicable |
| Analytics | Dune |
| Exchange | BingX |
| Future | Additional providers through the same interfaces |

These adapters may be implemented in stages, but the provider registry and interfaces must be designed for all of them from the beginning.

**Important:** API availability, pricing, rate limits, endpoint access, and licensing vary by provider. The implementation must verify the exact endpoint/features actually available to the configured account instead of assuming every plan exposes every API.

### A.5 MVP vs Expansion

**MVP:**
- responsive dashboard
- Babata chat
- secure server-side provider abstraction
- AI provider routing abstraction
- at least one working provider for each required capability
- token/market lookup
- wallet/address lookup
- transaction/contract lookup where supported
- basic charts
- source/timestamp attribution
- provider health
- caching and rate limiting
- authentication
- tests

**Expansion:**
- all target provider adapters
- multi-chain coverage
- Dune query workspace
- wallet monitoring
- alerts
- watchlists
- scheduled research
- portfolio features
- multi-user auth
- advanced anomaly detection

The architecture must not require a rewrite when expansion begins.

### A.6 Non-Functional Requirements

- **Security:** no secret reaches client code, browser storage, logs, database rows, or Git.
- **UX:** calm, uncluttered, touch-friendly on Android and efficient on desktop.
- **Extensibility:** adding a provider should require an adapter + registry registration, not frontend rewrites.
- **Correctness:** provider output is validated before normalization.
- **Cost control:** cache, deduplicate, route models by task, and avoid unnecessary calls.
- **Observability:** every provider/tool operation has request ID, latency, status, and provider metadata.
- **Accessibility:** keyboard navigation, visible focus states, semantic controls, adequate touch targets, reduced-motion support.

---

# B. System Architecture

## B.1 Recommended Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts or another lightweight charting library
- AI SDK/provider adapters or direct official SDKs behind the `AIProvider` interface
- PostgreSQL using a serverless-compatible driver
- Upstash Redis for cache/rate limiting
- Zod
- Auth.js/NextAuth-compatible authentication layer
- Vitest
- Playwright for critical browser/E2E flows

Do not treat a specific vendor SDK as the architecture. The interface is the architecture.

## B.2 Layered Architecture

```text
┌─────────────────────────────────────────────────────┐
│ UI / Client                                          │
│ Dashboard · Chat · Markets · Wallets · Tokens       │
│ Mobile navigation · Desktop navigation · Charts     │
└───────────────────────┬─────────────────────────────┘
                        │ authenticated same-origin API
┌───────────────────────▼─────────────────────────────┐
│ Next.js Route Handlers / Server Actions              │
│ Auth · validation · response envelopes               │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│ Babata Orchestrator                                  │
│ intent · context · model routing · tool loop        │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│ Allowlisted Tool Registry                            │
│ typed, read-only capabilities                        │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│ Provider Registry / Abstraction                      │
│ AI · Market · Blockchain · Token · Analytics         │
│ Exchange                                             │
└───────┬─────────┬─────────┬─────────┬───────────────┘
        │         │         │         │
     AI APIs   Market    Chains    Analytics/Exchange
        │         │         │         │
┌───────▼─────────▼─────────▼─────────▼───────────────┐
│ Validation + Normalization                           │
│ provider schema → canonical internal schema          │
└───────────────────────┬─────────────────────────────┘
                        │
             ┌──────────▼──────────┐
             │ Redis cache         │
             │ PostgreSQL history  │
             └─────────────────────┘
```

## B.3 Monolith-First

Use one Next.js deployment for MVP. Keep strict internal module boundaries so a future service extraction remains possible.

Do not introduce microservices merely for appearance.

---

# C. Provider Interface Specification

All external calls MUST go through provider interfaces.

## C.1 Shared Metadata

```ts
interface SourceMeta {
  provider: string;
  fetchedAt: string;
  network?: string;
  requestId?: string;
}
```

Do not attach `source` to a JavaScript array using an intersection such as `Transaction[] & { source: ... }`. Return an explicit object instead:

```ts
interface ProviderResult<T> {
  data: T;
  source: SourceMeta;
}
```

This avoids invalid/awkward runtime shapes.

## C.2 Provider Interfaces

```ts
interface AIProvider {
  id: string;
  generateResponse(input: AgentInput): Promise<AgentOutput>;
}

interface MarketDataProvider {
  id: string;
  getTokenMarketData(query: TokenQuery): Promise<ProviderResult<TokenMarketData>>;
  getMarketHistory(query: TokenQuery, range: TimeRange): Promise<ProviderResult<PricePoint[]>>;
}

interface BlockchainDataProvider {
  id: string;
  supportedNetworks: string[];
  getWalletBalance(address: string, network: string): Promise<ProviderResult<WalletBalance>>;
  getWalletTransactions(
    address: string,
    network: string,
    page?: Pagination
  ): Promise<ProviderResult<Transaction[]>>;
  getTransactionInformation(
    txHash: string,
    network: string
  ): Promise<ProviderResult<TransactionDetail>>;
  getContractInformation(
    address: string,
    network: string
  ): Promise<ProviderResult<ContractInfo>>;
}

interface TokenDataProvider {
  id: string;
  supportedNetworks: string[];
  getTokenHolders(
    address: string,
    network: string
  ): Promise<ProviderResult<HolderInfo[]>>;
}

interface AnalyticsProvider {
  id: string;
  runAnalyticsQuery(
    query: AnalyticsQuery
  ): Promise<ProviderResult<AnalyticsResult>>;
}

interface ExchangeDataProvider {
  id: string;
  getExchangeTicker(
    symbol: string
  ): Promise<ProviderResult<TickerData>>;
}
```

A provider can implement more than one interface only if its capabilities genuinely overlap.

## C.3 Registry

Provider manifests should expose:

- provider ID
- capability
- supported networks
- enabled/disabled
- priority
- rate-limit policy
- timeout
- cache policy
- required environment variables by NAME only
- health-check method

Secrets themselves never belong in the registry.

## C.4 Adapter Plan

Create adapters under:

```text
lib/providers/
├── ai/
│   ├── anthropic/
│   ├── openrouter/
│   └── google/
├── market/
│   ├── coingecko/
│   └── coinmarketcap/
├── blockchain/
│   ├── etherscan/
│   ├── alchemy/
│   └── solscan/
├── analytics/
│   └── dune/
├── exchange/
│   └── bingx/
└── registry.ts
```

The exact SDK choice is implementation-dependent. Prefer official SDKs when stable and appropriate; otherwise use a server-side HTTP client with fixed allowlisted base URLs.

---

# D. Data Model & Persistence

## D.1 Core Entities

- `users`
- `conversations`
- `messages`
- `tool_call_logs`
- `provider_configs`
- `provider_health`
- `watchlist_items` (future)
- optional `research_runs` (future)

### Important correction

Provider credentials MUST NOT be stored in `provider_configs`.

`provider_configs` may store:
- provider ID
- capability
- enabled
- priority
- non-secret settings
- rate-limit policy

Secrets exist only in the deployment secret store/environment.

## D.2 Cache

Redis is the primary hot cache.

Suggested starting TTLs:
- fast-changing market price: ~15–60 seconds
- market metadata: several minutes
- holder data: several minutes
- contract metadata: hours/days
- Dune analytics: query-dependent; do not use a generic TTL without considering query cost/freshness

TTL values must be configurable per provider/capability.

## D.3 Conversation Storage

Persist conversation history only as needed for the product.

Never store API keys, authorization headers, raw provider secrets, or unnecessary sensitive request data.

Tool logs must redact sensitive parameters.

---

# E. Internal API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Babata conversation + tool loop |
| `/api/providers/health` | GET | provider status |
| `/api/market/:symbol` | GET | direct market lookup |
| `/api/wallet/:network/:address` | GET | wallet lookup |
| `/api/token/:network/:address` | GET | token lookup |
| `/api/transaction/:network/:hash` | GET | transaction lookup |
| `/api/conversations` | GET/POST | conversation management |
| `/api/conversations/:id/messages` | GET | message history |

Tool execution should normally be an internal function call rather than a publicly callable HTTP endpoint. If an internal endpoint is needed, it must be inaccessible to unauthenticated clients and must not accept arbitrary tools.

Every API boundary:
- authenticates
- validates with Zod
- rate-limits
- returns typed error envelopes
- avoids raw stack traces
- attaches request IDs

---

# F. Babata AI Specification

## F.1 Tool Calling

Babata receives only the tools relevant to the current request.

Tools are:
- allowlisted
- typed
- read-only for MVP
- provider-specific where appropriate
- rate/budget limited

No arbitrary HTTP tool.

No arbitrary code-execution tool.

No arbitrary URL-fetch tool.

## F.2 Grounding

For data claims, Babata should cite tool-derived data.

If a claim is an inference, label it as such.

If data is missing, say so.

If two providers disagree, show both values with timestamps and sources.

Never silently average conflicting data.

## F.3 Context

Use:
- recent message window
- compact conversation summary for older history
- per-turn tool-result cache

Do not introduce cross-conversation financial memory in MVP.

## F.4 Model Routing

Use an abstract routing policy:

```text
simple → fast/low-cost
standard → balanced
complex → high-capability
```

The specific model IDs must be configurable and must not be hard-coded into business logic.

## F.5 AI Provider Failover

If the configured primary AI provider fails, Babata may use a configured fallback provider if:
- the fallback is enabled
- its credentials are valid
- the requested capability is supported
- cost/latency policy permits it

The UI should indicate when a fallback was used.

---

# G. UI/UX Specification — Android + PC

This section is a HARD REQUIREMENT.

The application must be comfortable on both Android and desktop PC.

The goal is **not maximum information density**.

The goal is **high information clarity with low visual fatigue**.

## G.1 Design Principles

1. Calm.
2. Minimal.
3. Clear hierarchy.
4. Large enough touch targets.
5. Few simultaneous visual elements.
6. Progressive disclosure.
7. Important information first.
8. Technical information hidden behind expandable sections.
9. Avoid excessive neon/glow.
10. Avoid excessive cards.

## G.2 Responsive Breakpoints

Use a mobile-first layout.

### Android / small screens
- one-column content
- bottom navigation or compact drawer
- sticky but compact chat input
- horizontally scrollable data tables where unavoidable
- cards stack vertically
- charts resize to container width
- no tiny text
- touch targets approximately 44px or larger

### Tablet
- two-column layouts where useful
- compact side navigation may appear

### Desktop
- sidebar navigation
- wider content area
- optional secondary panel for contextual details
- keyboard shortcuts may be added later

Do NOT simply shrink the desktop UI to mobile.

## G.3 Navigation

Desktop:

```text
Babata Lens
────────────
Dashboard
AI Chat
Markets
Wallets
Tokens
Analytics
────────────
Settings
Health
```

Mobile:
- primary navigation in a bottom navigation bar with only the most important destinations
- secondary pages accessible through a More/Drawer action

Do not place 8+ navigation items in a tiny mobile bottom bar.

## G.4 Dashboard

Desktop can show:
- market overview
- watch/recent activity
- one or two useful charts
- Babata quick actions
- provider status

Mobile should show:
1. Babata greeting / quick action
2. most important market summary
3. recent activity
4. optional chart

Avoid showing every metric simultaneously.

## G.5 Chat

Chat is the primary product experience.

Mobile:
- full-width conversation
- compact top bar
- fixed bottom composer
- quick actions horizontally scrollable
- tool activity shown as a compact status line
- source information collapsible

Desktop:
- centered readable conversation column
- optional contextual data panel
- composer remains easy to reach

Do not make chat bubbles excessively wide or dense.

## G.6 Visual Language

Suggested:
- near-black/dark navy background
- restrained blue/violet accent
- neutral surfaces
- high contrast text
- minimal gradients
- minimal glow
- subtle borders
- consistent radius
- no excessive glassmorphism

The futuristic feeling should come from typography, spacing, motion, charts, and Babata identity—not from covering the screen in effects.

## G.7 Babata Avatar

Use an original avatar inspired by futuristic cosmic AI aesthetics.

Do not copy or redistribute copyrighted Swallowed Star artwork without appropriate rights.

States:
- Idle
- Thinking
- Searching
- Analyzing
- Success
- Warning
- Error
- Offline

Animations should be subtle and respect `prefers-reduced-motion`.

## G.8 Accessibility

Required:
- semantic buttons/links
- visible focus
- keyboard navigation
- screen-reader labels
- sufficient contrast
- reduced-motion mode
- touch-friendly controls
- no information conveyed by color alone

---

# H. Security

## H.1 Secrets

All API keys and tokens are server-side only.

Never:
- commit them
- put them in `NEXT_PUBLIC_*`
- put them in frontend bundles
- put them in localStorage/sessionStorage
- put them in database records
- display them in health UI
- log them
- paste them into README/spec files

Use `.env.example` with variable NAMES only.

## H.2 Credential Rotation

Any credential that has been exposed in chat, source control, screenshots, logs, or client code must be revoked/rotated before production use.

## H.3 Authentication

Use a current Auth.js-compatible implementation appropriate for the chosen Next.js version.

MVP is single-user, but keep authorization checks centralized.

## H.4 Rate Limits

Apply:
- per-session
- per-IP
- per-tool
- per-provider

limits.

## H.5 Input Validation

Validate:
- addresses
- hashes
- network enum
- symbols
- pagination
- analytics query parameters

before provider calls.

## H.6 SSRF

No user/model-supplied URL fetching.

Provider base URLs are fixed constants/configuration.

## H.7 Prompt Injection

External text is DATA, never instructions.

Tool outputs must be delimited before being returned to the model.

## H.8 Financial Safety

Babata should present market/on-chain information as information and analysis, not as guaranteed outcomes.

Avoid unsupported certainty.

---

# I. Provider Health & Observability

Health states:

```text
configured
connected
degraded
rate_limited
invalid
unavailable
disabled
```

Health UI should show:
- provider
- capability
- status
- last successful request
- latency
- last checked

Never show secret values.

Structured logs:
- request ID
- provider
- capability
- operation
- latency
- status
- error code
- timestamp

Redact authorization headers and token-shaped values.

---

# J. Development Roadmap

### Phase 0 — Architecture
- finalize spec
- finalize implementation prompt
- decide exact deployment target
- decide exact database/auth packages

### Phase 1 — Foundation
- Next.js
- TypeScript
- Tailwind/shadcn
- auth
- responsive shell
- database
- env validation
- provider registry

### Phase 2 — Babata Core
- chat
- streaming
- tool registry
- AI provider abstraction
- source metadata
- error handling

### Phase 3 — Provider Adapters
Implement and test adapters incrementally:

1. AI primary + fallback
2. market provider(s)
3. Ethereum provider(s)
4. Solana provider(s)
5. exchange provider
6. analytics provider

Do not pretend an adapter works until a real configured account/API has passed its integration test.

### Phase 4 — Intelligence Pages
- Markets
- Wallets
- Tokens
- Transactions
- Analytics

### Phase 5 — Visualization
- price chart
- volume
- wallet activity
- holder distribution
- transaction timeline

### Phase 6 — Security
- secret audit
- dependency audit
- rate limits
- prompt-injection tests
- client-bundle secret scan
- auth tests

### Phase 7 — UX Polish
- Android testing
- desktop testing
- accessibility
- reduced motion
- empty/loading/error states
- visual simplification pass

### Phase 8 — Production
- deploy
- provider health
- smoke tests
- monitoring
- backup/recovery procedure

---

# K. Acceptance Criteria

Babata Lens is not considered complete merely because the page renders.

Minimum acceptance:

- no secret appears in client network payloads
- no secret appears in browser bundle
- no secret appears in logs
- provider calls use abstraction interfaces
- malformed provider data is rejected safely
- tool failures are surfaced without hallucination
- source + timestamp accompany tool-derived facts
- conflicting provider values remain distinguishable
- chat streams correctly
- mobile Android layout is usable one-handed
- desktop layout is comfortable at wide resolutions
- navigation is not visually crowded
- loading/error/empty states are implemented
- keyboard and reduced-motion behavior work
- critical flows have automated tests
- real provider integration has been tested with valid credentials in a secure environment

---

# L. Final Product Principle

Babata Lens should feel like:

> **A calm, intelligent command center for investigating complex market and blockchain information.**

Not:
- a cluttered crypto terminal
- a generic chatbot
- a wall of neon cards
- a collection of disconnected API demos

The user should be able to open Babata Lens on an Android phone or PC, ask Babata a question, understand the result quickly, inspect the evidence when needed, and continue the investigation without feeling overwhelmed.
