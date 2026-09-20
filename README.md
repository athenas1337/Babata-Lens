# Babata Lens v2.4 // Market Analytics & Intelligence Agent

> High-performance autonomous crypto intelligence agent and multi-provider market analytics engine engineered with a futuristic obsidian cybernetic HUD, zero-key offline resilience, and multi-turn agentic reasoning.

---

## 1. Executive Overview & System Purpose

**Babata Lens v2.4** is an enterprise-grade crypto-analytical operating system and autonomous agentic interface designed to aggregate, sanitize, synthesize, and reason across disparate decentralized and centralized finance streams:
- **Autonomous Multi-Turn Agent Loop:** ReAct-style planning, autonomous tool-calling, and dynamic fallback between high-tier LLMs (Anthropic Claude 3.5 Sonnet, OpenRouter, Google Gemini 1.5 Pro) and the embedded offline rule engine (`babata-local-core-v2`).
- **Resilient Multi-Provider Architecture:** Circuit breakers (3-failure trip threshold, 60s cooldown), priority resolution, and token-bucket rate limiters guarding CoinGecko, CoinMarketCap, Etherscan, Alchemy, Solscan, Dune Analytics, and BingX.
- **Futuristic Blue UI & 8-State Reactive Avatar:** Obsidian space canvas (`#030712`), elevated glass HUD (`rgba(15, 30, 55, 0.45)`), neon cyan highlights (`#00F0FF`), electric violet (`#7000FF`), and real-time kinetic visualizer responding to agent cognition states: `idle`, `listening`, `thinking`, `analyzing`, `streaming`, `success`, `warning`, `error`.
- **Zero-Key Offline Graceful Degradation:** Works out-of-the-box without requiring third-party API keys through intelligent fallback mocks for offline developer testing and evaluation.

---

## 2. Directory & Architectural Topology

```
Babata Market Analytics/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                 # Streaming multi-turn agent endpoint with SSE
│   │   ├── conversations/route.ts        # Session listing & conversation persistence
│   │   ├── conversations/[id]/route.ts   # Conversation history and messages retrieval
│   │   ├── market/route.ts               # Direct market ticker and price history proxy
│   │   ├── providers/health/route.ts     # Health matrix & circuit breaker telemetry
│   │   └── wallet/route.ts               # Multi-chain wallet balances & history inspector
│   ├── globals.css                       # Obsidian space design system & glass styling
│   ├── layout.tsx                        # Root layout with HUD framework
│   └── page.tsx                          # Cybernetic HUD interface, chat & dashboard
├── components/
│   ├── agent/
│   │   └── ReactiveAvatar.tsx            # 8-state SVG/Canvas reactive cybernetic avatar
│   ├── chat/
│   │   ├── ChatInterface.tsx             # HUD terminal chat, streaming responses, tool output tabs
│   │   └── MessageItem.tsx               # Code-highlighted, markdown & tool-call telemetry message card
│   ├── dashboard/
│   │   ├── MarketOverview.tsx            # Real-time tickers, 24h delta, volume cards
│   │   └── ProviderMatrix.tsx            # Live circuit breaker health telemetry indicators
│   └── ui/
│       ├── Button.tsx                    # Cybernetic micro-interactive button with neon glow
│       ├── Card.tsx                      # Elevated HUD glass cards with border glow
│       └── Tabs.tsx                      # Modular tabbed container
├── lib/
│   ├── agent/
│   │   ├── orchestrator.ts               # Multi-turn autonomous tool execution loop
│   │   └── prompt.ts                     # System prompts, guardrails, and role definitions
│   ├── cache/
│   │   ├── index.ts                      # Cache factory & unified cache interface
│   │   └── memory.ts                     # In-memory TTL key-value cache with MD5 hashing
│   ├── config/
│   │   └── env.ts                        # Zod environment schema & validation
│   ├── db/
│   │   ├── index.ts                      # Database factory & interface
│   │   └── memory.ts                     # In-memory conversation, message & tool audit store
│   ├── observability/
│   │   └── logger.ts                     # Structured JSON logger with security scrubbing
│   ├── providers/
│   │   ├── ai/
│   │   │   ├── anthropic.ts              # Anthropic Claude 3.5 Sonnet adapter
│   │   │   ├── google.ts                 # Google Gemini 1.5 Pro adapter
│   │   │   ├── local.ts                  # Offline rule-based local intelligence engine
│   │   │   └── openrouter.ts             # OpenRouter multi-model adapter
│   │   ├── analytics/
│   │   │   └── dune.ts                   # Dune Analytics SQL query runner
│   │   ├── blockchain/
│   │   │   ├── alchemy.ts                # Alchemy multi-chain RPC provider
│   │   │   ├── etherscan.ts              # Etherscan EVM balances, contracts & tx provider
│   │   │   └── solscan.ts                # Solscan Solana balance & account provider
│   │   ├── exchange/
│   │   │   └── bingx.ts                  # BingX Spot & Swap public orderbook/ticker provider
│   │   ├── market/
│   │   │   ├── coingecko.ts              # CoinGecko market capitalization & historical provider
│   │   │   └── coinmarketcap.ts          # CoinMarketCap quotes and listings provider
│   │   ├── index.ts                      # Provider registry initialization
│   │   ├── interfaces.ts                 # Zod schemas & TypeScript contracts for all providers
│   │   └── registry.ts                   # Priority registry & circuit breaker manager
│   ├── security/
│   │   ├── rate-limiter.ts               # Token bucket rate limiting engine
│   │   └── sanitization.ts               # EVM/Solana regex, prompt-injection defense, XML wrappers
│   └── tools/
│       ├── definitions.ts                # Zod schemas for all 9 agent tools
│       ├── executor.ts                   # Dynamic tool resolver and execution dispatcher
│       └── index.ts                      # Tool exports
├── tests/
│   └── verification.ts                   # Empirical proof-of-correctness test harness
├── backupcode_coding-high/               # Automated pre-edit backups directory
├── package.json                          # Package manifest & script configurations
├── tsconfig.json                         # Strict TypeScript configuration
└── README.md                             # Comprehensive technical documentation
```

