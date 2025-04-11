# Solana Memecoin Sniping Bot - Development Plan (Dockerized)

## 1. Project Overview

This document outlines the development plan for a high-performance, production-ready Solana memecoin sniping bot designed to run within a Docker Compose environment. The bot will autonomously identify potential memecoins by monitoring liquidity pool creations, analyze them, execute buy orders rapidly, and manage sell positions based on predefined strategies. Communication between bot components will primarily utilize Redis Pub/Sub for speed and scalability within the Docker network.

## 2. Technology Stack

- **Runtime:** Node.js (Latest LTS)
- **Blockchain Interaction:** @solana/web3.js, @solana/spl-token
- **DEX Interaction:** Relevant SDKs (e.g., @raydium-io/raydium-sdk, @orca-so/whirlpools-sdk) or direct instruction construction.
- **Inter-Service Communication:** Redis (via ioredis Node.js client)
- **API Server:** Express
- **Real-time Updates:** Socket.io
- **Logging:** Winston (JSON format to stdout/files), Chalk (for debug console)
- **Process Management:** Docker Compose
- **Environment Variables:** dotenv
- **Security:** Environment variables within Docker Compose (consider secrets management for production)

## 3. Architecture (Dockerized)

The bot will consist of multiple independent Node.js services orchestrated by Docker Compose, communicating via a shared Redis instance.

-   **redis service:** Standard Redis image acting as the message broker.
-   **lp-monitor service:** Connects to Solana WebSocket, monitors DEX logs for new LP creations, validates basic info, and publishes relevant pool data to a Redis channel (e.g., new_pools).
-   **token-filter service:** Subscribes to the new_pools Redis channel. Fetches additional token metadata/checks, applies filtering rules (liquidity, deployer checks, basic honeypot detection), and publishes potentially tradeable tokens to a Redis channel (e.g., potential_buys).
-   **buy-executor service:** Subscribes to the potential_buys Redis channel. Constructs, signs, and sends buy transactions with high priority fees and slippage settings. Logs results meticulously and potentially publishes successful buys to a Redis channel (e.g., successful_buys).
-   **sell-manager service:** Subscribes to successful_buys (or monitors logs/internal state). Periodically fetches prices for owned tokens (using RPC or dedicated price feed service), evaluates take-profit/stop-loss conditions, executes sell transactions, and logs P/L.
-   **api-server service (Optional):** An Express/Socket.io server providing endpoints for monitoring bot status, viewing trades/logs, basic controls (start/stop), and potentially manual actions. Reads status/logs or communicates with other services via Redis/direct means if necessary.

**Communication Flow:**
Solana RPC/WS -> lp-monitor -> Redis (new_pools) -> token-filter -> Redis (potential_buys) -> buy-executor -> Redis (successful_buys) / Logs -> sell-manager -> Logs

## 4. Project Structure

```
solana-sniping-bot/
├── docker-compose.yml
├── .env.example             # Example environment variables
├── .env                     # Actual environment variables (git ignored)
├── services/
│   ├── lp-monitor/
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   └── index.js       # LP Monitor entry point
│   │   └── package.json
│   ├── token-filter/
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   └── index.js       # Token Filter entry point
│   │   └── package.json
│   ├── buy-executor/
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   └── index.js       # Buy Executor entry point
│   │   └── package.json
│   ├── sell-manager/
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   └── index.js       # Sell Manager entry point
│   │   └── package.json
│   └── api-server/ (Optional)
│       ├── Dockerfile
│       ├── src/
│       │   └── index.js       # API Server entry point
│       └── package.json
├── shared/
│   ├── config.js            # Shared configuration loader (reads .env)
│   ├── constants.js         # Shared constants (e.g., Redis channels, SOL mint)
│   ├── connection.js        # Shared Solana connection logic
│   ├── wallet.js            # Shared wallet loading logic
│   ├── logger.js            # Shared Winston/Chalk logger utility
│   └── utils/               # Shared helper functions
├── logs/                    # Log output directory (mounted volume)
│   ├── lp-monitor.log
│   ├── token-filter.log
│   ├── buy-executor.log
│   ├── sell-manager.log
│   ├── errors/
│   └── transactions/
├── scripts/                 # Analysis scripts (run manually or via docker exec)
│   ├── profit-tracker.js
│   └── performance-analyzer.js
└── README.md                # Project documentation
```

