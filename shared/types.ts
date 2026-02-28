export type UnifiedMarket = {
  id: string;
  platform: "predict" | "opinion" | "probable";
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  feeRateBps?: number;
  yesTokenId?: string;
  noTokenId?: string;
  isNegRisk?: boolean;
  isYieldBearing?: boolean;
};