---

## 3. Technology Stack & Runtime Specifications

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | 14.2.35 | Server-rendered React framework & API routes |
| **Language** | TypeScript | 5.9.3 | Type safety, strict mode, ES2022 target |
| **Styling** | Tailwind CSS | 3.4.17 | Futuristic Blue Obsidian HUD design tokens |
| **Validation** | Zod | 3.24.2 | Runtime schema assertions, input sanitization |
| **Icons** | Lucide React | 0.475.0 | Cybernetic UI icons |
| **Runtime** | Node.js | v20+ (Verified v22) | Server-side execution engine |
| **Runner** | tsx | Latest | Direct TypeScript test execution |

---

## 4. 9 Autonomous Agent Tools

Babata Agent has 9 tools registered with parameters validated via Zod:

1. `get_token_market_data`: Real-time token market data (price, 24h change, volume, high, low, ATH, ATL, market cap, circulating supply).
2. `get_token_price_history`: Historical price points over timeframes (`24h`, `7d`, `30d`, `90d`, `1y`).
3. `get_wallet_balance`: Native and token balances for EVM (`0x...`) and Solana Base58 wallet addresses.
4. `get_wallet_transactions`: Recent transaction history with timestamps, counterparty addresses, and value transfers.
5. `get_transaction_details`: Deep inspection of a single transaction hash including block, gas fee, and status.
6. `get_contract_abi_info`: Smart contract source code verification status, compiler version, and ABI function signatures.
7. `get_token_holder_distribution`: Top wallet holder addresses, balance percentages, and contract indicators.
8. `run_dune_analytics`: Executes or retrieves Dune Analytics on-chain SQL query results.
9. `get_exchange_ticker`: Real-time order book quotes, bid/ask spread, and 24h high/low from BingX.

---

## 5. Security Architecture & Threat Defenses

- **Strict Cryptographic Address Sanitization:**
  - EVM: `^0x[a-fA-F0-9]{40}$` validated with regex checks.
  - Solana: `^[1-9A-HJ-NP-Za-km-z]{32,44}$` Base58 pattern verification.
- **Prompt Injection & Delimiter Neutralization:**
  - Strips adversarial injection strings (`ignore all previous instructions`, `<script>`, system overrides).
  - Escapes XML closing markers (`</tool_output>`, `]]>`) preventing context escape.
