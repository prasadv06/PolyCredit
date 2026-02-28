"use client";

import { useEffect, useState, useMemo } from "react";
import { UnifiedMarket } from "../../../shared/types";
import { BrowserProvider, parseUnits, formatUnits, ethers } from "ethers";
import { OrderBuilder, ChainId, Side } from "@predictdotfun/sdk";
import axios from "axios";
import { fetchPredictMarkets } from "@/lib/predict-client";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain, useWriteContract, useReadContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { bsc } from "wagmi/chains";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const AGENT_API_BASE = "http://localhost:3001/api";
const BNB_MAINNET_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BNB_MAINNET_CTF_YIELD = "0x9400F8Ad57e9e0F352345935d6D3175975eb1d9F";
const BNB_MAINNET_CTF_NON_YIELD = "0x22DA1810B194ca018378464a58f6Ac2B10C9d244";

const USDT_ADDRESS = BNB_MAINNET_USDT;
const AEGIS_VAULT_ADDRESS = "0xCe58f836203aD9FB0fbA42da07bcCfEf07C9b603";
const ORACLE_RESOLVER_ADDRESS = "0xF2363778d8024E1D1aAb8FB1Ea9dfac33cAFb02B";
const MOCK_UMA_ADDRESS = "0x550cAF85f05b4D36f6dFaC75E4CF3b3091cf1223";

