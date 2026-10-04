import { describe, expect, it } from "vitest";
import { createCompositeExtractor } from "../src/parser/composite.js";
import { extractHeuristic } from "../src/parser/heuristic.js";
import type { EmailInput, ExtractedTrial, TrialExtractor } from "../src/types.js";

const now = new Date(2026, 9, 3, 12, 0, 0);

function email(partial: Partial<EmailInput> & Pick<EmailInput, "from" | "subject">): EmailInput {
  return {
    messageId: partial.messageId ?? "m1",
    from: partial.from,
    subject: partial.subject,
    snippet: partial.snippet ?? "",
    receivedAt: partial.receivedAt ?? now.toISOString(),
    plainText: partial.plainText,
  };
}

describe("heuristic parser", () => {
  it("reads a relative end date and a monthly price", () => {
    const result = extractHeuristic(
      email({
        from: "Canva <no-reply@canva.com>",
        subject: "Your Canva Pro trial ends tomorrow",
        snippet: "Your free trial ends tomorrow. After your trial, you will be billed $14.99/month unless you cancel.",
      }),
      now,
    );
    expect(result.isTrial).toBe(true);
    expect(result.serviceId).toBe("canva");
    expect(result.service).toBe("Canva");
    expect(result.expiryDate).toBe("2026-10-04");
    expect(result.priceAmount).toBe(14.99);
    expect(result.priceInterval).toBe("month");
    expect(result.kind).toBe("trial_ending");
  });

  it("adds days from the received date", () => {
    const result = extractHeuristic(
      email({
        from: "Duolingo <hello@duolingo.com>",
        subject: "Your Super Duolingo free trial",
        snippet: "Your free trial ends in 3 days. Then Super Duolingo is $12.99/month unless you cancel.",
      }),
      now,
    );
    expect(result.serviceId).toBe("duolingo");
    expect(result.expiryDate).toBe("2026-10-06");
    expect(result.priceAmount).toBe(12.99);
  });

  it("parses an absolute end date and ignores an earlier until-you-cancel phrase", () => {
    const result = extractHeuristic(
      email({
        from: "Calm <hello@calm.com>",
        subject: "Your Calm free trial",
        snippet:
          "Do not pay until you cancel. Your free trial ends on October 18, 2026. After your trial, you will be billed £7.99 a month.",
      }),
      now,
    );
    expect(result.serviceId).toBe("calm");
    expect(result.expiryDate).toBe("2026-10-18");
    expect(result.priceAmount).toBe(7.99);
    expect(result.priceCurrency).toBe("GBP");
    expect(result.priceInterval).toBe("month");
  });

  it("parses day-first dates and USD amounts written after the currency code", () => {
    const result = extractHeuristic(
      email({
        from: "LinkedIn <messages-noreply@linkedin.com>",
        subject: "Your LinkedIn Premium free trial",
        snippet: "Your free trial ends on 9 Oct 2026. Subscription fee: $39.99 USD per month unless you cancel.",
      }),
      now,
    );
    expect(result.serviceId).toBe("linkedin");
    expect(result.expiryDate).toBe("2026-10-09");
    expect(result.priceAmount).toBe(39.99);
  });

  it("computes a trial start and prefers an explicit ends-in date over the day count", () => {
    const result = extractHeuristic(
      email({
        from: "Notion <team@mail.notion.so>",
        subject: "Welcome to Notion Plus",
        snippet:
          "Your 14-day free trial started 5 days ago. Your free trial ends in 9 days. After your trial, Notion Plus is $12/month unless you cancel.",
      }),
      now,
    );
    expect(result.serviceId).toBe("notion");
    expect(result.trialStart).toBe("2026-09-28");
    expect(result.expiryDate).toBe("2026-10-12");
    expect(result.priceAmount).toBe(12);
  });

  it("derives the end date from a day count plus a start date", () => {
    const result = extractHeuristic(
      email({
        from: "Notion <team@mail.notion.so>",
        subject: "Your Notion free trial",
        snippet: "Your 14-day free trial started on September 20, 2026.",
      }),
      now,
    );
    expect(result.expiryDate).toBe("2026-10-04");
    expect(result.trialStart).toBe("2026-09-20");
  });

  it("reads an annual price", () => {
    const result = extractHeuristic(
      email({
        from: "MasterClass <hello@masterclass.com>",
        subject: "Your MasterClass free trial",
        snippet:
          "Your free trial is active. Enjoy free access until November 2, 2026. After your trial, annual membership is $120/year unless you cancel.",
      }),
      now,
    );
    expect(result.serviceId).toBe("masterclass");
    expect(result.expiryDate).toBe("2026-11-02");
    expect(result.priceAmount).toBe(120);
    expect(result.priceInterval).toBe("year");
  });

  it("ignores newsletters and ordinary renewals", () => {
    const newsletter = extractHeuristic(
      email({
        from: "Canva <ideas@canva.com>",
        subject: "Five layouts to try this week",
        snippet: "A short design roundup with no billing change.",
      }),
      now,
    );
    const renewal = extractHeuristic(
      email({
        from: "Netflix <info@netflix.com>",
        subject: "Your Netflix membership will renew",
        snippet: "You will be billed $15.49/month on your next billing date.",
      }),
      now,
    );
    expect(newsletter.isTrial).toBe(false);
    expect(renewal.isTrial).toBe(false);
  });
});

describe("optional model extraction", () => {
  const calm = email({
    from: "Calm <hello@calm.com>",
    subject: "Your Calm free trial",
    snippet: "Your free trial ends on October 20, 2026.",
  });

  it("fills a missing price from the model and keeps the heuristic date", async () => {
    const llm: TrialExtractor = {
      name: "llm",
      async extract(): Promise<ExtractedTrial> {
        return {
          service: "Calm",
          serviceId: "calm",
          trialStart: null,
          expiryDate: "2026-10-20",
          priceAmount: 69.99,
          priceCurrency: "USD",
          priceInterval: "year",
          kind: "trial_ending",
          confidence: 0.7,
          isTrial: true,
        };
      },
    };
    const extractor = createCompositeExtractor({ llm });
    const result = await extractor.extract(calm, now);
    expect(result?.expiryDate).toBe("2026-10-20");
    expect(result?.priceAmount).toBe(69.99);
    expect(result?.priceInterval).toBe("year");
    expect(result?.serviceId).toBe("calm");
  });

  it("keeps the heuristic result when the model call fails", async () => {
    const llm: TrialExtractor = {
      name: "llm",
      async extract() {
        throw new Error("down");
      },
    };
    const result = await createCompositeExtractor({ llm }).extract(calm, now);
    expect(result?.isTrial).toBe(true);
    expect(result?.expiryDate).toBe("2026-10-20");
    expect(result?.priceAmount).toBeNull();
  });

  it("does not send non-trial mail to the model", async () => {
    let calls = 0;
    const llm: TrialExtractor = {
      name: "llm",
      async extract() {
        calls += 1;
        return null;
      },
    };
    const result = await createCompositeExtractor({ llm }).extract(
      email({
        from: "Canva <ideas@canva.com>",
        subject: "Five layouts to try this week",
        snippet: "A short design roundup with no billing change.",
      }),
      now,
    );
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });
});
