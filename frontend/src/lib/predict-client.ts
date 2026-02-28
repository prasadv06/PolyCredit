import { UnifiedMarket } from "../../../shared/types";

// Note: Testnet environment is configured internally by the SDK if initialized 
// properly or via custom endpoints, but as per documentation it typically requires 
// specific testnet args.
// We mock connection here if the actual SDK initialization requires private keys or wallet clients
// for purely read-only operations for the dashboard.
import axios from "axios";

// Helper to send logs to the backend terminal
const logToTerminal = async (message: string, data?: any, type: "info" | "error" = "info") => {
    try {
        await axios.post("http://localhost:3001/log", { message, data, type });
    } catch (e) { }
};

export async function fetchPredictMarkets(): Promise<UnifiedMarket[]> {
    try {
        // In a real integration using the "@predictdotfun/sdk", we might initialize the client:
        // const sdk = new PredictDotFun({
        //   env: "testnet",
        //   ...
        // });
        // const markets = await sdk.getMarkets();

        // For read-only fast integration in this hackathon, we fetch directly from testnet API or mock:
        // This assumes a standard REST interface structure for Predict.fun markets
        logToTerminal("[Predict SDK] Fetching live markets from Mainnet API Proxy...");
        const response = await axios.get("/api/predict/markets");

        if (response.data && response.data.data && Array.isArray(response.data.data.markets)) {
            const parsedMarkets = response.data.data.markets.map((m: any) => {
                const yesOutcome = m.outcomes?.find((o: any) => o.indexSet === 1 || o.name === "Yes" || o.name === "Up");
                const noOutcome = m.outcomes?.find((o: any) => o.indexSet === 2 || o.name === "No" || o.name === "Down");

                return {
                    id: `predict-${m.id}`,
                    platform: "predict",
                    question: m.question || m.name,
                    yesPrice: parseFloat(m.yesPrice) || 0.5,
                    noPrice: parseFloat(m.noPrice) || 0.5,
                    volume: parseFloat(m.volume) || 0,
                    liquidity: parseFloat(m.liquidity) || 0,
                    feeRateBps: m.feeRateBps || 0,
                    yesTokenId: yesOutcome?.onChainId || "",
                    noTokenId: noOutcome?.onChainId || "",
                    isNegRisk: m.isNegRisk || false,
                    isYieldBearing: m.isYieldBearing || false,
                };
            });
            logToTerminal(`[Predict SDK] Successfully fetched ${parsedMarkets.length} live markets.`);
            return parsedMarkets;
        }

        logToTerminal("[Predict SDK] Market format unrecognized. API returned:", response.data, "error");
        return getFallbackPredictMarkets();
    } catch (error: any) {
        logToTerminal("[Predict SDK] Failed to fetch live markets:", error.response?.data || error.message, "error");
        return getFallbackPredictMarkets();
    }
}

function getFallbackPredictMarkets(): UnifiedMarket[] {
    return [
        {
            id: "predict-1",
            platform: "predict",
            question: "Will BNB reach $1000 by end of year?",
            yesPrice: 0.46, // Arbitrage opportunity vs 0.48 on Opinion
            noPrice: 0.54,
            volume: 500000,
            liquidity: 100000,
            feeRateBps: 200,
            yesTokenId: "105401999338320699299139814306015367911534689612229640894628103579857219871368",
            noTokenId: "100066859240017368938741187569838777031869576690894277801772453907457337431903",
            isNegRisk: false,
            isYieldBearing: true,
        },
        {
            id: "predict-2",
            platform: "predict",
            question: "Will the Fed cut rates in the next meeting?",
            yesPrice: 0.70,
            noPrice: 0.30,
            volume: 800000,
            liquidity: 200000,
            feeRateBps: 200,
            yesTokenId: "43909596152648852984294652572712072006442258590588672074286680436512972349530",
            noTokenId: "64646943046191733641777129445030744477528389736966132217328636839976050772543",
            isNegRisk: false,
            isYieldBearing: true,
        },
    ];
}