## 5. Development Phases & Timeline (Estimate)

-   **Phase 1: Core Infrastructure & Setup (Week 1)**
    -   Initialize project structure.
    -   Set up Docker Compose configuration with Node.js base images and Redis.
    -   Implement shared modules: config.js, constants.js, logger.js, connection.js, wallet.js.
    -   Establish basic service structure (lp-monitor, token-filter, etc.) with Dockerfiles.
    -   Implement secure wallet loading (initially via env vars).
    -   Implement robust Solana Connection handling with fallbacks.
-   **Phase 2: Monitoring & Filtering (Week 2)**
    -   Develop lp-monitor: WebSocket subscription to DEX logs, log parsing, publishing new pools to Redis.
    -   Develop token-filter: Redis subscription, token data fetching (metadata, basic checks), filtering logic, publishing potential buys to Redis.
-   **Phase 3: Trade Execution (Week 3)**
    -   Develop buy-executor: Redis subscription, transaction building (w/ priority fees, slippage), signing, sending (sendRawTransaction), confirmation logic, detailed logging, publishing success/failure to Redis/logs.
-   **Phase 4: Position Management (Week 4)**
    -   Develop sell-manager: Redis subscription/log monitoring, price fetching logic, TP/SL evaluation, sell transaction execution, P/L logging.
-   **Phase 5: API & Monitoring (Optional - Week 5)**
    -   Develop api-server: Express setup, basic status endpoints, Socket.io for real-time log/event streaming.
-   **Phase 6: Analysis, Testing & Refinement (Week 6)**
    -   Develop analysis scripts (profit-tracker.js, performance-analyzer.js).
    -   Implement comprehensive logging across all services.
    -   Conduct integration testing within Docker Compose.
    -   Performance tuning (priority fees, RPC usage, transaction optimization).
    -   Security review (especially wallet handling).
    -   Documentation (README, setup guide).

## 6. Detailed Component Implementation & Prompts

**(Use these prompts to generate the core code for each component)**

1.  **Shared Utilities (shared/)**
    *   **Prompt:** "Generate production-ready, fully commented Node.js code for shared utilities in a Solana bot project: 
        1.  config.js: Load configuration from .env files (RPC endpoints, wallet secret key, Redis URL, buy/sell parameters, priority fees, slippage BPS). Include validation for essential variables.
        2.  constants.js: Define shared constants like Redis channel names (e.g., NEW_POOLS_CHANNEL, POTENTIAL_BUYS_CHANNEL), common Solana addresses (SOL mint, System Program), and default settings.
        3.  logger.js: Create a Winston-based logger utility. Configure it for structured JSON logging to stdout (for Docker) and rotating files (mounted volume). Include optional Chalk formatting for console output controlled by a DEBUG env variable. Provide a function createLogger(context) for context-specific logging.
        4.  connection.js: Manage Solana Connection objects. Implement logic to connect using RPC endpoints from config, include fallback endpoints, handle connection errors gracefully, and provide a function getConnection() that returns a healthy connection.
        5.  wallet.js: Load a Solana Keypair from a base58 secret key stored in an environment variable (WALLET_SECRET_KEY). Include error handling for invalid keys and log the loaded public key. *Emphasize that using env vars for keys is insecure for mainnet production.*"

2.  **LP Monitor Service (services/lp-monitor/)**
    *   **Prompt:** "Generate production-ready, fully commented Node.js code for a Solana Liquidity Pool (LP) monitor service (lp-monitor). 
        -   Use @solana/web3.js to establish a WebSocket connection (logsSubscribe) to the Solana cluster specified in the config.
        -   Monitor logs for specific DEX program IDs (e.g., Raydium LP V4) to detect new pool creation events (e.g., Initialize2 instruction logs).
        -   Parse relevant data from logs: base mint, quote mint, LP pair address, authority, initial liquidity amounts (if available).
        -   Perform *minimal* validation (e.g., ensure necessary fields are present).
        -   Use the shared logger.js for detailed logging (connection status, detected pools, errors).
        -   Use ioredis to connect to the Redis instance specified in the config.
        -   Publish detected and minimally validated pool data (base mint, quote mint, lp address) as a JSON string to the Redis channel defined in constants.js (e.g., NEW_POOLS_CHANNEL).
        -   Implement robust error handling and automatic reconnection logic for both WebSocket and Redis connections."

