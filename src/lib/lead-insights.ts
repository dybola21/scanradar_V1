import { classifyWebsiteUrl, type WebsiteClassification } from "./website-utils";

export type PresenceType = WebsiteClassification["type"];

/** Ordem comercial: quanto menor o índice, maior a prioridade de prospecção. */
export const PRESENCE_PRIORITY: Record<PresenceType, number> = {
  no_link: 1,
  whatsapp: 2,
  instagram: 3,
  link_in_bio: 4,
  social_network: 5,
  marketplace_or_platform: 6,
  url_shortener: 7,
  unknown: 8,
  own_website: 9,
};

export const PRESENCE_ORDER: PresenceType[] = [
  "no_link",
  "whatsapp",
  "instagram",
  "link_in_bio",
  "social_network",
  "marketplace_or_platform",
  "url_shortener",
  "unknown",
  "own_website",
];

export const PRESENCE_LABEL: Record<PresenceType, string> = {
  no_link: "Sem link",
  whatsapp: "Só WhatsApp",
  instagram: "Só Instagram",
  link_in_bio: "Link de bio",
  social_network: "Rede social",
  marketplace_or_platform: "Página em plataforma",
  url_shortener: "Link encurtado",
  unknown: "Não identificado",
  own_website: "Site próprio",
};

/** Classes de token para badges de presença digital (sem cores hardcoded). */
export const PRESENCE_TONE: Record<PresenceType, string> = {
  no_link: "bg-warning-soft text-warning",
  whatsapp: "bg-success-soft text-success",
  instagram: "bg-info-soft text-info",
  link_in_bio: "bg-info-soft text-info",
  social_network: "bg-info-soft text-info",
  marketplace_or_platform: "bg-muted text-muted-foreground",
  url_shortener: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
  own_website: "bg-secondary text-secondary-foreground",
};

export function opportunityScore(type: PresenceType): number {
  return PRESENCE_PRIORITY[type] ?? 10;
}

export type PresenceDistributionItem = {
  type: PresenceType;
  label: string;
  count: number;
  share: number;
};

export function buildPresenceDistribution(
  websites: Array<string | null | undefined>,
): PresenceDistributionItem[] {
  const counts = new Map<PresenceType, number>();
  for (const site of websites) {
    const { type } = classifyWebsiteUrl(site);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const total = websites.length || 1;
  return PRESENCE_ORDER.filter((type) => (counts.get(type) ?? 0) > 0).map((type) => {
    const count = counts.get(type) ?? 0;
    return {
      type,
      label: PRESENCE_LABEL[type],
      count,
      share: Math.round((count / total) * 100),
    };
  });
}

export const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "all", label: "Todo o período" },
] as const;

export type PeriodValue = (typeof PERIOD_OPTIONS)[number]["value"];
