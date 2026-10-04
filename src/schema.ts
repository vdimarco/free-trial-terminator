import { z } from "zod";

export const scanInputShape = {
  source: z.enum(["auto", "demo", "gmail"]).optional(),
  maxMessages: z.number().int().min(1).max(30).optional(),
};

export const listInputShape = {
  includeKept: z.boolean().optional(),
};

export const trialIdInputShape = {
  trialId: z.string().min(1),
};

export const approveInputShape = {
  trialId: z.string().min(1),
  confirmed: z.boolean(),
  confirmationText: z.string(),
};

export const snoozeInputShape = {
  trialId: z.string().min(1),
  remindInDays: z.number().int().min(1).max(60).optional(),
};

export const upcomingInputShape = {
  withinDays: z.number().int().min(1).max(365).optional(),
};

const trialViewShape = z.object({
  id: z.string(),
  service: z.string(),
  status: z.enum(["tracking", "kept", "snoozed"]),
  trialStart: z.string().nullable(),
  trialStartLabel: z.string().nullable(),
  expiryDate: z.string(),
  expiryLabel: z.string(),
  daysLeft: z.number().int(),
  daysLabel: z.string(),
  priceAmount: z.number().nullable(),
  priceCurrency: z.string(),
  priceInterval: z.enum(["month", "year", "unknown"]),
  priceLabel: z.string(),
  cancelUrl: z.string().nullable(),
  cancelSummary: z.string(),
  steps: z.array(z.string()),
  source: z.enum(["demo", "gmail"]),
  remindOn: z.string().nullable(),
  remindLabel: z.string().nullable(),
  guidanceApproved: z.boolean(),
  urgent: z.boolean(),
  evidenceSubject: z.string(),
  evidenceFrom: z.string(),
  approvalPhrase: z.string(),
});

const chargeShape = z.object({
  id: z.string(),
  service: z.string(),
  expiryDate: z.string(),
  expiryLabel: z.string(),
  daysLeft: z.number().int(),
  priceLabel: z.string(),
  remindOn: z.string().nullable(),
});

const playbookShape = z.object({
  trialId: z.string(),
  service: z.string(),
  cancelUrl: z.string().nullable(),
  steps: z.array(z.string()),
  emailSubject: z.string(),
  emailBody: z.string(),
  approved: z.boolean(),
  automated: z.boolean(),
  note: z.string(),
});

export const dashboardOutputShape = {
  mode: z.enum(["demo", "gmail"]),
  demo: z.boolean(),
  dataLabel: z.string(),
  headline: z.string(),
  exposureMonthly: z.number(),
  exposureAnnual: z.number(),
  exposureMonthlyLabel: z.string(),
  exposureAnnualLabel: z.string(),
  trialCount: z.number().int(),
  urgentCount: z.number().int(),
  atRiskCount: z.number().int(),
  trials: z.array(trialViewShape),
  charges: z.array(chargeShape),
  notice: z.string().nullable(),
  error: z.string().nullable(),
  focusedTrialId: z.string().nullable(),
  playbook: playbookShape.nullable(),
};

export const ScanArgs = z.object(scanInputShape);
export const ListArgs = z.object(listInputShape);
export const TrialIdArgs = z.object(trialIdInputShape);
export const ApproveArgs = z.object(approveInputShape);
export const SnoozeArgs = z.object(snoozeInputShape);
export const UpcomingArgs = z.object(upcomingInputShape);
