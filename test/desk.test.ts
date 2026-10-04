import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildDemoEmails } from "../src/demo-mail.js";
import { dispatchTool } from "../src/dispatch.js";
import { createRuntime } from "../src/runtime.js";

const now = new Date(2026, 9, 3, 12, 0, 0);

function runtime() {
  return createRuntime({
    now: () => now,
    config: {
      ...loadConfig({}),
      demoMode: true,
      openAiApiKey: "",
      gmailRefreshToken: "",
      googleClientId: "",
      googleClientSecret: "",
    },
  });
}

describe("demo inbox", () => {
  it("parses example mail into soonest-first trials and hides message bodies", async () => {
    const app = runtime();
    const scan = await dispatchTool("scan_inbox", { source: "demo" }, app);
    expect(scan.isError).toBeUndefined();
    expect(scan.content[0]?.text).toContain("Demo data");
    const ids = scan.structuredContent.trials.map((trial) => trial.id);
    expect(ids).toEqual([
      "canva",
      "duolingo",
      "adobe",
      "linkedin",
      "notion",
      "headspace",
      "new-york-times",
      "masterclass",
    ]);
    expect(scan.structuredContent.trials[0]?.daysLeft).toBe(1);
    expect(scan.structuredContent.trials[1]?.daysLeft).toBe(3);
    expect(scan.structuredContent.urgentCount).toBe(2);
    expect(scan.structuredContent.exposureMonthly).toBe(142.95);
    expect(scan.structuredContent.exposureAnnual).toBe(1715.4);
    expect(scan.structuredContent.demo).toBe(true);
    expect(scan.structuredContent.dataLabel).toBe("Demo data");
    const stored = JSON.stringify(app.desk.list());
    expect(stored).not.toContain("DO_NOT_STORE_BODY");
    expect(stored).not.toContain("plainText");
    expect(stored).not.toContain("snippet");
    expect(scan.structuredContent.trials.find((trial) => trial.id === "masterclass")?.priceLabel).toBe(
      "$120.00/year",
    );
    expect(scan.structuredContent.charges[0]?.id).toBe("canva");
  });

  it("drops kept trials from the at-risk total and can remind without cancelling", async () => {
    const app = runtime();
    await dispatchTool("scan_inbox", { source: "demo" }, app);
    const kept = await dispatchTool("mark_kept", { trialId: "canva" }, app);
    expect(kept.structuredContent.trials.find((trial) => trial.id === "canva")?.status).toBe("kept");
    expect(kept.structuredContent.exposureMonthly).toBe(127.96);
    expect(kept.structuredContent.atRiskCount).toBe(7);

    const reminded = await dispatchTool("snooze_trial", { trialId: "adobe", remindInDays: 2 }, app);
    const adobe = reminded.structuredContent.trials.find((trial) => trial.id === "adobe");
    expect(adobe?.status).toBe("snoozed");
    expect(adobe?.remindOn).toBe("2026-10-05");
    expect(reminded.content[0]?.text).toContain("can still charge");

    const upcoming = await dispatchTool("upcoming_charges", { withinDays: 7 }, app);
    const soon = upcoming.structuredContent.charges.map((charge) => charge.id);
    expect(soon).toContain("duolingo");
    expect(soon).toContain("adobe");
    expect(soon).not.toContain("canva");
    expect(soon).not.toContain("masterclass");
  });

  it("keeps a user decision when demo mail is scanned again", async () => {
    const app = runtime();
    await app.desk.ingest(buildDemoEmails(now), "demo", now);
    app.desk.markKept("notion");
    await app.desk.ingest(buildDemoEmails(now), "demo", now);
    expect(app.desk.get("notion")?.status).toBe("kept");
    expect(app.desk.get("canva")?.status).toBe("tracking");
  });

  it("refuses a gmail scan when nothing is connected", async () => {
    const app = runtime();
    const result = await dispatchTool("scan_inbox", { source: "gmail" }, app);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("not connected");
    expect(result.structuredContent.trials).toEqual([]);
  });
});