export default function Dashboard() {
  const [liveMarkets, setLiveMarkets] = useState<UnifiedMarket[]>([]);
  const [mockMarkets, setMockMarkets] = useState<UnifiedMarket[]>([]);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [borrowAmount, setBorrowAmount] = useState<string>("");
  const [tradeAmount, setTradeAmount] = useState<string>("");
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [predictJwt, setPredictJwt] = useState<string>("");

  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);

  // --- Portfolio UI State ---
  const [activeView, setActiveView] = useState<"home" | "markets" | "portfolio">("home");
  const [portfolioPositions, setPortfolioPositions] = useState<any[]>([]);
  const [portfolioOrders, setPortfolioOrders] = useState<any[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<any[]>([]);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState<boolean>(false);

  // --- Vault & Liquidity State ---
  const [vaultTab, setVaultTab] = useState<"borrow" | "liquidity">("borrow");
  const [liquidityAmount, setLiquidityAmount] = useState<string>("");
  const [isLpActionLoading, setIsLpActionLoading] = useState<boolean>(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [isVaultActionLoading, setIsVaultActionLoading] = useState<boolean>(false);

  const { writeContractAsync } = useWriteContract();
  const [mounted, setMounted] = useState<boolean>(false);

  const derivedHoldings = useMemo(() => {
    const netMap: Record<string, any> = {};
    for (const ord of portfolioHistory) {
      const market = liveMarkets.find(m => m.id === `predict-${ord.marketId}`);
      const question = market?.question || `Market #${ord.marketId}`;
      const isBuy = ord.order?.side === 0;
      const makerAmt = parseFloat(ord.order?.makerAmount || "0") / 1e18;
      const takerAmt = parseFloat(ord.order?.takerAmount || "0") / 1e18;
      const tokenId = ord.order?.tokenId || "unknown";

      let side = "YES";
      if (market && (market as any).noTokenId === tokenId) side = "NO";

      const key = `${ord.marketId}-${side}`;
      if (!netMap[key]) netMap[key] = { marketId: ord.marketId, tokenId, question, side, shares: 0, totalCost: 0, price: "0", isYieldBearing: market?.isYieldBearing || true };

      const filledRaw = parseFloat(ord.amountFilled || "0") / 1e18;
      if (isBuy) {
        const price = takerAmt > 0 ? makerAmt / takerAmt : 0.5;
        const sharesBought = takerAmt > 0 ? filledRaw / price : 0;
        netMap[key].shares += sharesBought;
        netMap[key].totalCost += filledRaw;
      } else {
        netMap[key].shares -= filledRaw;
      }

      if (market) {
        netMap[key].price = side === "YES" ? market.yesPrice.toString() : market.noPrice.toString();
      } else {
        netMap[key].price = netMap[key].shares > 0 ? (netMap[key].totalCost / netMap[key].shares).toString() : "0.5";
      }
    }

    return Object.values(netMap)
      .filter(h => h.shares > 0.001)
      .map(h => ({
        asset: { id: `${h.marketId}-${h.side}`, market: { question: h.question, isYieldBearing: h.isYieldBearing }, onChainId: h.tokenId, price: h.price },
        side: h.side,
        quantity: h.shares.toString(),
        totalCost: h.totalCost,
        avgPrice: h.shares > 0 ? (h.totalCost / h.shares).toString() : "0"
      }));
  }, [portfolioHistory, liveMarkets]);

  // --- On-chain vault stats ---
  const { data: totalPoolLiq, refetch: refetchPool } = useReadContract({
    address: AEGIS_VAULT_ADDRESS as `0x${string}`,
    abi: [{ type: "function", name: "totalPoolLiquidity", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" }],
    functionName: "totalPoolLiquidity",
  });
  const { data: totalBorrowedVal, refetch: refetchBorrowed } = useReadContract({
    address: AEGIS_VAULT_ADDRESS as `0x${string}`,
    abi: [{ type: "function", name: "totalBorrowed", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" }],
    functionName: "totalBorrowed",
  });
  const { data: vaultUsdtBalance, refetch: refetchVaultBal } = useReadContract({
    address: USDT_ADDRESS as `0x${string}`,
    abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
    functionName: "balanceOf",
    args: [AEGIS_VAULT_ADDRESS as `0x${string}`],
  });

  const refreshVaultStats = () => { refetchPool(); refetchBorrowed(); refetchVaultBal(); };

  // Auto-refresh vault stats every 15s
  useEffect(() => {
    const interval = setInterval(refreshVaultStats, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function loadMarkets() {
      try {
        const predictMarkets = await fetchPredictMarkets();
        setLiveMarkets(predictMarkets);
      } catch (err) {
        console.error("Failed to fetch markets", err);
      }
    }
    loadMarkets();
  }, []);

  // Live WebSocket Integration
  useEffect(() => {
    if (liveMarkets.length === 0) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket('wss://ws.predict.fun/ws');
      ws.onopen = () => {
        console.log("[WebSocket] Connected successfully. Subscribing to live orderbooks...");
        liveMarkets.forEach((m, idx) => {
          if (m.platform === 'predict') {
            const rawId = m.id.replace('predict-', '');
            ws.send(JSON.stringify({
              method: 'subscribe',
              requestId: idx + 1,
              params: [`predictOrderbook/${rawId}`]
            }));
          }
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'M' && msg.data) {
            const rawId = msg.data.marketId || msg.id;
            if (!rawId) return;
            const fullId = `predict-${rawId}`;

            setLiveMarkets(prev => prev.map(m => {
              if (m.id === fullId && m.platform === 'predict') {
                const bestBid = msg.data.bids?.[0]?.[0]; // Best price to sell YES
                const bestAsk = msg.data.asks?.[0]?.[0]; // Best price to buy YES
                if (bestBid === undefined && bestAsk === undefined) return m;

                const costYes = bestAsk !== undefined ? bestAsk : bestBid;
                const costNo = bestBid !== undefined ? (1 - bestBid) : (1 - costYes);

                if (m.yesPrice === costYes && m.noPrice === costNo) return m;
                return { ...m, yesPrice: costYes, noPrice: costNo };
              }
              return m;
            }));
          }
        } catch (e) { }
      };

      ws.onerror = (err) => console.error("WS Error", err);
    } catch (e) {
      console.error("Failed to start WS", e);
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [liveMarkets.length > 0]);

  useEffect(() => {
    if (address) {
      fetch(`${AGENT_API_BASE}/status?wallet=${address}`)
        .then(res => res.json())
        .then(data => setIsAgentRunning(data.isRunning))
        .catch(err => console.error("Could not fetch agent status", err));
    }
  }, [address]);

  const logToTerminal = async (message: string, data?: any, type: "info" | "error" = "info") => {
    let safeData = data || "";
    try {
      if (typeof data === "object") safeData = JSON.stringify(data);
    } catch {
      safeData = String(data);
    }
    console[type === "error" ? "error" : "log"](message, safeData);
    try {
      await fetch(`${AGENT_API_BASE}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, data: safeData, type })
      });
    } catch (e) { }
  };

  const ensureValidJwt = async (signer: any) => {
    if (predictJwt) return predictJwt;
    logToTerminal("[Auth] Requesting dynamic login message...");
    let msgRes;
    try {
      msgRes = await axios.get("/api/predict/auth/message");
    } catch (e) {
      msgRes = await axios.get("https://api.predict.fun/v1/auth/message", { headers: { "x-api-key": "d77f0af7-dd6a-464d-b620-67e2a5c8be14" } });
    }
    const message = msgRes.data?.data?.message;
    if (!message) throw new Error("Failed to fetch auth message");
    const signature = await signer.signMessage(message);
    const authRes = await axios.post("/api/predict/auth", { message, signature, signer: signer.address });
    const token = authRes.data?.data?.token;
    if (!token) throw new Error("Failed to retrieve JWT");
    setPredictJwt(token);
    return token;
  };

  const loadPortfolio = async () => {
    if (!(window as any).ethereum || !address) return;
    setIsLoadingPortfolio(true);
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const jwt = await ensureValidJwt(signer);
      const lowerAddr = address.toLowerCase();

      // 1. Try positions endpoint first
      const posRes = await axios.get(`/api/predict/portfolio?walletId=${lowerAddr}`, { headers: { Authorization: `Bearer ${jwt}` } });
      const positions = posRes.data?.data || [];
      logToTerminal("[Portfolio Load] Positions API:", JSON.stringify(positions, null, 2));

      // 2. Fetch filled orders (trade history)
      const histRes = await axios.get(`/api/predict/orders?status=FILLED`, { headers: { Authorization: `Bearer ${jwt}` } });
      const filledOrders = histRes.data?.data || [];
      setPortfolioHistory(filledOrders);
      logToTerminal("[Portfolio Load] Filled Orders:", JSON.stringify(filledOrders.length));

      // 3. Fetch active/open orders
      const activeRes = await axios.get(`/api/predict/orders?status=OPEN`, { headers: { Authorization: `Bearer ${jwt}` } });
      setPortfolioOrders(activeRes.data?.data || []);
      logToTerminal("[Portfolio Load] Open Orders:", JSON.stringify((activeRes.data?.data || []).length));

      // 4. If positions API returned data, use it directly
      if (positions.length > 0) {
        setPortfolioPositions(positions);
        logToTerminal("[Portfolio] Using positions API data");
      } else if (filledOrders.length > 0) {
        // 5. Derive holdings from filled orders
        logToTerminal("[Portfolio] Positions empty — deriving holdings from filled orders...");
        const holdingsMap: Record<string, { marketId: number; tokenId: string; side: string; quantity: number; question: string }> = {};

        // Collect unique marketIds to fetch their names
        const uniqueMarketIds = [...new Set(filledOrders.map((o: any) => o.marketId))];
        const marketNames: Record<number, string> = {};
        for (const mid of uniqueMarketIds) {
          const local = liveMarkets.find(m => m.id === `predict-${mid}`);
          if (local) {
            marketNames[mid as number] = local.question;
          } else {
            // Fetch market info from API
            try {
              const mRes = await axios.get(`/api/predict/markets?marketId=${mid}`);
              const mkts = mRes.data?.data?.markets || mRes.data?.data?.categories?.[0]?.markets || [];
              if (mkts.length > 0) {
                marketNames[mid as number] = mkts[0].question || mkts[0].title || `Market #${mid}`;
              } else {
                marketNames[mid as number] = `Market #${mid}`;
              }
            } catch { marketNames[mid as number] = `Market #${mid}`; }
          }
        }

        for (const ord of filledOrders) {
          const tokenId = ord.order?.tokenId || "unknown";
          const marketId = ord.marketId;
          const isBuy = ord.order?.side === 0;
          const question = marketNames[marketId] || `Market #${marketId}`;

          // Determine YES/NO side from tokenId
          const market = liveMarkets.find(m => m.id === `predict-${marketId}`);
          let side = "YES";
          if (market && (market as any).noTokenId === tokenId) side = "NO";

          const key = `${marketId}-${tokenId}`;
          if (!holdingsMap[key]) {
            holdingsMap[key] = { marketId, tokenId, side, quantity: 0, question };
          }

          // For BUY (side=0): amount & amountFilled are in USDT. Shares = amountFilled * (takerAmount / makerAmount)
          // For SELL (side=1): amount & amountFilled are in shares directly
          const filledRaw = parseFloat(ord.amountFilled || "0") / 1e18;

          if (isBuy) {
            const makerAmt = parseFloat(ord.order?.makerAmount || "1") / 1e18;  // USDT
            const takerAmt = parseFloat(ord.order?.takerAmount || "1") / 1e18;  // shares
            const pricePerShare = makerAmt > 0 ? makerAmt / takerAmt : 1;
            const sharesReceived = filledRaw / pricePerShare;
            holdingsMap[key].quantity += sharesReceived;
          } else {
            holdingsMap[key].quantity -= filledRaw;
          }
        }

        // Convert to positions array, filter out zero/negative balances
        const derivedPositions = Object.values(holdingsMap)
          .filter(h => h.quantity > 0.001)
          .map(h => ({
            asset: { market: { question: h.question }, onChainId: h.tokenId, price: "0" },
            side: h.side,
            quantity: h.quantity.toFixed(4),
            marketId: h.marketId,
          }));

        setPortfolioPositions(derivedPositions);
        logToTerminal("[Portfolio] Derived holdings:", JSON.stringify(derivedPositions, null, 2));
      } else {
        setPortfolioPositions([]);
        logToTerminal("[Portfolio] No positions or filled orders found");
      }
    } catch (e: any) {
      logToTerminal("[Portfolio Error]", e.message, "error");
    } finally {
      setIsLoadingPortfolio(false);
    }
  };

  const handleLpAction = async (type: "SUPPLY" | "WITHDRAW") => {
    if (!address || !liquidityAmount) return;
    setIsLpActionLoading(true);
    try {
      const amountWei = parseUnits(liquidityAmount, 18);
      if (type === "SUPPLY") {
        logToTerminal(`[LP] Approving ${liquidityAmount} USDT for vault...`);
        const approveTx = await writeContractAsync({
          address: USDT_ADDRESS as `0x${string}`,
          abi: [{ type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" }],
          functionName: "approve",
          args: [AEGIS_VAULT_ADDRESS as `0x${string}`, amountWei]
        });
        logToTerminal(`[LP] Approve tx: ${approveTx}`);
        logToTerminal(`[LP] Supplying ${liquidityAmount} USDT to vault...`);
        const supplyTx = await writeContractAsync({
          address: AEGIS_VAULT_ADDRESS as `0x${string}`,
          abi: [{ type: "function", name: "provideLiquidity", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" }],
          functionName: "provideLiquidity",
          args: [amountWei]
        });
        logToTerminal(`[LP] Supply tx: ${supplyTx}`);
        alert(`✅ Successfully supplied ${liquidityAmount} USDT to vault!`);
      } else {
        logToTerminal(`[LP] Withdrawing ${liquidityAmount} USDT from vault...`);
        const withdrawTx = await writeContractAsync({
          address: AEGIS_VAULT_ADDRESS as `0x${string}`,
          abi: [{ type: "function", name: "removeLiquidity", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" }],
          functionName: "removeLiquidity",
          args: [amountWei]
        });
        logToTerminal(`[LP] Withdraw tx: ${withdrawTx}`);
        alert(`✅ Successfully withdrew ${liquidityAmount} USDT from vault!`);
      }
      setLiquidityAmount("");
      refreshVaultStats();
    } catch (err: any) {
      logToTerminal("[LP Error]", err.message, "error");
      alert(`❌ ${type} failed: ${err.shortMessage || err.message}`);
    } finally {
      setIsLpActionLoading(false);
    }
  };

  const handleVaultDeposit = async (pos: any) => {
    if (!address || !borrowAmount) return;
    setIsVaultActionLoading(true);
    try {
      const amountWei = parseUnits(borrowAmount, 18);
      const ctfAddress = pos.asset?.market?.isYieldBearing ? BNB_MAINNET_CTF_YIELD : BNB_MAINNET_CTF_NON_YIELD;
      const tokenId = BigInt(pos.asset.onChainId);
      await writeContractAsync({
        address: ctfAddress as `0x${string}`,
        abi: [{ type: "function", name: "setApprovalForAll", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [], stateMutability: "nonpayable" }],
        functionName: "setApprovalForAll",
        args: [AEGIS_VAULT_ADDRESS as `0x${string}`, true]
      });
      await writeContractAsync({
        address: AEGIS_VAULT_ADDRESS as `0x${string}`,
        abi: [{ type: "function", name: "depositERC1155", inputs: [{ name: "ctf", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" }],
        functionName: "depositERC1155",
        args: [ctfAddress as `0x${string}`, tokenId, amountWei]
      });
      const borrowAmountWei = parseUnits((parseFloat(borrowAmount) * parseFloat(pos.asset.price) * 0.45).toFixed(6), 18);
      await writeContractAsync({
        address: AEGIS_VAULT_ADDRESS as `0x${string}`,
        abi: [{ type: "function", name: "borrow", inputs: [{ name: "ctf", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" }],
        functionName: "borrow",
        args: [ctfAddress as `0x${string}`, tokenId, borrowAmountWei]
      });
      setBorrowAmount("");
      loadPortfolio();
    } catch (err: any) {
      logToTerminal("[Vault Error]", err.message, "error");
    } finally {
      setIsVaultActionLoading(false);
    }
  };

  const handlePredictTrade = async (side: "YES" | "NO") => {
    const selectedMarket = liveMarkets.find(m => m.id === selectedMarketId);
    if (!(window as any).ethereum || !selectedMarket || !tradeAmount) return;
    setIsTrading(true);
    try {
      if (chainId !== bsc.id && switchChainAsync) await switchChainAsync({ chainId: bsc.id });
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const builder = await OrderBuilder.make(ChainId.BnbMainnet, signer as any);

      logToTerminal("[Trade Processing] Requesting USDT Allowance (if needed)...");
      await builder.setCtfExchangeAllowance(selectedMarket.isNegRisk || false, selectedMarket.isYieldBearing || false);

      logToTerminal("[Trade Processing] Requesting ERC1155 CTF Approval (if needed)...");
      await builder.setCtfExchangeApproval(selectedMarket.isNegRisk || false, selectedMarket.isYieldBearing || false);

      const priceStr = side === "YES" ? selectedMarket.yesPrice.toFixed(4) : selectedMarket.noPrice.toFixed(4);
      const priceWei = parseUnits(priceStr, 18);
      const quantityWei = parseUnits((parseFloat(tradeAmount) / parseFloat(priceStr)).toFixed(6), 18);

      logToTerminal(`[Trade Processing] Building BUY Order: side=${side}, price=${priceStr}, qty=${formatUnits(quantityWei, 18)}`);
      const { makerAmount, takerAmount, pricePerShare } = builder.getLimitOrderAmounts({ side: Side.BUY, pricePerShareWei: priceWei, quantityWei });

      const order = builder.buildOrder("LIMIT", {
        maker: signer.address, signer: signer.address, side: Side.BUY,
        tokenId: side === "YES" ? selectedMarket.yesTokenId! : selectedMarket.noTokenId!,
        makerAmount, takerAmount, nonce: BigInt(0), feeRateBps: selectedMarket.feeRateBps || 0
      });

      logToTerminal("[Trade Processing] Signing Typed Data...");
      const typedData = builder.buildTypedData(order, { isNegRisk: selectedMarket.isNegRisk || false, isYieldBearing: selectedMarket.isYieldBearing || false });
      const signedOrder = await builder.signTypedDataOrder(typedData);
      const hash = builder.buildTypedDataHash(typedData);

      logToTerminal("[Trade Processing] Acquiring Auth JWT...");
      const jwt = await ensureValidJwt(signer);

      logToTerminal("[Trade Processing] Submitting order to Predict API...");
      const orderPayload = { data: { order: { ...signedOrder, hash }, pricePerShare: pricePerShare.toString(), strategy: "MARKET" } };
      await axios.post("/api/predict/order", orderPayload, { headers: { Authorization: `Bearer ${jwt}` } });

      logToTerminal("[Trade SUCCESS] Order perfectly submitted to the books!", JSON.stringify(orderPayload, null, 2));
      alert("✅ Trade Successfully Submitted!\n\nCheck terminal for full payload. Predict API takes ~15 seconds to index new matching trades into your portfolio.");
    } catch (e: any) {
      logToTerminal("[Trade Failed Full Log]", JSON.stringify(e.response?.data || e, null, 2), "error");
    } finally {
      setIsTrading(false);
    }
  };

  const handlePredictSell = async (side: "YES" | "NO") => {
    const selectedMarket = liveMarkets.find(m => m.id === selectedMarketId);
    if (!(window as any).ethereum || !selectedMarket || !tradeAmount) return;
    setIsTrading(true);
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const builder = await OrderBuilder.make(ChainId.BnbMainnet, signer as any);
      const ctfAddress = selectedMarket.isYieldBearing ? BNB_MAINNET_CTF_YIELD : BNB_MAINNET_CTF_NON_YIELD;
      const tokenIdToSell = side === "YES" ? selectedMarket.yesTokenId! : selectedMarket.noTokenId!;

      // Diagnostic check: How many shares do they ACTUALLY own?
      try {
        const ctfContract = new ethers.Contract(ctfAddress as string, [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }], provider);
        const actualBalance = await ctfContract.balanceOf(signer.address, BigInt(tokenIdToSell));
        logToTerminal(`[DIAGNOSTIC] Wallet ${signer.address} actual on-chain balance of Token ${tokenIdToSell}: ${formatUnits(actualBalance, 18)} shares`);
      } catch (err: any) {
        logToTerminal(`[DIAGNOSTIC] Failed to read on-chain balance: ${err.message}`);
      }

      logToTerminal("[Trade Processing] Requesting ERC1155 CTF Approval (if needed)...");
      await builder.setCtfExchangeApproval(selectedMarket.isNegRisk || false, selectedMarket.isYieldBearing || false);

      logToTerminal("[Trade Processing] (Sell) Building limit order...");
      const priceStr = side === "YES" ? selectedMarket.yesPrice.toFixed(4) : selectedMarket.noPrice.toFixed(4);
      const priceWei = parseUnits(priceStr, 18);
      const quantityWei = parseUnits((parseFloat(tradeAmount) / parseFloat(priceStr)).toFixed(6), 18);
      const { makerAmount, takerAmount, pricePerShare } = builder.getLimitOrderAmounts({ side: Side.SELL, pricePerShareWei: priceWei, quantityWei });

      logToTerminal(`[Trade Processing] Trying to sell ${formatUnits(makerAmount, 18)} shares for ${formatUnits(takerAmount, 18)} USDT...`);

      const order = builder.buildOrder("LIMIT", {
        maker: signer.address, signer: signer.address, side: Side.SELL,
        tokenId: tokenIdToSell,
        makerAmount, takerAmount, nonce: BigInt(0), feeRateBps: selectedMarket.feeRateBps || 0
      });

      logToTerminal("[Trade Processing] (Sell) Signing order...");
      const typedData = builder.buildTypedData(order, { isNegRisk: selectedMarket.isNegRisk || false, isYieldBearing: selectedMarket.isYieldBearing || false });
      const signedOrder = await builder.signTypedDataOrder(typedData);
      const hash = builder.buildTypedDataHash(typedData);

      logToTerminal("[Trade Processing] (Sell) Acquiring JWT & Submitting...");
      const jwt = await ensureValidJwt(signer);
      const orderPayload = { data: { order: { ...signedOrder, hash }, pricePerShare: pricePerShare.toString(), strategy: "MARKET" } };
      await axios.post("/api/predict/order", orderPayload, { headers: { Authorization: `Bearer ${jwt}` } });

      logToTerminal("[Trade SUCCESS] (Sell) Order submitted to book!", JSON.stringify(orderPayload, null, 2));
      alert("✅ Sell Successfully Submitted!\n\nVerify in active orders or history.");
    } catch (e: any) {
      logToTerminal("[Sell Failed Full Log]", JSON.stringify(e.response?.data || e, null, 2), "error");
    } finally {
      setIsTrading(false);
    }
  };

  const toggleAgent = async (start: boolean) => {
    if (!address) return;
    try {
      const endpoint = start ? "/start-agent" : "/stop-agent";
      await fetch(`${AGENT_API_BASE}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: address }) });
      setIsAgentRunning(start);
    } catch (e) { console.error(e); }
  };

  const renderMarketCard = (market: UnifiedMarket) => (
    <Card key={market.id} className={`group cursor-pointer transition-all border-zinc-800 hover:border-indigo-500/50 bg-zinc-950/40 backdrop-blur-md ${selectedMarketId === market.id ? 'ring-2 ring-indigo-500 bg-zinc-900/60' : ''}`} onClick={() => setSelectedMarketId(market.id)}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-base font-bold flex items-center gap-2">{market.question}</CardTitle>
          <Badge variant={market.platform === "predict" ? "default" : "secondary"} className="text-[10px]">{market.platform}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          <div className="flex-1 bg-zinc-900/50 p-2 rounded-xl flex flex-col items-center border border-zinc-800/50">
            <span className="text-[10px] text-zinc-500 font-bold uppercase">Yes</span>
            <span className="text-sm font-mono text-green-400 font-bold">${market.yesPrice.toFixed(2)}</span>
          </div>
          <div className="flex-1 bg-zinc-900/50 p-2 rounded-xl flex flex-col items-center border border-zinc-800/50">
            <span className="text-[10px] text-zinc-500 font-bold uppercase">No</span>
            <span className="text-sm font-mono text-red-400 font-bold">${market.noPrice.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const selectedMarket = (liveMarkets.concat(mockMarkets)).find(m => m.id === selectedMarketId);

  return (
    <div className="min-h-screen flex flex-col bg-black text-white selection:bg-indigo-500/30">
      {/* Floating Navbar */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-6xl">
        <header className="bg-zinc-950/80 backdrop-blur-xl border border-zinc-800 rounded-2xl px-6 py-3 flex flex-col md:flex-row justify-between items-center gap-4 shadow-2xl shadow-indigo-500/10">
          <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm4.28 10.28a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H8.25a.75.75 0 010-1.5h5.69l-1.72-1.72a.75.75 0 011.06-1.06l3 3z" clipRule="evenodd" /></svg>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">PolyCredit</h1>
            </div>
            <nav className="flex items-center gap-2">
              <Button variant={activeView === 'home' ? 'default' : 'ghost'} onClick={() => setActiveView('home')}>Home</Button>
              <Button variant={activeView === 'markets' ? 'default' : 'ghost'} onClick={() => setActiveView('markets')}>Markets</Button>
              <Button variant={activeView === 'portfolio' ? 'default' : 'ghost'} onClick={() => { setActiveView('portfolio'); loadPortfolio(); }}>Portfolio</Button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {mounted && isConnected ? (
              <>
                <span className="text-xs bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                <Button variant="outline" size="sm" onClick={() => disconnect()} className="border-red-900/30 text-red-400 hover:bg-red-950">Disconnect</Button>
              </>
            ) : mounted && (
              <Button onClick={() => connect({ connector: injected() })} className="bg-indigo-600 hover:bg-indigo-700 text-white">Connect Wallet</Button>
            )}
          </div>
        </header>
      </div>

      <main className="pt-32 pb-8 px-4 sm:px-8 max-w-7xl mx-auto w-full flex-1">
        {activeView === 'portfolio' ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
              <div>
                <h2 className="text-2xl font-bold text-indigo-400">Mainnet Portfolio</h2>
                <p className="text-zinc-500 text-sm">Real-time Predict.fun holdings & debt</p>
              </div>
              <Button onClick={loadPortfolio} variant="outline" size="sm">Refresh</Button>
            </div>

            <Tabs defaultValue="holdings">
              <TabsList className="bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="holdings">Holdings ({portfolioHistory.length > 0 ? "✓" : "0"})</TabsTrigger>
                <TabsTrigger value="active">Active Orders ({portfolioOrders.length})</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="holdings" className="mt-4 bg-zinc-900/30 rounded-xl border border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-500">Market</TableHead>
                      <TableHead className="text-zinc-500">Side</TableHead>
                      <TableHead className="text-zinc-500">Avg Price</TableHead>
                      <TableHead className="text-zinc-500 text-right">Shares</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {derivedHoldings.length === 0 ? (
                      <TableRow className="border-zinc-800"><TableCell colSpan={4} className="text-center py-8 text-zinc-500">No holdings found — trade to see positions here</TableCell></TableRow>
                    ) : (
                      derivedHoldings.map((h, idx) => (
                        <TableRow key={idx} className="border-zinc-800">
                          <TableCell className="font-semibold text-xs truncate max-w-[200px]">{h.asset.market.question}</TableCell>
                          <TableCell><Badge className={h.side === 'YES' ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'}>{h.side}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">${parseFloat(h.avgPrice).toFixed(4)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{parseFloat(h.quantity).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="active" className="mt-4 bg-zinc-900/30 rounded-xl border border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-500">Order ID</TableHead>
                      <TableHead className="text-zinc-500">Action</TableHead>
                      <TableHead className="text-zinc-500">Price</TableHead>
                      <TableHead className="text-zinc-500 text-right">Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolioOrders.length === 0 ? (
                      <TableRow className="border-zinc-800"><TableCell colSpan={4} className="text-center py-8 text-zinc-500">No open orders found</TableCell></TableRow>
                    ) : portfolioOrders.map((ord, idx) => (
                      <TableRow key={idx} className="border-zinc-800">
                        <TableCell className="font-mono text-[10px] text-zinc-400">{ord.id.slice(0, 10)}...</TableCell>
                        <TableCell><Badge className={ord.order?.side === 0 ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}>{ord.order?.side === 0 ? "BUY" : "SELL"}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">${ord.order?.makerAmount && ord.order?.takerAmount ? (parseFloat(ord.order.takerAmount) / parseFloat(ord.order.makerAmount)).toFixed(2) : "0.00"}</TableCell>
                        <TableCell className="text-right text-[10px] font-mono">{(parseFloat(ord.amountFilled || "0") / 1e18).toFixed(1)} / {(parseFloat(ord.amount || "0") / 1e18).toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="history" className="mt-4 bg-zinc-900/30 rounded-xl border border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-500">Market</TableHead>
                      <TableHead className="text-zinc-500">Action</TableHead>
                      <TableHead className="text-zinc-500">Price</TableHead>
                      <TableHead className="text-zinc-500 text-right">Filled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolioHistory.length === 0 ? (
                      <TableRow className="border-zinc-800"><TableCell colSpan={4} className="text-center py-8 text-zinc-500">No trade history found</TableCell></TableRow>
                    ) : portfolioHistory.map((ord: any, idx: number) => {
                      const market = liveMarkets.find(m => m.id === `predict-${ord.marketId}`);
                      const question = market?.question || `Market #${ord.marketId}`;
                      const isBuy = ord.order?.side === 0;
                      const makerAmt = parseFloat(ord.order?.makerAmount || "0") / 1e18;
                      const takerAmt = parseFloat(ord.order?.takerAmount || "0") / 1e18;
                      const price = isBuy && takerAmt > 0 ? (makerAmt / takerAmt).toFixed(4) : makerAmt > 0 ? (takerAmt / makerAmt).toFixed(4) : "0.00";
                      const filled = parseFloat(ord.amountFilled || "0") / 1e18;
                      const total = parseFloat(ord.amount || "0") / 1e18;
                      return (
                        <TableRow key={idx} className="border-zinc-800">
                          <TableCell className="font-semibold text-xs truncate max-w-[200px]">{question}</TableCell>
                          <TableCell><Badge className={isBuy ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}>{isBuy ? "BUY" : "SELL"}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">${price}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{filled.toFixed(2)} / {total.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </div>
        ) : activeView === 'markets' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-2 space-y-8">
              <section>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-400">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  Live Prediction Markets
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {liveMarkets.map(renderMarketCard)}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                <CardHeader>
                  <Tabs value={vaultTab} onValueChange={(v: any) => setVaultTab(v)}>
                    <TabsList className="grid w-full grid-cols-2 bg-black">
                      <TabsTrigger value="borrow">Borrow</TabsTrigger>
                      <TabsTrigger value="liquidity">USDT Pool</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent className="space-y-4">
                  {vaultTab === 'borrow' ? (
                    <div className="space-y-4">
                      <div className="grid gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {derivedHoldings.map((pos) => (
                          <div key={pos.asset.id} onClick={() => setSelectedPositionId(pos.asset.id)} className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedPositionId === pos.asset.id ? 'bg-indigo-500/10 border-indigo-500' : 'bg-black border-zinc-800'}`}>
                            <div className="flex justify-between text-[10px] font-bold mb-1">
                              <span className={pos.side === 'YES' ? 'text-green-400' : 'text-red-400'}>{pos.side}</span>
                              <span className="text-zinc-600">Hold: {parseFloat(pos.quantity).toFixed(2)}</span>
                            </div>
                            <div className="text-[11px] truncate text-zinc-300 font-medium">{pos.asset?.market?.question || "Unknown Market"}</div>
                          </div>
                        ))}
                        {derivedHoldings.length === 0 && <div className="text-center py-4 text-zinc-600 text-xs italic">Connect & visit Portfolio to load holdings</div>}
                      </div>

                      {selectedPositionId && (
                        <div className="space-y-4 animate-in slide-in-from-top-2">
                          {(() => {
                            const pos = derivedHoldings.find(p => p.asset.id === selectedPositionId);
                            if (!pos) return null;
                            return (
                              <>
                                <div className="relative">
                                  <Input type="number" placeholder="Enter amount to lock" className="bg-black border-zinc-800 h-12 pt-5" value={borrowAmount} onChange={e => setBorrowAmount(e.target.value)} />
                                  <span className="absolute left-3 top-1.5 text-[10px] font-bold text-zinc-500 uppercase">Collateral Amount</span>
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-400">{pos.side}</span>
                                </div>
                                <div className="bg-black/50 p-3 rounded-lg border border-zinc-800 text-[11px]">
                                  <div className="flex justify-between mb-1"><span className="text-zinc-500">Value:</span><span className="text-zinc-300 font-mono">${(parseFloat(borrowAmount || "0") * parseFloat(pos.asset.price)).toFixed(2)}</span></div>
                                  <div className="flex justify-between font-bold"><span className="text-zinc-500">Max USDT Borrow:</span><span className="text-yellow-500 font-mono">${(parseFloat(borrowAmount || "0") * parseFloat(pos.asset.price) * 0.45).toFixed(2)}</span></div>
                                </div>
                                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 font-bold shadow-lg shadow-indigo-500/20" disabled={isVaultActionLoading} onClick={() => handleVaultDeposit(pos)}>
                                  {isVaultActionLoading ? "Processing..." : "Collateralize & Borrow"}
                                </Button>
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-3 bg-green-500/5 rounded-xl border border-green-500/10 text-center">
                          <div className="text-[9px] font-black text-green-500 uppercase tracking-widest mb-0.5">Total Supply</div>
                          <div className="text-lg font-black text-white">${totalPoolLiq ? parseFloat(formatUnits(totalPoolLiq as bigint, 18)).toFixed(6) : '0.00'}</div>
                        </div>
                        <div className="p-3 bg-yellow-500/5 rounded-xl border border-yellow-500/10 text-center">
                          <div className="text-[9px] font-black text-yellow-500 uppercase tracking-widest mb-0.5">Borrowed</div>
                          <div className="text-lg font-black text-white">${totalBorrowedVal ? parseFloat(formatUnits(totalBorrowedVal as bigint, 18)).toFixed(6) : '0.00'}</div>
                        </div>
                        <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 text-center">
                          <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-0.5">Available</div>
                          <div className="text-lg font-black text-white">${vaultUsdtBalance ? parseFloat(formatUnits(vaultUsdtBalance as bigint, 18)).toFixed(6) : '0.00'}</div>
                        </div>
                      </div>
                      <Input type="number" placeholder="0.00" className="bg-black border-zinc-800 h-11" value={liquidityAmount} onChange={e => setLiquidityAmount(e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="h-11 border-zinc-800" onClick={() => { handleLpAction('WITHDRAW').then(refreshVaultStats); }} disabled={isLpActionLoading}>Withdraw</Button>
                        <Button className="h-11 bg-green-600 hover:bg-green-700 font-bold" onClick={() => { handleLpAction('SUPPLY').then(refreshVaultStats); }} disabled={isLpActionLoading}>Supply USDT</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {selectedMarket && (
                <Card className="bg-zinc-900 border-zinc-800 border-indigo-500/30 overflow-hidden shadow-2xl shadow-indigo-500/10">
                  <div className="h-1 bg-indigo-500" />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold truncate">{selectedMarket.question}</CardTitle>
                    <p className="text-[10px] text-zinc-500 uppercase font-black">Quick Trade (Predict.fun)</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input type="number" placeholder="USDT Amount" className="bg-black border-zinc-800" value={tradeAmount} onChange={e => setTradeAmount(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => handlePredictTrade('YES')} disabled={isTrading}>Buy YES</Button>
                      <Button className="bg-red-600 hover:bg-red-700 text-white font-bold" onClick={() => handlePredictTrade('NO')} disabled={isTrading}>Buy NO</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="border-green-600/50 text-green-500 hover:bg-green-950/30 font-bold" onClick={() => handlePredictSell('YES')} disabled={isTrading}>Sell YES</Button>
                      <Button variant="outline" className="border-red-600/50 text-red-500 hover:bg-red-950/30 font-bold" onClick={() => handlePredictSell('NO')} disabled={isTrading}>Sell NO</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-6 max-w-4xl">
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent leading-tight">
                The Future of <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">Web3 Credit</span>
              </h1>
              <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">
                Trade decentralized prediction markets and instantly unlock your liquidity. Deposit your active positions into the Aegis Vault to borrow USDT without liquidating your upside.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
              <Button size="lg" className="h-14 px-8 text-base font-bold bg-indigo-600 hover:bg-indigo-700 shadow-2xl shadow-indigo-500/20" onClick={() => setActiveView('markets')}>
                Explore Markets
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-8 text-base font-bold border-zinc-800 hover:bg-zinc-900" onClick={() => { setActiveView('portfolio'); loadPortfolio(); }}>
                Manage Portfolio
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-24 pt-16 border-t border-zinc-900/50">
              <div className="p-8 rounded-3xl bg-zinc-900/20 border border-zinc-800/50 flex flex-col items-center text-center space-y-4 hover:border-indigo-500/30 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 font-black text-xl mb-2">1</div>
                <h3 className="text-zinc-200 font-bold text-lg">Predict Outcomes</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">Buy Conditional YES/NO shares on the BNB Mainnet via the high-performance Predict.fun limit orderbook.</p>
              </div>
              <div className="p-8 rounded-3xl bg-zinc-900/20 border border-zinc-800/50 flex flex-col items-center text-center space-y-4 hover:border-purple-500/30 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 font-black text-xl mb-2">2</div>
                <h3 className="text-zinc-200 font-bold text-lg">Deposit Collateral</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">Lock your active prediction shares securely into our non-custodial smart Aegis Vault to establish a credit line.</p>
              </div>
              <div className="p-8 rounded-3xl bg-zinc-900/20 border border-zinc-800/50 flex flex-col items-center text-center space-y-4 hover:border-emerald-500/30 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-black text-xl mb-2">3</div>
                <h3 className="text-zinc-200 font-bold text-lg">Borrow Cash</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">Instantly borrow liquid USDT against your positions. Repay your debt only when the market officially resolves!</p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 py-8 px-8 flex justify-between items-center bg-black/50 backdrop-blur-sm">
        <div className="text-zinc-600 text-xs font-medium">© 2026 PolyCredit Protocol • BNB Mainnet</div>
        <div className="flex gap-6 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
          <span className="hover:text-indigo-400 cursor-pointer transition-colors">Documentation</span>
          <span className="hover:text-indigo-400 cursor-pointer transition-colors">Audit</span>
          <span className="hover:text-indigo-400 cursor-pointer transition-colors">Support</span>
        </div>
      </footer>
    </div>
  );
}
