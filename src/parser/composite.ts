import type { EmailInput, ExtractedTrial, TrialExtractor } from "../types.js";
import { extractHeuristic } from "./heuristic.js";

export const heuristicExtractor: TrialExtractor = {
  name: "heuristic",
  async extract(email: EmailInput, now: Date): Promise<ExtractedTrial> {
    return extractHeuristic(email, now);
  },
};

export function mergeExtraction(
  heuristic: ExtractedTrial | null,
  llm: ExtractedTrial | null,
): ExtractedTrial | null {
  const strong =
    heuristic?.isTrial &&
    heuristic.expiryDate &&
    heuristic.priceAmount != null &&
    heuristic.confidence >= 0.85;
  if (strong && heuristic) return heuristic;
  if (!llm?.isTrial && !heuristic?.isTrial) return null;
  if (!llm?.isTrial) return heuristic?.isTrial ? heuristic : null;
  if (!heuristic?.isTrial) return llm.expiryDate ? llm : null;

  const priceFromLlm = heuristic.priceAmount == null;
  const expiryDate = heuristic.expiryDate ?? llm.expiryDate;
  if (!expiryDate) return heuristic.isTrial ? heuristic : null;
  const keepHeuristicService = heuristic.serviceId !== "unknown";
  return {
    service: keepHeuristicService ? heuristic.service : llm.service || heuristic.service,
    serviceId: keepHeuristicService ? heuristic.serviceId : llm.serviceId || heuristic.serviceId,
    trialStart: heuristic.trialStart ?? llm.trialStart,
    expiryDate,
    priceAmount: heuristic.priceAmount ?? llm.priceAmount,
    priceCurrency: priceFromLlm ? llm.priceCurrency : heuristic.priceCurrency,
    priceInterval: priceFromLlm ? llm.priceInterval : heuristic.priceInterval,
    kind: heuristic.kind,
    confidence: Math.max(heuristic.confidence, llm.confidence),
    isTrial: true,
  };
}

export function createCompositeExtractor(options?: {
  heuristic?: TrialExtractor;
  llm?: TrialExtractor | null;
}): TrialExtractor {
  const heuristic = options?.heuristic ?? heuristicExtractor;
  const llm = options?.llm ?? null;
  return {
    name: llm ? "heuristic+llm" : "heuristic",
    async extract(email: EmailInput, now: Date): Promise<ExtractedTrial | null> {
      const first = await heuristic.extract(email, now);
      if (!first?.isTrial) return null;
      const strong = Boolean(first.expiryDate && first.priceAmount != null && first.confidence >= 0.85);
      if (strong || !llm) return first;
      try {
        const second = await llm.extract(email, now);
        return mergeExtraction(first, second);
      } catch {
        return first?.isTrial ? first : null;
      }
    },
  };
}
