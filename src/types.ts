export type SourceMode = "demo" | "gmail";

export type TrialStatus = "tracking" | "kept" | "snoozed";

export type PriceInterval = "month" | "year" | "unknown";

export type EmailKind =
  | "welcome"
  | "trial_started"
  | "receipt"
  | "trial_ending"
  | "renewal_notice";

/** Transient email fields. The tracker must not persist snippet or plainText. */
export type EmailInput = {
  messageId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  plainText?: string;
};

export type TrialExtractor = {
  readonly name: string;
  extract(email: EmailInput, now: Date): Promise<ExtractedTrial | null>;
};

export type ExtractedTrial = {
  service: string;
  serviceId: string;
  trialStart: string | null;
  expiryDate: string | null;
  priceAmount: number | null;
  priceCurrency: string;
  priceInterval: PriceInterval;
  kind: EmailKind;
  confidence: number;
  isTrial: boolean;
};

export type Evidence = {
  messageId: string;
  subject: string;
  from: string;
  receivedAt: string;
  kind: EmailKind;
};

export type StoredTrial = {
  id: string;
  service: string;
  trialStart: string | null;
  expiryDate: string;
  priceAmount: number | null;
  priceCurrency: string;
  priceInterval: PriceInterval;
  source: SourceMode;
  status: TrialStatus;
  remindOn: string | null;
  guidanceApproved: boolean;
  evidence: Evidence;
};

export type Playbook = {
  trialId: string;
  service: string;
  cancelUrl: string | null;
  steps: string[];
  emailSubject: string;
  emailBody: string;
  approved: boolean;
  automated: boolean;
  note: string;
};

export type TrialView = {
  id: string;
  service: string;
  status: TrialStatus;
  trialStart: string | null;
  trialStartLabel: string | null;
  expiryDate: string;
  expiryLabel: string;
  daysLeft: number;
  daysLabel: string;
  priceAmount: number | null;
  priceCurrency: string;
  priceInterval: PriceInterval;
  priceLabel: string;
  cancelUrl: string | null;
  cancelSummary: string;
  steps: string[];
  source: SourceMode;
  remindOn: string | null;
  remindLabel: string | null;
  guidanceApproved: boolean;
  urgent: boolean;
  evidenceSubject: string;
  evidenceFrom: string;
  approvalPhrase: string;
};

export type ChargeView = {
  id: string;
  service: string;
  expiryDate: string;
  expiryLabel: string;
  daysLeft: number;
  priceLabel: string;
  remindOn: string | null;
};

export type Dashboard = {
  mode: SourceMode;
  demo: boolean;
  dataLabel: string;
  headline: string;
  exposureMonthly: number;
  exposureAnnual: number;
  exposureMonthlyLabel: string;
  exposureAnnualLabel: string;
  trialCount: number;
  urgentCount: number;
  atRiskCount: number;
  trials: TrialView[];
  charges: ChargeView[];
  notice: string | null;
  error: string | null;
  focusedTrialId: string | null;
  playbook: Playbook | null;
};
