import { z } from "zod";
import { buildDemoEmails } from "./demo-mail.js";
import { GmailNotConnectedError } from "./gmail.js";
import type { AppRuntime } from "./runtime.js";
import {
  ApproveArgs,
  ListArgs,
  ScanArgs,
  SnoozeArgs,
  TrialIdArgs,
  UpcomingArgs,
} from "./schema.js";
import type { Dashboard, SourceMode } from "./types.js";

export type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Dashboard;
  isError?: boolean;
};

const TOOL_NAMES = [
  "scan_inbox",
  "list_trials",
  "get_trial",
  "upcoming_charges",
  "show_trials",
  "approve_cancellation",
  "mark_kept",
  "snooze_trial",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

function ok(dashboard: Dashboard, text: string): ToolResponse {
  return {
    content: [{ type: "text", text }],
    structuredContent: dashboard,
  };
}

function fail(runtime: AppRuntime, message: string, focusedTrialId?: string | null): ToolResponse {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: runtime.desk.dashboard(runtime.now(), {
      error: message,
      focusedTrialId: focusedTrialId ?? null,
    }),
  };
}

function invalid(runtime: AppRuntime, error: z.ZodError): ToolResponse {
  const detail = error.issues.map((issue) => issue.message).join(" ");
  return fail(runtime, `Invalid arguments. ${detail}`.trim());
}

export function summarize(dashboard: Dashboard): string {
  const lines = [
    dashboard.demo ? "Source: demo data. These are example emails, not a real inbox." : "Source: inbox. Message bodies are not stored.",
    `At risk each month: ${dashboard.exposureMonthlyLabel}.`,
    `If every at-risk trial converts: ${dashboard.exposureAnnualLabel} a year.`,
    dashboard.headline,
  ];
  if (dashboard.trials.length === 0) lines.push("No trials are tracked.");
  for (const trial of dashboard.trials) {
    const link = trial.cancelUrl ? ` Cancel link: ${trial.cancelUrl}.` : "";
    const start = trial.trialStartLabel ? ` Trial start: ${trial.trialStartLabel}.` : "";
    lines.push(
      `${trial.service} (id ${trial.id}): ${trial.priceLabel}, ends ${trial.expiryLabel} (${trial.daysLabel}), status ${trial.status}.${start}${link} ${trial.cancelSummary}`,
    );
  }
  if (dashboard.charges.length > 0) {
    lines.push(
      "Upcoming charges, soonest first: " +
        dashboard.charges
          .map((charge) => `${charge.service} ${charge.priceLabel} on ${charge.expiryLabel} (${charge.daysLeft} days)`)
          .join("; "),
    );
  }
  if (dashboard.notice) lines.push(dashboard.notice);
  if (dashboard.error) lines.push(dashboard.error);
  return lines.join("\n");
}

function joinNotices(parts: Array<string | null>): string | null {
  const text = parts.filter(Boolean).join(" ");
  return text || null;
}

export async function dispatchTool(
  name: string,
  rawArgs: unknown,
  runtime: AppRuntime,
): Promise<ToolResponse> {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  switch (name) {
    case "scan_inbox":
      return scanInbox(args, runtime);
    case "list_trials":
      return listTrials(args, runtime);
    case "get_trial":
      return getTrial(args, runtime);
    case "upcoming_charges":
      return upcomingCharges(args, runtime);
    case "show_trials":
      return listTrials({}, runtime);
    case "approve_cancellation":
      return approveCancellation(args, runtime);
    case "mark_kept":
      return markKept(args, runtime);
    case "snooze_trial":
      return snoozeTrial(args, runtime);
    default:
      return fail(runtime, `Unknown tool ${name}.`);
  }
}

async function scanInbox(raw: unknown, runtime: AppRuntime): Promise<ToolResponse> {
  const parsed = ScanArgs.safeParse(raw ?? {});
  if (!parsed.success) return invalid(runtime, parsed.error);
  const now = runtime.now();
  const requested = parsed.data.source ?? "auto";
  let source: SourceMode;
  let fallback: string | null = null;
  if (requested === "demo") source = "demo";
  else if (requested === "gmail") source = "gmail";
  else if (!runtime.config.demoMode && runtime.gmail.connected()) source = "gmail";
  else if (!runtime.config.demoMode && !runtime.gmail.connected()) {
    source = "demo";
    fallback = "Gmail is not connected, so this scan used demo data.";
  } else source = "demo";

  try {
    if (source === "gmail") {
      if (!runtime.gmail.connected()) {
        return fail(
          runtime,
          "Gmail is not connected. Connect read-only Gmail at /auth/google, or scan with source demo.",
        );
      }
      const listed = await runtime.gmail.listTrialEmails(parsed.data.maxMessages ?? 15);
      const stats = await runtime.desk.ingest(listed.emails, "gmail", now);
      const notice = joinNotices([
        listed.skipped ? `${listed.skipped} messages could not be read.` : null,
        stats.undated ? `${stats.undated} trial-like emails had no end date and were left out.` : null,
      ]);
      const dashboard = runtime.desk.dashboard(now, { notice });
      const lead = `Parsed ${stats.found} trials from the inbox and ignored ${stats.ignored} messages that were not trials. Message bodies were not stored.`;
      return ok(dashboard, `${lead}\n${summarize(dashboard)}`);
    }

    const stats = await runtime.desk.ingest(buildDemoEmails(now), "demo", now);
    const notice = joinNotices([
      fallback,
      stats.undated ? `${stats.undated} trial-like emails had no end date and were left out.` : null,
    ]);
    const dashboard = runtime.desk.dashboard(now, { notice });
    const lead = `Demo data. Parsed ${stats.found} trials from example emails and ignored ${stats.ignored} messages that were not trials. This is not a real inbox.`;
    return ok(dashboard, `${lead}\n${summarize(dashboard)}`);
  } catch (error) {
    console.error("scan_inbox failed", error instanceof Error ? error.name : "error");
    if (error instanceof GmailNotConnectedError) {
      return fail(
        runtime,
        "Gmail is not connected. Connect read-only Gmail at /auth/google, or scan with source demo.",
      );
    }
    return fail(runtime, "The inbox scan failed. You can still scan with source demo.");
  }
}

