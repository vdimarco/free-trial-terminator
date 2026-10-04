import { describe, expect, it } from "vitest";
import { evaluateApproval, expectedConfirmationPhrase } from "../src/approval.js";
import { NotAutomatedExecutor } from "../src/cancellation.js";
import { loadConfig } from "../src/config.js";
import { buildDemoEmails } from "../src/demo-mail.js";
import { dispatchTool } from "../src/dispatch.js";
import { createRuntime } from "../src/runtime.js";

const now = new Date(2026, 9, 3, 12, 0, 0);
const phrase = expectedConfirmationPhrase("Canva");

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

describe("approval gate", () => {
  it("rejects anything other than boolean true", () => {
    expect(evaluateApproval({ service: "Canva", confirmed: false, confirmationText: phrase }).ok).toBe(false);
    expect(evaluateApproval({ service: "Canva", confirmed: "true", confirmationText: phrase }).ok).toBe(false);
    expect(evaluateApproval({ service: "Canva", confirmed: 1, confirmationText: phrase }).ok).toBe(false);
    expect(evaluateApproval({ service: "Canva", confirmed: undefined, confirmationText: phrase }).ok).toBe(false);
  });

  it("rejects a mismatched sentence and accepts the exact sentence loosely spaced", () => {
    const wrong = evaluateApproval({
      service: "Canva",
      confirmed: true,
      confirmationText: "please cancel Canva",
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.expectedPhrase).toBe(phrase);

    const right = evaluateApproval({
      service: "Canva",
      confirmed: true,
      confirmationText: `  ${phrase.toUpperCase()}  `,
    });
    expect(right.ok).toBe(true);
  });

  it("does not approve, draft, or run an executor without the gate", async () => {
    const app = runtime();
    await app.desk.ingest(buildDemoEmails(now), "demo", now);
    const before = app.desk.get("canva");
    expect(before?.guidanceApproved).toBe(false);

    const refused = await dispatchTool(
      "approve_cancellation",
      { trialId: "canva", confirmed: false, confirmationText: phrase },
      app,
    );
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused)).not.toContain("has not been sent");
    expect(app.desk.get("canva")?.guidanceApproved).toBe(false);
    expect(app.desk.executor.calls).toBe(0);

    const typed = await dispatchTool(
      "approve_cancellation",
      { trialId: "canva", confirmed: "true", confirmationText: phrase },
      app,
    );
    expect(typed.isError).toBe(true);
    expect(app.desk.get("canva")?.guidanceApproved).toBe(false);

    const mismatched = await dispatchTool(
      "approve_cancellation",
      { trialId: "canva", confirmed: true, confirmationText: "cancel it" },
      app,
    );
    expect(mismatched.isError).toBe(true);
    expect(mismatched.content[0]?.text).toContain(phrase);
    expect(app.desk.executor.calls).toBe(0);
  });

  it("returns a draft only after explicit approval and still does not automate", async () => {
    const app = runtime();
    await app.desk.ingest(buildDemoEmails(now), "demo", now);
    const early = await dispatchTool("get_trial", { trialId: "canva" }, app);
    expect(JSON.stringify(early)).not.toContain("has not been sent");
    expect(early.structuredContent.trials.find((trial) => trial.id === "canva")?.steps.length).toBeGreaterThan(0);

    const approved = await dispatchTool(
      "approve_cancellation",
      { trialId: "canva", confirmed: true, confirmationText: phrase },
      app,
    );
    expect(approved.isError).toBeUndefined();
    expect(approved.structuredContent.playbook?.approved).toBe(true);
    expect(approved.structuredContent.playbook?.automated).toBe(false);
    expect(approved.structuredContent.playbook?.emailBody).toContain("has not been sent");
    expect(approved.structuredContent.playbook?.emailBody).not.toContain("DO_NOT_STORE_BODY");
    expect(approved.content[0]?.text).toContain("No email was sent");
    expect(app.desk.get("canva")?.guidanceApproved).toBe(true);
    expect(app.desk.executor.calls).toBe(0);

    const again = await dispatchTool("get_trial", { trialId: "canva" }, app);
    expect(again.structuredContent.playbook?.emailSubject).toContain("Canva");
  });

  it("keeps the automated executor unreachable from the desk approve path", async () => {
    const executor = new NotAutomatedExecutor();
    await expect(executor.execute({} as never)).rejects.toThrow(/not available/i);
    expect(executor.calls).toBe(1);
  });
});