- **Token Bucket Rate Limiting:**
  - Configurable tokens-per-window per IP/session; rejects bursts with HTTP 429 once token bucket depletes.
- **Circuit Breaker Mechanics:**
  - Tracks consecutive failures across external providers.
  - Automatically trips to `OPEN` at 3 failures, preventing cascading upstream timeouts.
  - 60-second cooldown half-open probe before restoring provider to `CLOSED`.

---

## 6. Installation & Verification

### Prerequisites
- Node.js 18.x, 20.x, or 22.x
- npm or yarn

### Installation
```bash
# Clone the repository
git clone <repo-url>
cd "Babata Market Analytics"

# Install dependencies
npm install
```

### Environment Configuration
Create a `.env.local` file (optional, system operates in resilient zero-key offline mode by default):
```env
# AI Providers (Optional - LocalBabataEngine used if omitted)
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_AI_API_KEY=

# Market Providers (Optional)
COINGECKO_API_KEY=
COINMARKETCAP_API_KEY=

# Blockchain RPC Providers (Optional)
ETHERSCAN_API_KEY=
ALCHEMY_API_KEY=
SOLSCAN_API_KEY=

# Analytics Providers (Optional)
DUNE_API_KEY=
```

### Running the Empirical Verification Test Suite
```bash
npx tsx tests/verification.ts
```
Expected output:
```
================================================================================
     BABATA LENS v2.4 // EMPIRICAL PROOF-OF-CORRECTNESS TEST SUITE
================================================================================
--- TEST SUITE 1: Security & Sanitization ---
  [PASS] Validate EVM Address (Vitalik)
  [PASS] Reject Invalid EVM Address
  [PASS] Validate Solana Address (Base58)
  [PASS] Sanitize Prompt Injection & XML Delimiters
  [PASS] Format Tool Output with XML Tags

--- TEST SUITE 2: Rate Limiting & Token Bucket ---
  [PASS] Rate Limiter blocks after exceeding threshold

--- TEST SUITE 3: Circuit Breaker Mechanics ---
  [PASS] Initial circuit is closed
  [PASS] Circuit still closed at 2 failures
  [PASS] Circuit trips to OPEN at 3 failures
  [PASS] Circuit resets to CLOSED on success

--- TEST SUITE 4: Offline Rule-Based AI Engine ---
  [PASS] Local AI Engine generates response for token query
  [PASS] Local AI Engine identifies model as babata-local-core-v2

--- TEST SUITE 5: 9 Registered Tool Executions ---
  [PASS] Tool 1: get_token_market_data executes successfully
  [PASS] Tool 2: get_token_price_history returns points
  [PASS] Tool 3: get_wallet_balance returns EVM native balance
  [PASS] Tool 4: get_wallet_transactions returns tx list
  [PASS] Tool 5: get_transaction_details executes
  [PASS] Tool 6: get_contract_abi_info returns contract metadata
  [PASS] Tool 7: get_token_holder_distribution executes
  [PASS] Tool 8: run_dune_analytics executes
  [PASS] Tool 9: get_exchange_ticker executes

--- TEST SUITE 6: Babata Agent Orchestration & State Pipeline ---
  [PASS] Orchestrator completes analysis
  [PASS] Avatar state transitions fired (thinking -> streaming -> success)

================================================================================
TEST SUMMARY: 23 PASSED, 0 FAILED
================================================================================
```

### Production Build & Launch
```bash
# Build production bundle
npm run build

# Start production server
npm start
```
The application will be accessible at `http://localhost:3000`.

---

## 7. API Endpoints

- `POST /api/chat`: Accepts `{ message, conversationId? }`, streams agent thinking states and responses using SSE.
- `GET /api/market`: Query real-time token data with `?symbol=BTC` or historical series with `?symbol=BTC&history=true&timeframe=7d`.
- `GET /api/wallet`: Query wallet balances with `?address=0x...&network=ethereum`.
- `GET /api/providers/health`: Returns current status, capability, latency, and circuit breaker metrics for all registered providers.
- `GET /api/conversations`: Returns stored conversation threads.
- `GET /api/conversations/[id]`: Returns message timeline and tool audit outputs for a given session.
