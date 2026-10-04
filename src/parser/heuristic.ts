import { identifyService } from "../catalog.js";
import { addCivilDays, civilFromDate, civilFromIso } from "../dates.js";
import type { EmailInput, EmailKind, ExtractedTrial, PriceInterval } from "../types.js";

const TRIAL_PATTERN =
  /\b(free trial|trial ends|trial will end|your trial|after your trial|trial period|premium trial|trial started|start of your trial)\b/i;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

type PriceHit = {
  amount: number;
  currency: string;
  interval: PriceInterval;
};

function civilFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return civilFromDate(date);
}

export function parseAbsoluteDate(fragment: string): string | null {
  const iso = fragment.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return civilFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthFirst = fragment.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    if (!month) return null;
    return civilFromParts(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }

  const dayFirst = fragment.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    if (!month) return null;
    return civilFromParts(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }

  return null;
}

function intervalOf(raw: string): PriceInterval {
  const value = raw.toLowerCase();
  if (value === "month" || value === "mo") return "month";
  if (value === "year" || value === "yr" || value === "annum") return "year";
  return "unknown";
}

function acceptAmount(raw: string): number | null {
  const amount = Math.round(Number(raw) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) return null;
  return amount;
}

const PRICE_PATTERNS: Array<{ re: RegExp; currency: string }> = [
  { re: /\$\s*(\d{1,4}(?:\.\d{2})?)\s*USD\s*(?:\/|\s*per\s*|\s*a\s*)\s*(month|mo|year|yr|annum)/i, currency: "USD" },
  { re: /\$\s*(\d{1,4}(?:\.\d{2})?)\s*(?:\/|\s*per\s*|\s*a\s*)\s*(month|mo|year|yr|annum)/i, currency: "USD" },
  { re: /(\d{1,4}(?:\.\d{2})?)\s*USD\s*(?:\/|\s*per\s*)\s*(month|mo|year|yr|annum)/i, currency: "USD" },
  { re: /USD\s*(\d{1,4}(?:\.\d{2})?)\s*(?:\/|\s*per\s*|\s*a\s*)\s*(month|mo|year|yr|annum)/i, currency: "USD" },
  { re: /£\s*(\d{1,4}(?:\.\d{2})?)\s*(?:\/|\s*per\s*|\s*a\s*)\s*(month|mo|year|yr|annum)/i, currency: "GBP" },
  { re: /€\s*(\d{1,4}(?:\.\d{2})?)\s*(?:\/|\s*per\s*|\s*a\s*)\s*(month|mo|year|yr|annum)/i, currency: "EUR" },
];

export function matchPrice(text: string): PriceHit | null {
  for (const pattern of PRICE_PATTERNS) {
    const match = text.match(pattern.re);
    if (!match?.[1] || !match[2]) continue;
    const amount = acceptAmount(match[1]);
    if (amount == null) continue;
    return { amount, currency: pattern.currency, interval: intervalOf(match[2]) };
  }
  return null;
}

export function extractPrice(text: string): PriceHit | null {
  const windows: string[] = [];
  const cue =
    /(?:after your trial|price after trial|will be billed|subscription fee|membership is|then)\b[:\s]{0,16}([^.\n]{0,90})/gi;
  let match: RegExpExecArray | null;
  while ((match = cue.exec(text))) {
    if (match[1]) windows.push(match[1]);
  }
  for (const window of windows) {
    const price = matchPrice(window);
    if (price) return price;
  }
  return matchPrice(text);
}

function extractStart(text: string, receivedCivil: string): string | null {
  const ago = text.match(/\bstarted\s+(\d{1,3})\s+days?\s+ago\b/i);
  if (ago?.[1]) return addCivilDays(receivedCivil, -Number(ago[1]));
  const startedOn = text.match(/\bstarted on\s+([^.\n]{0,40})/i);
  if (startedOn?.[1]) {
    const parsed = parseAbsoluteDate(startedOn[1]);
    if (parsed) return parsed;
  }
  if (/\b(started today|begins today|starts today)\b/i.test(text)) return receivedCivil;
  return null;
}

function extractCuedDate(text: string): string | null {
  const cue =
    /\b(?:ends on|will end on|free until|access until|valid until|converts on|billing starts on|until)\s+([^.\n]{0,48})/gi;
  let match: RegExpExecArray | null;
  while ((match = cue.exec(text))) {
    const parsed = match[1] ? parseAbsoluteDate(match[1]) : null;
    if (parsed) return parsed;
  }
  return null;
}

export function extractSchedule(
  text: string,
  receivedCivil: string,
): { expiry: string | null; start: string | null } {
  const start = extractStart(text, receivedCivil);
  const inDays = text.match(/\bends in\s+(\d{1,3})\s+days?\b/i);
  if (inDays?.[1]) return { expiry: addCivilDays(receivedCivil, Number(inDays[1])), start };
  if (/\bends tomorrow\b/i.test(text)) return { expiry: addCivilDays(receivedCivil, 1), start };
  if (/\bends today\b/i.test(text)) return { expiry: receivedCivil, start };

  const cued = extractCuedDate(text);
  if (cued) return { expiry: cued, start };

  const duration = text.match(/\b(\d{1,3})\s*-?\s*day\s+(?:free\s+)?trial\b/i);
  if (duration?.[1] && start) {
    return { expiry: addCivilDays(start, Number(duration[1])), start };
  }
  return { expiry: null, start };
}

function detectKind(subject: string, text: string): EmailKind {
  const blob = `${subject}\n${text}`;
  if (/\b(trial ends|trial will end|ends on|ends in|ends tomorrow|ends today|free access until)\b/i.test(blob)) {
    return "trial_ending";
  }
  if (/\b(receipt|payment confirmation)\b/i.test(blob)) return "receipt";
  if (/\bwelcome\b/i.test(blob)) return "welcome";
  if (/\b(trial started|started your|has begun)\b/i.test(blob)) return "trial_started";
  return "renewal_notice";
}

export function emailText(email: EmailInput): string {
  return [email.subject, email.snippet, email.plainText ?? ""].filter(Boolean).join("\n").slice(0, 8000);
}

export function extractHeuristic(email: EmailInput, _now: Date): ExtractedTrial {
  const text = emailText(email);
  const receivedCivil = civilFromIso(email.receivedAt);
  const identified = identifyService(email.from, text);
  const isTrial = TRIAL_PATTERN.test(text);
  const schedule = extractSchedule(text, receivedCivil);
  const price = extractPrice(text);
  let confidence = 0;
  if (isTrial) confidence += 0.4;
  if (schedule.expiry) confidence += 0.35;
  if (price) confidence += 0.15;
  if (identified.matchedProfile) confidence += 0.1;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    service: identified.service,
    serviceId: identified.serviceId,
    trialStart: schedule.start,
    expiryDate: schedule.expiry,
    priceAmount: price?.amount ?? null,
    priceCurrency: price?.currency ?? "USD",
    priceInterval: price?.interval ?? "unknown",
    kind: detectKind(email.subject, text),
    confidence,
    isTrial,
  };
}
