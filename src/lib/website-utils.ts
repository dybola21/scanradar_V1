export type WebsiteClassification = {
  type:
    | "own_website"
    | "whatsapp"
    | "instagram"
    | "social_network"
    | "link_in_bio"
    | "marketplace_or_platform"
    | "url_shortener"
    | "no_link"
    | "unknown";
  label: string;
  hasOwnWebsite: boolean | null;
  normalizedUrl: string | null;
  hostname: string | null;
};

export const classifyWebsiteUrl = (url: string | null | undefined): WebsiteClassification => {
  const emptyValues = [null, undefined, "", "-", "—", "N/A", "n/a", "null", "undefined"];
  if (!url || emptyValues.includes(url.trim())) {
    return { type: "no_link", label: "Sem link", hasOwnWebsite: false, normalizedUrl: null, hostname: null };
  }

  let normalized = url.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }

  try {
    const urlObj = new URL(normalized);
    let hostname = urlObj.hostname.toLowerCase();
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }

    const isMatch = (domain: string) => hostname === domain || hostname.endsWith(`.${domain}`);

    if (["wa.me", "whatsapp.com"].some(isMatch)) return { type: "whatsapp", label: "WhatsApp", hasOwnWebsite: false, normalizedUrl: normalized, hostname };
    if (["instagram.com", "instagr.am"].some(isMatch)) return { type: "instagram", label: "Instagram", hasOwnWebsite: false, normalizedUrl: normalized, hostname };
    if (["facebook.com", "fb.com", "fb.me", "tiktok.com", "youtube.com", "youtu.be", "linkedin.com", "twitter.com", "x.com", "telegram.me", "t.me", "pinterest.com", "threads.net"].some(isMatch)) return { type: "social_network", label: "Rede social", hasOwnWebsite: false, normalizedUrl: normalized, hostname };
    if (["linktr.ee", "linktree.com", "beacons.ai", "bio.site", "solo.to", "taplink.cc", "msha.ke", "campsite.bio", "lnk.bio", "hoo.be", "stan.store", "milkshake.app", "allmylinks.com", "meulink.bio", "biolinky.co", "linkme.bio", "linklist.bio"].some(isMatch)) return { type: "link_in_bio", label: "Link de bio", hasOwnWebsite: false, normalizedUrl: normalized, hostname };
    if (["doctoralia.com.br", "doctoralia.com", "getninjas.com.br", "ifood.com.br", "tripadvisor.com.br", "tripadvisor.com", "guiamais.com.br", "telelistas.net", "solutudo.com.br", "apontador.com.br", "reclameaqui.com.br", "mercadolivre.com.br", "shopee.com.br", "elo7.com.br", "hotmart.com", "sympla.com.br", "wixsite.com", "wordpress.com", "blogspot.com", "sites.google.com", "google.com", "maps.google.com", "business.site", "negocio.site"].some(isMatch)) return { type: "marketplace_or_platform", label: "Página em plataforma", hasOwnWebsite: false, normalizedUrl: normalized, hostname };
    if (["bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rebrand.ly", "shorturl.at", "is.gd", "rb.gy", "l1nq.com", "encurtador.com.br"].some(isMatch)) return { type: "url_shortener", label: "Link encurtado", hasOwnWebsite: null, normalizedUrl: normalized, hostname };

    return { type: "own_website", label: "Site próprio", hasOwnWebsite: true, normalizedUrl: normalized, hostname };
  } catch {
    return { type: "unknown", label: "Não identificado", hasOwnWebsite: null, normalizedUrl: null, hostname: null };
  }
};
