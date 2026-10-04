import { getProfile, genericGuidance } from "./catalog.js";
import { formatCivilLabel } from "./dates.js";
import { formatPrice } from "./money.js";
import type { Playbook, StoredTrial } from "./types.js";

export const GUIDANCE_NOTE =
  "Nothing was cancelled. No email was sent. Open the cancel page yourself, or copy the draft and send it from your own mailbox.";

export type CancellationExecutor = {
  execute(playbook: Playbook): Promise<never>;
};

/** Seam for a future automated canceler. The MVP never calls it. */
export class NotAutomatedExecutor implements CancellationExecutor {
  calls = 0;

  async execute(_playbook: Playbook): Promise<never> {
    this.calls += 1;
    throw new Error(
      "Automated cancellation is not available. Use the cancel page or send the draft yourself.",
    );
  }
}

export function draftCancellationEmail(input: {
  service: string;
  expiryLabel: string;
  priceLabel: string;
  accountEmail: string | null;
}): { subject: string; body: string } {
  const lines = [
    `Hello ${input.service} support,`,
    "",
    "Please cancel my free trial before it converts to a paid subscription.",
    `Service: ${input.service}`,
    `Trial end date: ${input.expiryLabel}`,
    `Price after trial: ${input.priceLabel}`,
  ];
  if (input.accountEmail) {
    lines.push(`Account email: ${input.accountEmail}`);
  }
  lines.push(
    "Please reply to confirm that the trial is cancelled and that you will not charge the payment method on file.",
    "",
    "This message was drafted by FreeTrial Terminator for me to send myself. It has not been sent.",
    "",
    "Thank you",
  );
  return {
    subject: `Please cancel my ${input.service} free trial`,
    body: lines.join("\n"),
  };
}

export class GuidedCancellation {
  build(trial: StoredTrial, accountEmail: string | null): Playbook {
    const profile = getProfile(trial.id);
    const fallback = genericGuidance();
    const expiryLabel = formatCivilLabel(trial.expiryDate);
    const priceLabel = formatPrice(trial.priceAmount, trial.priceCurrency, trial.priceInterval);
    const draft = draftCancellationEmail({
      service: trial.service,
      expiryLabel,
      priceLabel,
      accountEmail,
    });
    return {
      trialId: trial.id,
      service: trial.service,
      cancelUrl: profile?.cancelUrl ?? fallback.cancelUrl,
      steps: profile?.steps ?? fallback.steps,
      emailSubject: draft.subject,
      emailBody: draft.body,
      approved: true,
      automated: false,
      note: GUIDANCE_NOTE,
    };
  }
}
