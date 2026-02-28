# 🚀 Predict & Borrow

A unified prediction market terminal + non-custodial smart collateral vault that enables programmable Web3 credit on BNB Chain (opBNB Testnet).

## 🌍 Network Configuration (opBNB Testnet)
- **Network Name:** opBNB Testnet
- **RPC URL:** `https://opbnb-testnet-rpc.bnbchain.org`
- **Chain ID:** `5611`
- **Currency Symbol:** `tBNB`
- **Block Explorer:** [http://testnet.opbnbscan.com/](http://testnet.opbnbscan.com/)
- **Faucet:** [opBNB Faucet](https://docs.bnbchain.org/bnb-opbnb/developers/network-faucet/)

## 🏗 System Architecture & Narrative

1. **User Connection**: Users connect to the **Unified Terminal** to view aggregated prediction markets across Predict.fun, Opinion, and Probable platforms.
2. **Deposit & Lock**: Users can deposit prediction markets outcome tokens (like YES or NO shares) into the **AegisVault**.
3. **Programmable Credit**: The vault interacts with **UMA's Optimistic Oracle V2** to price the collateral. Based on a conservative 50% LTV, users can mint and borrow **crUSD**, a new synthetic stablecoin protocol.
4. **AI Arbitrage Agent**: Running autonomously in the background, a Node.js bot scans the aggregated platforms for market inefficiencies (e.g., YES on Platform A + NO on Platform B < $1.00). In a live scenario, this bot would utilize flashloans and the AegisVault's liquidity to capitalize on zero-risk spreads.
5. **Liquidation**: If a user's collateral drops in value as determined by the Optimistic Oracle, liquidators are incentivized with a 5% bonus to burn crUSD and seize collateral.

## 🛠 Directory Structure
- `/contracts`: Foundry environment for AegisVault, OracleResolver, and crUSD.
- `/frontend`: Next.js Dapp (App Router) integrated with `wagmi` and `shadcn/ui`.
- `/backend-agent`: Node.js typescript bot for background arbitrage monitoring.
- `/shared`: Common type definitions used between frontend and backend. 

---

## 💻 Getting Started

### 1. Smart Contracts
```bash
cd contracts
forge install
forge test
```
**To deploy to opBNB Testnet:**
1. Copy `.env.example` to `.env` and fill in `PRIVATE_KEY`.
2. Run deployment:
```bash
forge script script/DeployPhase1.s.sol --rpc-url opbnb_testnet --broadcast
```
3. To verify:
```bash
forge verify-contract <address> <contract_name> --verifier-url http://testnet.opbnbscan.com/api
```

### 2. Frontend Terminal
The frontend uses Next.js and Tailwind.
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 3. AI Arbitrage Agent
The agent runs independently and scans markets every 5 seconds.
```bash
cd backend-agent
npm install
npm start
```

## 📖 Useful Resources
- [opBNB Overview & Docs](https://docs.bnbchain.org/bnb-opbnb/)
- [UMA Optimistic Oracle V2](https://docs.uma.xyz/developers/optimistic-oracle-v2/getting-started)
- [Predict.fun Dev Portal & API](https://dev.predict.fun)
- [Foundry Book](https://book.getfoundry.sh/)
