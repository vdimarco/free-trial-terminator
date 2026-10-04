import { expectedConfirmationPhrase, evaluateApproval } from "./approval.js";
import { getProfile, genericGuidance } from "./catalog.js";
import { GuidedCancellation, NotAutomatedExecutor } from "./cancellation.js";
import { addCivilDays, civilFromDate, daysBetween, daysLabel, formatCivilLabel } from "./dates.js";
import {
  annualContribution,
  formatMoney,
  formatPrice,
  monthlyContribution,
  roundMoney,
} from "./money.js";
import { heuristicExtractor } from "./parser/composite.js";
import type {
  Dashboard,
  EmailInput,
  ExtractedTrial,
  Playbook,
  SourceMode,
  StoredTrial,
  TrialExtractor,
  TrialView,
} from "./types.js";

export type IngestStats = {
  found: number;
  ignored: number;
  undated: number;
};

export type DashboardOptions = {
  notice?: string | null;
  error?: string | null;
  focusedTrialId?: string | null;
  playbook?: Playbook | null;
  withinDays?: number | null;
};

function prefer(next: ExtractedTrial, current: ExtractedTrial): boolean {
  if (Boolean(next.expiryDate) !== Boolean(current.expiryDate)) return Boolean(next.expiryDate);
  if (next.confidence !== current.confidence) return next.confidence > current.confidence;
  return next.priceAmount != null && current.priceAmount == null;
}

export class TrialDesk {
  private readonly trials = new Map<string, StoredTrial>();
  private mode: SourceMode = "demo";

  constructor(
    private readonly extractor: TrialExtractor,
    private readonly guide: GuidedCancellation,
    readonly executor: NotAutomatedExecutor,
  ) {}

  get modeName(): SourceMode {
    return this.mode;
  }

  clear(): void {
    this.trials.clear();
    this.mode = "demo";
  }

  get(id: string): StoredTrial | undefined {
    return this.trials.get(id);
  }

  list(): StoredTrial[] {
    return [...this.trials.values()];
  }

  async ingest(emails: EmailInput[], source: SourceMode, now: Date): Promise<IngestStats> {
    const prior = new Map(this.trials);
    const best = new Map<string, { extracted: ExtractedTrial; email: EmailInput }>();
    let ignored = 0;
    let undated = 0;

    for (const email of emails) {
      const extracted = await this.extractor.extract(email, now);
      if (!extracted?.isTrial) {
        ignored += 1;
        continue;
      }
      if (!extracted.expiryDate) {
        undated += 1;
        continue;
      }
      const current = best.get(extracted.serviceId);
      if (!current || prefer(extracted, current.extracted)) {
        best.set(extracted.serviceId, { extracted, email });
      }
    }

    this.trials.clear();
    for (const [id, item] of best) {
      const previous = prior.get(id);
      const expiryDate = item.extracted.expiryDate;
      if (!expiryDate) continue;
      this.trials.set(id, {
        id,
        service: item.extracted.service,
        trialStart: item.extracted.trialStart,
        expiryDate,
        priceAmount: item.extracted.priceAmount,
        priceCurrency: item.extracted.priceCurrency || "USD",
        priceInterval: item.extracted.priceInterval,
        source,
        status: previous?.status ?? "tracking",
        remindOn: previous?.status === "snoozed" ? previous.remindOn : null,
        guidanceApproved: previous?.guidanceApproved ?? false,
        evidence: {
          messageId: item.email.messageId.slice(0, 200),
          subject: item.email.subject.slice(0, 180),
          from: item.email.from.slice(0, 180),
          receivedAt: item.email.receivedAt,
          kind: item.extracted.kind,
        },
      });
    }
    this.mode = source;
    return { found: this.trials.size, ignored, undated };
  }

  markKept(id: string): StoredTrial | null {
    const trial = this.trials.get(id);
    if (!trial) return null;
    trial.status = "kept";
    trial.remindOn = null;
    return trial;
  }

  snooze(id: string, days: number, now: Date): StoredTrial | null {
    const trial = this.trials.get(id);
    if (!trial) return null;
    const clamped = Math.min(Math.max(Math.floor(days), 1), 60);
    trial.status = "snoozed";
    trial.remindOn = addCivilDays(civilFromDate(now), clamped);
    return trial;
  }

  approve(
    id: string,
    input: { confirmed: unknown; confirmationText: unknown },
    accountEmail: string | null,
  ):
    | { ok: true; playbook: Playbook }
    | { ok: false; reason: string; expectedPhrase: string } {
    const trial = this.trials.get(id);
    if (!trial) {
      return { ok: false, reason: "No trial with that id.", expectedPhrase: "" };
    }
    const decision = evaluateApproval({
      service: trial.service,
      confirmed: input.confirmed,
      confirmationText: input.confirmationText,
    });
    if (!decision.ok) return decision;
    trial.guidanceApproved = true;
    return { ok: true, playbook: this.guide.build(trial, accountEmail) };
  }

