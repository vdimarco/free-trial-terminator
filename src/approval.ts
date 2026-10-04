export type ApprovalInput = {
  service: string;
  confirmed: unknown;
  confirmationText: unknown;
};

export type ApprovalDecision =
  | { ok: true; phrase: string }
  | { ok: false; reason: string; expectedPhrase: string };

export function expectedConfirmationPhrase(service: string): string {
  return `I approve cancellation guidance for ${service}`;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Cancellation guidance is released only when the caller passes a real boolean
 * true and the exact approval sentence. A missing flag, the string "true",
 * or a paraphrased sentence all fail.
 */
export function evaluateApproval(input: ApprovalInput): ApprovalDecision {
  const expectedPhrase = expectedConfirmationPhrase(input.service);
  if (input.confirmed !== true) {
    return {
      ok: false,
      reason:
        "Cancellation guidance requires confirmed set to the boolean true, and only after the user explicitly agrees.",
      expectedPhrase,
    };
  }
  if (typeof input.confirmationText !== "string" || normalize(input.confirmationText) !== normalize(expectedPhrase)) {
    return {
      ok: false,
      reason: "Confirmation text does not match the required approval sentence.",
      expectedPhrase,
    };
  }
  return { ok: true, phrase: expectedPhrase };
}
