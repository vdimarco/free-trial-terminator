export type ServiceProfile = {
  id: string;
  service: string;
  domains: string[];
  aliases: string[];
  /** Domain hits count only when an alias is also present. Use for broad hosts. */
  requireAlias: boolean;
  cancelUrl: string | null;
  summary: string;
  steps: string[];
};

const GENERIC_SUMMARY =
  "Sign in yourself, open billing or subscription settings, and cancel before the trial ends.";

const GENERIC_STEPS = [
  "Open the service and sign in yourself.",
  "Find Billing, Subscription, or Plan settings.",
  "Cancel before the date on this card and save the confirmation.",
  "If you cannot find the setting, send the draft email from the address that received the trial.",
];

export const PROFILES: ServiceProfile[] = [
  {
    id: "canva",
    service: "Canva",
    domains: ["canva.com"],
    aliases: ["Canva"],
    requireAlias: false,
    cancelUrl: "https://www.canva.com/settings/billing",
    summary: "Cancel Canva Pro in billing settings before the trial ends.",
    steps: [
      "Open Canva billing settings and sign in yourself.",
      "Select the Pro plan and choose Cancel.",
      "Confirm before the trial end date.",
      "Check the inbox for a cancellation receipt.",
    ],
  },
  {
    id: "duolingo",
    service: "Duolingo",
    domains: ["duolingo.com"],
    aliases: ["Duolingo", "Super Duolingo"],
    requireAlias: false,
    cancelUrl: "https://www.duolingo.com/settings/super",
    summary: "Cancel Super Duolingo in settings, or in the app store that billed you.",
    steps: [
      "Open Duolingo Super settings and sign in yourself.",
      "Choose Cancel Super.",
      "If you subscribed in the App Store or Google Play, cancel there instead.",
      "Confirm the end date shown after you cancel.",
    ],
  },
  {
    id: "adobe",
    service: "Adobe",
    domains: ["adobe.com"],
    aliases: ["Adobe", "Adobe Photoshop", "Creative Cloud"],
    requireAlias: false,
    cancelUrl: "https://account.adobe.com/plans",
    summary: "Cancel the Adobe plan in your Adobe account before the trial ends.",
    steps: [
      "Open Adobe plans and sign in yourself.",
      "Select the trial plan and choose Cancel plan.",
      "Finish the prompts before the trial end date.",
      "Save the cancellation number Adobe shows at the end.",
    ],
  },
  {
    id: "linkedin",
    service: "LinkedIn",
    domains: ["linkedin.com"],
    aliases: ["LinkedIn", "LinkedIn Premium"],
    requireAlias: false,
    cancelUrl: "https://www.linkedin.com/psettings/premium-subscription",
    summary: "Cancel LinkedIn Premium in subscription settings.",
    steps: [
      "Open LinkedIn premium settings and sign in yourself.",
      "Choose Cancel subscription.",
      "If a phone store billed you, cancel in that store instead.",
      "Confirm Premium will not renew.",
    ],
  },
  {
    id: "notion",
    service: "Notion",
    domains: ["notion.so", "notion.com"],
    aliases: ["Notion"],
    requireAlias: false,
    cancelUrl: "https://www.notion.so/profile/plans",
    summary: "Cancel the Notion plan from Plans. A workspace admin may have to do it.",
    steps: [
      "Open Notion Plans while logged in to the workspace that started the trial.",
      "Choose Cancel plan.",
      "Confirm before the trial end date.",
      "If the button is missing, ask a workspace admin to cancel.",
    ],
  },
  {
    id: "headspace",
    service: "Headspace",
    domains: ["headspace.com"],
    aliases: ["Headspace"],
    requireAlias: false,
    cancelUrl: "https://www.headspace.com/settings/subscription",
    summary: "Cancel Headspace in subscription settings or the store that billed you.",
    steps: [
      "Open Headspace subscription settings and sign in yourself.",
      "Choose Cancel subscription.",
      "If you subscribed on a phone, cancel in the Apple or Google subscriptions list.",
      "Keep the confirmation email.",
    ],
  },
  {
    id: "masterclass",
    service: "MasterClass",
    domains: ["masterclass.com"],
    aliases: ["MasterClass"],
    requireAlias: false,
    cancelUrl: "https://www.masterclass.com/settings",
    summary: "Cancel the MasterClass membership in account settings.",
    steps: [
      "Open MasterClass settings and sign in yourself.",
      "Open Membership and choose Cancel.",
      "Confirm before the trial converts to the annual plan.",
      "Save the on-screen confirmation.",
    ],
  },
  {
    id: "new-york-times",
    service: "New York Times",
    domains: ["nytimes.com"],
    aliases: ["New York Times", "NYTimes"],
    requireAlias: false,
    cancelUrl: "https://www.nytimes.com/account/subscription",
    summary: "Cancel the New York Times subscription in your account.",
    steps: [
      "Open New York Times subscription settings and sign in yourself.",
      "Choose Cancel subscription.",
      "Follow the prompts until you see the end date.",
      "If you subscribed through a store or a gift, use that path instead.",
    ],
  },
  {
    id: "spotify",
    service: "Spotify",
    domains: ["spotify.com"],
    aliases: ["Spotify"],
    requireAlias: false,
    cancelUrl: "https://www.spotify.com/account/subscription/",
    summary: "Cancel Spotify Premium on the subscription page, or in the store that billed you.",
    steps: [
      "Open the Spotify subscription page and sign in yourself.",
      "Choose Cancel Premium.",
      "If Apple or Google billed you, cancel in that store.",
      "Note the date Premium access ends.",
    ],
  },
  {
    id: "netflix",
    service: "Netflix",
    domains: ["netflix.com"],
    aliases: ["Netflix"],
    requireAlias: false,
    cancelUrl: "https://www.netflix.com/cancelplan",
    summary: "Cancel Netflix on the cancel plan page.",
    steps: [
      "Open the Netflix cancel plan page and sign in yourself.",
      "Choose Finish Cancellation.",
      "Confirm the membership end date.",
      "If a partner or a phone store billed you, cancel with them instead.",
    ],
  },
  {
    id: "calm",
    service: "Calm",
    domains: ["calm.com"],
    aliases: ["Calm"],
    requireAlias: false,
    cancelUrl: "https://www.calm.com/settings",
    summary: "Cancel Calm in account settings or the store that billed you.",
    steps: [
      "Open Calm settings and sign in yourself.",
      "Open Subscription and choose Cancel.",
      "If you subscribed on a phone, cancel in the Apple or Google subscriptions list.",
      "Keep the confirmation.",
    ],
  },
  {
    id: "disney-plus",
    service: "Disney+",
    domains: ["disneyplus.com"],
    aliases: ["Disney+"],
    requireAlias: false,
    cancelUrl: "https://www.disneyplus.com/commerce/subscription",
    summary: "Cancel Disney+ from the subscription page.",
    steps: [
      "Open Disney+ subscription settings and sign in yourself.",
      "Choose Cancel subscription.",
      "Confirm before the trial end date.",
      "If a bundle or a phone store billed you, cancel that plan instead.",
    ],
  },
  {
    id: "hulu",
    service: "Hulu",
    domains: ["hulu.com"],
    aliases: ["Hulu"],
    requireAlias: false,
    cancelUrl: "https://secure.hulu.com/account",
    summary: "Cancel Hulu from the account page.",
    steps: [
      "Open your Hulu account and sign in yourself.",
      "Choose Cancel.",
      "Confirm the date access ends.",
      "If Hulu is part of a Disney bundle, cancel the bundle.",
    ],
  },
  {
    id: "grammarly",
    service: "Grammarly",
    domains: ["grammarly.com"],
    aliases: ["Grammarly"],
    requireAlias: false,
    cancelUrl: "https://account.grammarly.com/subscription",
    summary: "Cancel Grammarly from the subscription page.",
    steps: [
      "Open Grammarly subscription settings and sign in yourself.",
      "Choose Cancel subscription.",
      "Confirm before the trial converts.",
      "Save the confirmation email.",
    ],
  },
  {
    id: "dropbox",
    service: "Dropbox",
    domains: ["dropbox.com"],
    aliases: ["Dropbox"],
    requireAlias: false,
    cancelUrl: "https://www.dropbox.com/account/plan",
    summary: "Cancel Dropbox from the plan page.",
    steps: [
      "Open Dropbox plan settings and sign in yourself.",
      "Choose Cancel plan.",
      "Confirm before the trial end date.",
      "Check that the plan name changes off the paid tier.",
    ],
  },
  {
    id: "microsoft-365",
    service: "Microsoft 365",
    domains: ["office.com", "office365.com"],
    aliases: ["Microsoft 365", "Office 365"],
    requireAlias: false,
    cancelUrl: "https://account.microsoft.com/services",
    summary: "Cancel Microsoft 365 under Microsoft account services.",
    steps: [
      "Open Microsoft account services and sign in yourself.",
      "Find Microsoft 365 and choose Manage, then Cancel.",
      "Confirm before the trial end date.",
      "If your work admin owns the license, ask them to cancel it.",
    ],
  },
  {
    id: "youtube-premium",
    service: "YouTube Premium",
    domains: ["youtube.com"],
    aliases: ["YouTube Premium"],
    requireAlias: true,
    cancelUrl: "https://www.youtube.com/paid_memberships",
    summary: "Cancel YouTube Premium from paid memberships.",
    steps: [
      "Open YouTube paid memberships and sign in yourself.",
      "Choose YouTube Premium, then Deactivate or Cancel.",
      "Confirm before the trial end date.",
      "If a phone store billed you, cancel in that store.",
    ],
  },
  {
    id: "amazon-prime",
    service: "Amazon Prime",
    domains: ["amazon.com"],
    aliases: ["Amazon Prime", "Prime Video"],
    requireAlias: true,
    cancelUrl: "https://www.amazon.com/gp/primecentral",
    summary: "End the Amazon Prime trial from Prime membership settings.",
    steps: [
      "Open Prime membership settings and sign in yourself.",
      "Choose End membership or Cancel Prime trial.",
      "Confirm you do not want to keep the benefits.",
      "Check that the page says the membership will not renew.",
    ],
  },
  {
    id: "apple",
    service: "Apple",
    domains: ["apple.com"],
    aliases: ["Apple One", "Apple TV", "Apple Music"],
    requireAlias: true,
    cancelUrl: "https://support.apple.com/en-us/118428",
    summary: "Cancel Apple subscriptions in Settings on the device, or at account.apple.com.",
    steps: [
      "On an iPhone, open Settings, tap your name, then Subscriptions.",
      "Select the trial and tap Cancel Subscription.",
      "You can also open account.apple.com, then Subscriptions, and cancel there.",
      "Apple bills these trials. The service itself often cannot cancel them.",
    ],
  },
  {
    id: "paramount-plus",
    service: "Paramount+",
    domains: ["paramountplus.com"],
    aliases: ["Paramount+"],
    requireAlias: false,
    cancelUrl: "https://www.paramountplus.com/account/",
    summary: "Cancel Paramount+ from the account page.",
    steps: [
      "Open your Paramount+ account and sign in yourself.",
      "Choose Cancel subscription.",
      "Confirm before the trial end date.",
      "If a partner billed you, cancel with that partner.",
    ],
  },
  {
    id: "peacock",
    service: "Peacock",
    domains: ["peacocktv.com"],
    aliases: ["Peacock"],
    requireAlias: false,
    cancelUrl: "https://www.peacocktv.com/account/plans",
    summary: "Cancel Peacock from account plans.",
    steps: [
      "Open Peacock plans and sign in yourself.",
      "Choose Cancel plan.",
      "Confirm before the trial end date.",
      "If a phone store or a TV provider billed you, cancel there instead.",
    ],
  },
];