  playbookFor(id: string, accountEmail: string | null): Playbook | null {
    const trial = this.trials.get(id);
    if (!trial?.guidanceApproved) return null;
    return this.guide.build(trial, accountEmail);
  }

  dashboard(now: Date, options: DashboardOptions = {}): Dashboard {
    const today = civilFromDate(now);
    const sorted = [...this.trials.values()].sort((a, b) => {
      const rank = (trial: StoredTrial) => (trial.status === "kept" ? 1 : 0);
      const byStatus = rank(a) - rank(b);
      if (byStatus !== 0) return byStatus;
      return daysBetween(today, a.expiryDate) - daysBetween(today, b.expiryDate);
    });
    const trials = sorted.map((trial) => this.toView(trial, today));
    const atRisk = sorted.filter((trial) => trial.status !== "kept");
    let monthly = 0;
    let annual = 0;
    let missingPrice = false;
    let nonUsd = false;
    for (const trial of atRisk) {
      const month = monthlyContribution(trial.priceAmount, trial.priceCurrency, trial.priceInterval);
      const year = annualContribution(trial.priceAmount, trial.priceCurrency, trial.priceInterval);
      if (trial.priceAmount == null) missingPrice = true;
      else if (trial.priceCurrency !== "USD") nonUsd = true;
      if (month != null) monthly += month;
      if (year != null) annual += year;
    }
    monthly = roundMoney(monthly);
    annual = roundMoney(annual);
    const withinDays = options.withinDays ?? null;
    const charges = trials
      .filter((trial) => trial.status !== "kept")
      .filter((trial) => withinDays == null || trial.daysLeft <= withinDays)
      .map((trial) => ({
        id: trial.id,
        service: trial.service,
        expiryDate: trial.expiryDate,
        expiryLabel: trial.expiryLabel,
        daysLeft: trial.daysLeft,
        priceLabel: trial.priceLabel,
        remindOn: trial.remindOn,
      }));
    const urgentCount = trials.filter((trial) => trial.urgent).length;
    const atRiskCount = atRisk.length;
    const notices = [options.notice ?? null];
    if (missingPrice) notices.push("A trial is missing a price, so it is left out of the dollar totals.");
    if (nonUsd) notices.push("A price is not in USD, so it is left out of the dollar totals.");
    const notice = notices.filter(Boolean).join(" ") || null;
    const headline =
      trials.length === 0
        ? "No trials tracked yet."
        : `${atRiskCount} at risk, ${urgentCount} ending within 3 days.`;

    return {
      mode: this.mode,
      demo: this.mode === "demo",
      dataLabel: this.mode === "demo" ? "Demo data" : "Inbox",
      headline,
      exposureMonthly: monthly,
      exposureAnnual: annual,
      exposureMonthlyLabel: formatMoney(monthly, "USD"),
      exposureAnnualLabel: formatMoney(annual, "USD"),
      trialCount: trials.length,
      urgentCount,
      atRiskCount,
      trials,
      charges,
      notice,
      error: options.error ?? null,
      focusedTrialId: options.focusedTrialId ?? null,
      playbook: options.playbook ?? null,
    };
  }

  private toView(trial: StoredTrial, today: string): TrialView {
    const profile = getProfile(trial.id);
    const fallback = genericGuidance();
    const daysLeft = daysBetween(today, trial.expiryDate);
    return {
      id: trial.id,
      service: trial.service,
      status: trial.status,
      trialStart: trial.trialStart,
      trialStartLabel: trial.trialStart ? formatCivilLabel(trial.trialStart) : null,
      expiryDate: trial.expiryDate,
      expiryLabel: formatCivilLabel(trial.expiryDate),
      daysLeft,
      daysLabel: daysLabel(daysLeft),
      priceAmount: trial.priceAmount,
      priceCurrency: trial.priceCurrency,
      priceInterval: trial.priceInterval,
      priceLabel: formatPrice(trial.priceAmount, trial.priceCurrency, trial.priceInterval),
      cancelUrl: profile?.cancelUrl ?? fallback.cancelUrl,
      cancelSummary: profile?.summary ?? fallback.summary,
      steps: profile?.steps ?? fallback.steps,
      source: trial.source,
      remindOn: trial.remindOn,
      remindLabel: trial.remindOn ? formatCivilLabel(trial.remindOn) : null,
      guidanceApproved: trial.guidanceApproved,
      urgent: daysLeft <= 3 && trial.status !== "kept",
      evidenceSubject: trial.evidence.subject,
      evidenceFrom: trial.evidence.from,
      approvalPhrase: expectedConfirmationPhrase(trial.service),
    };
  }
}

export function createDesk(extractor: TrialExtractor = heuristicExtractor): TrialDesk {
  return new TrialDesk(extractor, new GuidedCancellation(), new NotAutomatedExecutor());
}
