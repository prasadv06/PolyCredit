import express from 'express';
import cors from 'cors';
import axios from 'axios';
import type { UnifiedMarket } from '../shared/types';
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 3001;

// Map to store active scanner intervals per wallet
const activeAgents = new Map<string, NodeJS.Timeout>();
const lastLogged = new Map<string, number>();

async function fetchMarkets(): Promise<{ predict: UnifiedMarket[], opinion: UnifiedMarket[], probable: UnifiedMarket[] }> {
    try {
        const predict = getFallbackPredictMarkets();
        const opinionRes = await axios.get(`${FRONTEND_URL}/api/mock-opinion`).catch(() => ({ data: [] }));
        const probableRes = await axios.get(`${FRONTEND_URL}/api/mock-probable`).catch(() => ({ data: [] }));

        return { predict, opinion: opinionRes.data, probable: probableRes.data };
    } catch (e) {
        console.error("Failed fetching markets", e);
        return { predict: [], opinion: [], probable: [] };
    }
}

function getFallbackPredictMarkets(): UnifiedMarket[] {
    return [
        {
            id: "predict-1",
            platform: "predict",
            question: "Will BNB reach $1000 by end of year?",
            yesPrice: 0.46,
            noPrice: 0.54,
            volume: 500000,
            liquidity: 100000,
        },
        {
            id: "predict-2",
            platform: "predict",
            question: "Will opBNB exceed 100M daily TXs in Q4?",
            yesPrice: 0.85,
            noPrice: 0.15,
            volume: 150, // Barely passes minimum liquidity
            liquidity: 50,
        }
    ];
}

async function runArbitrageScanner(wallet: string) {
    console.log(`[${new Date().toISOString()}] [Wallet: ${wallet}] Scanning markets...`);

    const { predict, opinion, probable } = await fetchMarkets();
    const mockMarkets = [...opinion, ...probable];

    if (!predict.length || !mockMarkets.length) return;

    for (const pMarket of predict) {
        if (pMarket.volume < 100) continue;

        const matchedMocks = mockMarkets.filter(m => m.question === pMarket.question && m.volume >= 100);

        for (const mMarket of matchedMocks) {
            const costBuyYesPredictNoMock = pMarket.yesPrice + mMarket.noPrice;
            const costBuyNoPredictYesMock = pMarket.noPrice + mMarket.yesPrice;

            let spread = 0;
            let logMsg = "";
            let logId = "";

            if (costBuyYesPredictNoMock < 1.00) {
                spread = 1.00 - costBuyYesPredictNoMock;
                if (spread > 0.02) {
                    logMsg = `\n🚨 ARBITRAGE OPPORTUNITY FOUND 🚨\nMarket: ${pMarket.question}\nBuy YES on Predict.fun at ${pMarket.yesPrice.toFixed(2)}\nBuy NO on ${mMarket.platform.charAt(0).toUpperCase() + mMarket.platform.slice(1)} (Mock) at ${mMarket.noPrice.toFixed(2)}\nTotal Cost: ${costBuyYesPredictNoMock.toFixed(2)}\nGuaranteed Profit: ${spread.toFixed(2)}\n`;
                    logId = `${wallet}-yes_p-no_${mMarket.platform}-${pMarket.id}`;
                }
            } else if (costBuyNoPredictYesMock < 1.00) {
                spread = 1.00 - costBuyNoPredictYesMock;
                if (spread > 0.02) {
                    logMsg = `\n🚨 ARBITRAGE OPPORTUNITY FOUND 🚨\nMarket: ${pMarket.question}\nBuy NO on Predict.fun at ${pMarket.noPrice.toFixed(2)}\nBuy YES on ${mMarket.platform.charAt(0).toUpperCase() + mMarket.platform.slice(1)} (Mock) at ${mMarket.yesPrice.toFixed(2)}\nTotal Cost: ${costBuyNoPredictYesMock.toFixed(2)}\nGuaranteed Profit: ${spread.toFixed(2)}\n`;
                    logId = `${wallet}-no_p-yes_${mMarket.platform}-${pMarket.id}`;
                }
            }

            if (spread > 0.02 && logMsg && logId) {
                const now = Date.now();
                const last = lastLogged.get(logId) || 0;

                // Avoid duplicate logging for same opportunity within 10 seconds
                if (now - last > 10000) {
                    console.log(logMsg);
                    lastLogged.set(logId, now);

                    // PRODUCTION EXECUTION FLOW:
                    // 1. Take flashloan
                    // 2. Buy YES on Predict
                    // 3. Buy NO on Opinion
                    // 4. Lock winning side into AegisVault
                    // 5. Mint crUSD
                    // 6. Repay flashloan
                    // 7. Keep spread
                }
            }
        }
    }
}

app.post('/api/start-agent', (req, res) => {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "Wallet address required" });

    if (activeAgents.has(wallet)) {
        return res.status(200).json({ message: "Agent already running for this wallet" });
    }

    console.log(`\n▶️ Starting arbitrage bot for wallet: ${wallet}`);
    runArbitrageScanner(wallet);
    const interval = setInterval(() => runArbitrageScanner(wallet), 5000);
    activeAgents.set(wallet, interval);

    return res.status(200).json({ message: "Agent started successfully" });
});

app.post('/api/stop-agent', (req, res) => {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "Wallet address required" });

    if (activeAgents.has(wallet)) {
        clearInterval(activeAgents.get(wallet)!);
        activeAgents.delete(wallet);
        console.log(`\n⏹️ Stopped arbitrage bot for wallet: ${wallet}`);
        return res.status(200).json({ message: "Agent stopped cleanly" });
    }

    return res.status(404).json({ error: "No active agent found for this wallet" });
});

// Simple status endpoint
app.get('/api/status', (req, res) => {
    const wallet = req.query.wallet as string;
    const isRunning = wallet ? activeAgents.has(wallet) : false;
    res.json({ isRunning });
});

// Central Log Endpoint for UI to stream events to terminal
app.post('/api/log', (req, res) => {
    const { message, data, type } = req.body;
    const prefix = type === 'error' ? '❌ [Frontend Error]' : '✅ [Frontend Log]';

    if (data) {
        console.log(`${prefix} ${message}`, data);
    } else {
        console.log(`${prefix} ${message}`);
    }

    res.status(200).send();
});

app.listen(PORT, () => {
    console.log(`🚀 Agent Backend listening on port ${PORT}`);
});