export function genericGuidance(): { summary: string; steps: string[]; cancelUrl: null } {
  return { summary: GENERIC_SUMMARY, steps: GENERIC_STEPS, cancelUrl: null };
}

export function getProfile(id: string): ServiceProfile | undefined {
  return PROFILES.find((profile) => profile.id === id);
}

export function cancelOrigins(): string[] {
  const origins = new Set<string>();
  for (const profile of PROFILES) {
    if (!profile.cancelUrl) continue;
    origins.add(new URL(profile.cancelUrl).origin);
  }
  return [...origins];
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function senderHost(from: string): string {
  const email = from.match(/<([^>]+)>/)?.[1] ?? from;
  return (email.split("@")[1] ?? "").trim().toLowerCase();
}

export function senderDisplayName(from: string): string {
  const quoted = from.match(/^"([^"]+)"/);
  if (quoted?.[1]) return quoted[1].trim();
  const bare = from.match(/^([^<]+)</);
  if (bare?.[1]) return bare[1].trim().replace(/^"|"$/g, "");
  return "";
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAlias(text: string, alias: string): boolean {
  return new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(text);
}

function matchingAlias(profile: ServiceProfile, text: string): string | null {
  const sorted = [...profile.aliases].sort((a, b) => b.length - a.length);
  return sorted.find((alias) => hasAlias(text, alias)) ?? null;
}

export function identifyService(
  from: string,
  text: string,
): { service: string; serviceId: string; matchedProfile: boolean } {
  const host = senderHost(from);
  const haystack = `${from}\n${text}`;

  for (const profile of PROFILES) {
    const domainHit = profile.domains.some((domain) => hostMatches(host, domain));
    if (!domainHit) continue;
    const alias = matchingAlias(profile, haystack);
    if (profile.requireAlias && !alias) continue;
    return { service: profile.service, serviceId: profile.id, matchedProfile: true };
  }

  for (const profile of [...PROFILES].sort(
    (a, b) => Math.max(...b.aliases.map((alias) => alias.length)) - Math.max(...a.aliases.map((alias) => alias.length)),
  )) {
    if (matchingAlias(profile, haystack)) {
      return { service: profile.service, serviceId: profile.id, matchedProfile: true };
    }
  }

  const display = senderDisplayName(from);
  const service = display || "Unknown service";
  return {
    service,
    serviceId: slugify(service) || "unknown",
    matchedProfile: false,
  };
}
