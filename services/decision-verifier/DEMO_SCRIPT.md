# 0G Compute Flow Demo Script

This repository includes a comprehensive demo script that demonstrates the complete 0G Compute Network flow step by step with detailed console logging.

## Overview

The `demo-compute-flow.ts` script is a single file that demonstrates the entire 0G compute workflow without any abstractions, showing exactly what happens at each step.

## What the Script Demonstrates

The script performs these steps in order:

1. **Initialize Wallet and Provider** - Sets up ethers.js wallet and connects to 0G testnet
2. **Create 0G Compute Broker** - Initializes the 0G Compute Network broker
3. **Check/Setup Ledger Account** - Ensures account exists and has funds
4. **List Available Services** - Discovers all available AI services on the network
5. **Select Provider and Acknowledge** - Chooses a provider and acknowledges it (required)
6. **Get Service Metadata** - Retrieves endpoint and model information
7. **Generate Authentication Headers** - Creates single-use auth headers for the request
8. **Send Query to AI Service** - Sends a demo query using OpenAI SDK format
9. **Process Response and Handle Payment** - Verifies response and processes micropayment
10. **Check Final Balance** - Shows balance changes and approximate costs
11. **Summary** - Provides complete demo results

## Prerequisites

1. **Environment Setup**: Ensure you have a `.env` file with:
   ```
   PRIVATE_KEY=your_private_key_here_without_0x_prefix
   ```

2. **Testnet ETH**: Your wallet needs testnet ETH for transactions
   - Get testnet tokens from: https://faucet.0g.ai

3. **Dependencies**: All dependencies should be installed:
   ```bash
   npm install
   ```

## Running the Demo Script

### Method 1: Using npm script (Recommended)
```bash
npm run demo
```

### Method 2: Direct execution
```bash
npx ts-node demo-compute-flow.ts
```

### Method 3: Compile and run
```bash
npm run build
node dist/demo-compute-flow.js
```

## Expected Output

The script provides detailed console output for each step:

```
🚀 Starting 0G Compute Network Flow Demo
==================================================

📋 Step 1: Initialize Wallet and Provider
------------------------------
✅ Wallet Address: 0x1234...
✅ RPC URL: https://evmrpc-testnet.0g.ai
💰 Wallet ETH Balance: 0.1 ETH

📋 Step 2: Create 0G Compute Broker
------------------------------
⏳ Creating ZG Compute Network Broker...
✅ Broker created successfully

📋 Step 3: Check/Setup Ledger Account
------------------------------
✅ Ledger account exists
💰 Current Ledger Balance: 0.1 OG

📋 Step 4: List Available Services
------------------------------
⏳ Fetching available services...
✅ Found 2 available services

🤖 Service 1:
   Model: llama-3.3-70b-instruct
   Provider: 0xf07240Efa67755B5311bc75784a061eDB47165Dd
   Service Type: inference
   URL: https://...
   Input Price: 0.000001 OG
   Output Price: 0.000002 OG
   Verifiability: TeeML

... [continues for all steps]
```

## What You'll Learn

By running this script, you'll see:

- **Exact API calls** made to the 0G Compute Network
- **Authentication flow** with single-use headers
- **Payment processing** with automatic micropayments
- **TEE verification** for enhanced trust
- **Error handling** for common issues
- **Balance tracking** and cost calculation

## Demo Query

The script uses a simple demo query: "What is the capital of France? Please answer in one sentence."

You can modify the `TEST_QUERY` constant in the script to try different prompts.

## Configuration

Key configuration constants in the script:

```typescript
const TEST_QUERY = "What is the capital of France? Please answer in one sentence.";
const FALLBACK_FEE = 0.01;
const INITIAL_FUND_AMOUNT = 0.1; // 0.1 OG tokens
```

## Official Providers

The script includes access to official 0G providers:

- **llama-3.3-70b-instruct**: `0xf07240Efa67755B5311bc75784a061eDB47165Dd`
- **deepseek-r1-70b**: `0x3feE5a4dd5FDb8a32dDA97Bed899830605dBD9D3`

## Troubleshooting

If the script fails, check:

1. **Private Key**: Ensure `PRIVATE_KEY` is set in `.env`
2. **Testnet ETH**: Wallet needs sufficient ETH for transactions
3. **Network**: Check connectivity to 0G testnet
4. **Balance**: Ensure ledger has sufficient OG tokens

The script provides detailed error messages and troubleshooting tips when issues occur.

## Use Cases

This script is perfect for:

- **Learning** the 0G Compute Network flow
- **Demonstrating** your setup and configuration
- **Debugging** integration issues
- **Understanding** the payment and verification process
- **Prototyping** new applications

## Next Steps

After running this script successfully, you can:

1. Integrate the flow into your own applications
2. Use the REST API server for web applications
3. Explore the CLI version for command-line tools
4. Build custom integrations using the patterns shown