3.  **Token Filter Service (services/token-filter/)**
    *   **Prompt:** "Generate production-ready, fully commented Node.js code for a Solana Token Filter service (token-filter).
        -   Use ioredis to connect to Redis and subscribe to the NEW_POOLS_CHANNEL.
        -   On receiving a message (new pool data), parse the JSON.
        -   Use the shared connection.js to get a Solana Connection.
        -   Perform filtering checks based on config:
            -   Fetch token metadata (if available) using the mint address.
            -   Check if mint/freeze authority exists (potential rug pull indicator).
            -   (Optional) Check initial liquidity amount against MIN_POOL_SIZE_SOL from config (requires fetching pool account data).
            -   (Optional) Implement basic checks against known scam wallets/patterns if feasible.
        -   Use the shared logger.js for detailed logging (received pools, filter results, errors).
        -   If a token passes *all* filters, publish its essential data (base mint, quote mint, lp address, maybe basic metadata) as a JSON string to the POTENTIAL_BUYS_CHANNEL in Redis.
        -   Implement efficient RPC usage and error handling."

4.  **Buy Executor Service (services/buy-executor/)**
    *   **Prompt:** "Generate production-ready, fully commented Node.js code for a Solana Buy Executor service (buy-executor).
        -   Use ioredis to connect to Redis and subscribe to the POTENTIAL_BUYS_CHANNEL.
        -   On receiving a message (potential buy data), parse the JSON.
        -   Use shared connection.js, wallet.js, and config.js.
        -   Load the wallet Keypair.
        -   Construct a swap transaction using @solana/web3.js and relevant DEX SDKs/instructions (e.g., Raydium's makeSwapInstructionSimple) to buy the base token using a configured amount of SOL (BUY_AMOUNT_SOL).
        -   Include ComputeBudgetProgram instructions to set a high compute unit limit (COMPUTE_UNITS_LIMIT) and priority fee (PRIORITY_FEE_MICRO_LAMPORTS) from config.
        -   Calculate and apply slippage tolerance (SLIPPAGE_TOLERANCE_BPS) from config to determine the minimum amount out.
        -   Handle Associated Token Account (ATA) creation if necessary (check existence, add create instruction if needed, many SDKs handle this).
        -   Create a Versioned Transaction.
        -   Sign the transaction.
        -   Send the transaction using sendRawTransaction with skipPreflight: true and appropriate maxRetries.
        -   Attempt to confirm the transaction using confirmTransaction with the connection's commitment level.
        -   Use the shared logger.js (transactionLogger) to log *every* step meticulously: preparation, calculated amounts, signing, signature obtained, sending attempt, confirmation status (success/failure with error details).
        -   (Optional) If successful, publish buy details (token mint, amount bought, tx signature, price) to a SUCCESSFUL_BUYS_CHANNEL in Redis."

5.  **Sell Manager Service (services/sell-manager/)**
    *   **Prompt:** "Generate production-ready, fully commented Node.js code for a Solana Sell Manager service (sell-manager).
        -   (Choose one strategy): 
            a) Subscribe to SUCCESSFUL_BUYS_CHANNEL on Redis to track new positions.
            b) Periodically read a state file/log populated by buy-executor.
        -   Maintain an in-memory or persistent (e.g., Redis hash) list of active positions (token mint, buy price, amount held).
        -   Periodically (e.g., every few seconds):
            -   For each active position, fetch its current price. (Requires fetching pool account data via RPC and calculating price, or using a price API like Jupiter/Birdeye).
            -   Evaluate sell conditions based on config: TAKE_PROFIT_PERCENTAGE and STOP_LOSS_PERCENTAGE relative to the buy price.
            -   If a sell condition is met:
                -   Construct, sign, and send a sell transaction (similar to buy, but swapping token for SOL) using appropriate DEX instructions, priority fees, and slippage.
                -   Confirm the transaction.
                -   Log the sell transaction details and calculated Profit/Loss using the shared logger.js.
                -   Remove the position from the active list.
        -   Implement robust price fetching, error handling, and transaction execution logic."

