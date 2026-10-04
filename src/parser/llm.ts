import { z } from "zod";
import { identifyService } from "../catalog.js";
import { civilFromIso } from "../dates.js";
import type { EmailInput, ExtractedTrial, TrialExtractor } from "../types.js";
import { emailText } from "./heuristic.js";

const LlmPayload = z.object({
  isTrial: z.boolean(),
  service: z.string().nullable().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  trialStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priceAmount: z.number().positive().max(5000).nullable().optional(),
  priceCurrency: z.string().nullable().optional(),
  priceInterval: z.enum(["month", "year", "unknown"]).nullable().optional(),
});

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

export function createLlmExtractor(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): TrialExtractor {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model || "gpt-4o-mini";

  return {
    name: "llm",
    async extract(email: EmailInput, _now: Date): Promise<ExtractedTrial | null> {
      if (!options.apiKey) return null;
      const received = civilFromIso(email.receivedAt);
      const text = emailText(email).slice(0, 3500);
      const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Extract free-trial facts from one email. Reply with JSON only. Keys: isTrial (boolean, true only for a free trial that can convert to a paid plan), service (string or null), expiryDate (YYYY-MM-DD or null), trialStart (YYYY-MM-DD or null), priceAmount (number or null), priceCurrency (USD, GBP, EUR, or null), priceInterval (month, year, or unknown). Do not invent a price or a date. Use the received date to resolve relative dates.",
            },
            {
              role: "user",
              content: `Received: ${received}\nFrom: ${email.from}\nSubject: ${email.subject}\nText:\n${text}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`Trial extraction model returned HTTP ${response.status}.`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("Trial extraction model returned an empty response.");
      const parsed = LlmPayload.parse(JSON.parse(stripFence(content)));
      if (!parsed.isTrial) return null;
      const identified = identifyService(email.from, `${parsed.service ?? ""}\n${text}`);
      const currency = (parsed.priceCurrency ?? "USD").toUpperCase();
      return {
        service: identified.matchedProfile ? identified.service : parsed.service || identified.service,
        serviceId: identified.matchedProfile ? identified.serviceId : identified.serviceId,
        trialStart: parsed.trialStart ?? null,
        expiryDate: parsed.expiryDate ?? null,
        priceAmount: parsed.priceAmount ?? null,
        priceCurrency: currency === "GBP" || currency === "EUR" || currency === "USD" ? currency : "USD",
        priceInterval: parsed.priceInterval ?? "unknown",
        kind: "trial_ending",
        confidence: 0.7,
        isTrial: true,
      };
    },
  };
}