function listTrials(raw: unknown, runtime: AppRuntime): ToolResponse {
  const parsed = ListArgs.safeParse(raw ?? {});
  if (!parsed.success) return invalid(runtime, parsed.error);
  const dashboard = runtime.desk.dashboard(runtime.now());
  if (parsed.data.includeKept === false) {
    dashboard.trials = dashboard.trials.filter((trial) => trial.status !== "kept");
    dashboard.trialCount = dashboard.trials.length;
  }
  return ok(dashboard, summarize(dashboard));
}

function getTrial(raw: unknown, runtime: AppRuntime): ToolResponse {
  const parsed = TrialIdArgs.safeParse(raw ?? {});
  if (!parsed.success) return invalid(runtime, parsed.error);
  const trial = runtime.desk.get(parsed.data.trialId);
  if (!trial) return fail(runtime, "No trial with that id.", parsed.data.trialId);
  const playbook = runtime.desk.playbookFor(parsed.data.trialId, runtime.gmail.accountEmail());
  const dashboard = runtime.desk.dashboard(runtime.now(), {
    focusedTrialId: parsed.data.trialId,
    playbook,
  });
  const focused = dashboard.trials.find((item) => item.id === parsed.data.trialId);
  const detail = focused
    ? `${focused.service}: ${focused.priceLabel}, ends ${focused.expiryLabel}, ${focused.daysLabel}. ${focused.cancelSummary}`
    : "Trial loaded.";
  const draft = playbook
    ? `\nApproved draft subject: ${playbook.emailSubject}\n${playbook.emailBody}`
    : "\nNo cancellation draft yet. That requires approve_cancellation after an explicit yes.";
  return ok(dashboard, `${detail}${draft}`);
}

function upcomingCharges(raw: unknown, runtime: AppRuntime): ToolResponse {
  const parsed = UpcomingArgs.safeParse(raw ?? {});
  if (!parsed.success) return invalid(runtime, parsed.error);
  const withinDays = parsed.data.withinDays ?? 45;
  const dashboard = runtime.desk.dashboard(runtime.now(), { withinDays });
  return ok(
    dashboard,
    `Upcoming charges within ${withinDays} days, soonest first.\n${summarize(dashboard)}`,
  );
}

function approveCancellation(raw: unknown, runtime: AppRuntime): ToolResponse {
  const parsed = ApproveArgs.safeParse(raw ?? {});
  if (!parsed.success) return invalid(runtime, parsed.error);
  const before = runtime.desk.executor.calls;
  const result = runtime.desk.approve(
    parsed.data.trialId,
    {
      confirmed: parsed.data.confirmed,
      confirmationText: parsed.data.confirmationText,
    },
    runtime.gmail.accountEmail(),
  );
  if (runtime.desk.executor.calls !== before) {
    return fail(runtime, "Cancellation was blocked because an automated executor ran.");
  }
  if (!result.ok) {
    const text = result.expectedPhrase
      ? `${result.reason} Ask the user to confirm, then call again with confirmed set to true and confirmationText set to: ${result.expectedPhrase}`
      : result.reason;
    return fail(runtime, text, parsed.data.trialId);
  }
  const dashboard = runtime.desk.dashboard(runtime.now(), {
    focusedTrialId: parsed.data.trialId,
    playbook: result.playbook,
  });
  const steps = result.playbook.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const text = [
    `Approved cancellation guidance for ${result.playbook.service}.`,
    "No email was sent and no account was opened.",
    result.playbook.cancelUrl
      ? `Cancel page: ${result.playbook.cancelUrl}`
      : "No direct cancel page is on file.",
    "Steps:",
    steps,
    `Draft subject: ${result.playbook.emailSubject}`,
    "Draft body:",
    result.playbook.emailBody,
    result.playbook.note,
  ].join("\n");
  return ok(dashboard, text);
}

function markKept(raw: unknown, runtime: AppRuntime): ToolResponse {
  const parsed = TrialIdArgs.safeParse(raw ?? {});
  if (!parsed.success) return invalid(runtime, parsed.error);
  const trial = runtime.desk.markKept(parsed.data.trialId);
  if (!trial) return fail(runtime, "No trial with that id.", parsed.data.trialId);
  const dashboard = runtime.desk.dashboard(runtime.now(), { focusedTrialId: trial.id });
  return ok(
    dashboard,
    `Marked ${trial.service} as keep. It is no longer in the at-risk total. The service was not contacted.\n${summarize(dashboard)}`,
  );
}

function snoozeTrial(raw: unknown, runtime: AppRuntime): ToolResponse {
  const parsed = SnoozeArgs.safeParse(raw ?? {});
  if (!parsed.success) return invalid(runtime, parsed.error);
  const days = parsed.data.remindInDays ?? 1;
  const trial = runtime.desk.snooze(parsed.data.trialId, days, runtime.now());
  if (!trial) return fail(runtime, "No trial with that id.", parsed.data.trialId);
  const dashboard = runtime.desk.dashboard(runtime.now(), { focusedTrialId: trial.id });
  const when = trial.remindOn ?? "later";
  return ok(
    dashboard,
    `Reminder set for ${trial.service} on ${when}. It can still charge you if you do not cancel. The service was not contacted.\n${summarize(dashboard)}`,
  );
}