6.  **API Server Service (services/api-server/) (Optional)**
    *   **Prompt:** "Generate Node.js code for a simple API server using Express and Socket.io (api-server).
        -   Set up an Express server.
        -   Create basic REST endpoints:
            -   /status: Returns basic status information (e.g., running services, recent errors - might require reading logs or querying Redis).
            -   /logs: Stream recent log entries (read from log files or a Redis log stream).
        -   Integrate Socket.io.
        -   Configure Socket.io to potentially:
            -   Stream real-time logs forwarded by other services via Redis Pub/Sub.
            -   Emit events for significant actions (e.g., buy executed, sell triggered).
        -   Use the shared logger.js. Implement basic error handling.
        -   (Future) Add authentication and endpoints for control (start/stop, config changes)."

## 7. Docker Compose Setup

1.  **Create Dockerfile for each service:**
    *   Use a standard Node.js base image (e.g., node:18-alpine).
    *   Set working directory (e.g., /usr/src/app).
    *   Copy package.json and package-lock.json.
    *   Run npm ci --only=production (or npm install if development deps needed).
    *   Copy the service's src/ directory and the shared shared/ directory.
    *   Define the CMD to run the service's entry point (e.g., node src/index.js).
2.  **Create docker-compose.yml:**
    *   Define services: redis, lp-monitor, token-filter, buy-executor, sell-manager, api-server (optional).
    *   Use the official redis:alpine image for the redis service.
    *   For Node.js services, specify build: ./services/<service-name>.
    *   Define a shared network for inter-service communication.
    *   Use environment or env_file to pass configuration (RPC URLs, Wallet Key, Redis host (redis), API keys) from the .env file to the services.
    *   Define volumes to mount the logs/ directory for persistent logging across services.
    *   Set restart: unless-stopped or always for resilience.

## 8. Security Considerations

-   **Wallet Keys:** NEVER commit secret keys. Use .env files (gitignored) for development. For production, use Docker Secrets, environment variables injected by the orchestration platform, or a dedicated secrets manager (e.g., HashiCorp Vault). Hardware wallet integration is the most secure but complex.
-   **RPC Endpoints:** Use trusted, private RPC endpoints if possible, especially for sending transactions.
-   **API Security:** If implementing the API server, add authentication (e.g., JWT, API keys) and rate limiting immediately.
-   **Dependencies:** Regularly audit and update dependencies (npm audit).
-   **Input Validation:** Sanitize and validate all data received from external sources (RPC, Redis, APIs).
-   **Transaction Simulation:** Consider adding transaction simulation (connection.simulateTransaction) before sending critical transactions, although this adds latency.

## 9. Logging & Monitoring Strategy

-   **Structured Logging:** All services log structured JSON to stdout (captured by Docker) and potentially to files in the mounted /logs volume using Winston.
-   **Centralized Viewing:** Use Docker logging drivers (docker logs <container>) or set up a log aggregation stack (e.g., ELK/EFK, Loki) to view logs from all services centrally.
-   **Correlation IDs:** Consider adding unique IDs to trace requests/workflows across services.
-   **Metrics:** Integrate basic performance metrics (e.g., transaction times, queue lengths, error rates) potentially using Prometheus/Grafana.
-   **Alerting:** Set up alerts based on critical errors or performance degradation.

## 10. Testing Strategy

-   **Unit Tests:** Use a framework like Jest to test individual functions within shared utilities and service logic (mocking external dependencies like RPC calls, Redis).
-   **Integration Tests:** Write tests that run within the Docker Compose environment (docker-compose exec <service> npm test) to verify interactions between services via Redis.
-   **Simulation:** Test against Solana Devnet or Testnet before mainnet deployment.
-   **Canary Testing:** Deploy with a very small buy amount on mainnet initially.
-   **Manual Testing:** Use the API (if built) or docker exec to trigger actions and monitor behavior.

## 11. Deployment & Operations

-   **Environment Configuration:** Maintain separate .env files or configuration management for different environments (dev, staging, production).
-   **Deployment:** Use docker-compose up -d to start the services in the background.
-   **Updates:** Pull new code, rebuild images (docker-compose build), and restart services (docker-compose up -d --force-recreate).
-   **Monitoring:** Continuously monitor logs, container health, and resource usage.
-   **Backup:** Regularly back up persistent log data if required.
