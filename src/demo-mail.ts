import { addCivilDays, civilFromDate, formatCivilLong } from "./dates.js";
import type { EmailInput } from "./types.js";

/** Example inbox. Dates are relative to `now`, so the demo stays upcoming. */
export function buildDemoEmails(now: Date): EmailInput[] {
  const receivedAt = now.toISOString();
  const today = civilFromDate(now);
  const on = (days: number) => formatCivilLong(addCivilDays(today, days));

  return [
    {
      messageId: "demo-canva",
      from: "Canva <no-reply@canva.com>",
      subject: "Your Canva Pro trial ends tomorrow",
      snippet:
        "Your free trial ends tomorrow. After your trial, you will be billed $14.99/month unless you cancel.",
      receivedAt,
      plainText:
        "DO_NOT_STORE_BODY Your free trial ends tomorrow. After your trial, you will be billed $14.99/month unless you cancel.",
    },
    {
      messageId: "demo-duolingo",
      from: "Duolingo <hello@duolingo.com>",
      subject: "Your Super Duolingo free trial",
      snippet: "Your free trial ends in 3 days. Then Super Duolingo is $12.99/month unless you cancel.",
      receivedAt,
    },
    {
      messageId: "demo-adobe",
      from: "Adobe <message@adobe.com>",
      subject: "Your Adobe Photoshop trial will end",
      snippet: `Your free trial will end on ${on(5)}. The price after trial is $22.99/month.`,
      receivedAt,
    },
    {
      messageId: "demo-linkedin",
      from: "LinkedIn <messages-noreply@linkedin.com>",
      subject: "Your LinkedIn Premium free trial",
      snippet: `Your free trial of Premium ends on ${on(6)}. Subscription fee: $39.99 USD per month unless you cancel.`,
      receivedAt,
    },
    {
      messageId: "demo-notion",
      from: "Notion <team@mail.notion.so>",
      subject: "Welcome to Notion Plus",
      snippet:
        "Your 14-day free trial started 5 days ago. Your free trial ends in 9 days. After your trial, Notion Plus is $12/month unless you cancel.",
      receivedAt,
    },
    {
      messageId: "demo-headspace",
      from: "Headspace <hello@headspace.com>",
      subject: "Your Headspace trial ends soon",
      snippet: `Your free trial ends on ${on(14)}. Then Headspace is $12.99 per month unless you cancel.`,
      receivedAt,
    },
    {
      messageId: "demo-nyt",
      from: '"The New York Times" <noreply@nytimes.com>',
      subject: "Your New York Times free trial",
      snippet: `Your free trial ends on ${on(28)}. After your trial, you will be billed $17/month unless you cancel.`,
      receivedAt,
    },
    {
      messageId: "demo-masterclass",
      from: "MasterClass <hello@masterclass.com>",
      subject: "Your MasterClass free trial",
      snippet: `Your free trial is active. Enjoy free access until ${on(30)}. After your trial, annual membership is $120/year unless you cancel.`,
      receivedAt,
    },
    {
      messageId: "demo-noise-canva",
      from: "Canva <ideas@canva.com>",
      subject: "Five layouts to try this week",
      snippet: "A short design roundup with no billing change.",
      receivedAt,
    },
    {
      messageId: "demo-noise-netflix",
      from: "Netflix <info@netflix.com>",
      subject: "Your Netflix membership will renew",
      snippet: "You will be billed $15.49/month on your next billing date. Manage your membership online.",
      receivedAt,
    },
  ];
}
