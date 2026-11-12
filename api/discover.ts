const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const allowedCategories: Record<string, string> = {
  "Restaurantes e cafés": '["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court"]',
  "Lojas e comércio": '["shop"]',
  "Saúde e bem-estar": '["amenity"~"clinic|doctors|dentist|pharmacy|hospital"]',
  "Beleza e estética": '["shop"~"beauty|hairdresser|cosmetics"]',
  "Serviços profissionais": '["office"]',
  "Academias e esportes": '["leisure"~"fitness_centre|sports_centre"]',
  "Hospedagem e turismo": '["tourism"~"hotel|guest_house|hostel|motel"]'
};

type VercelRequest = {
  method?: string;
  url?: string;
  headers: { host?: string };
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): VercelResponse;
  json(data: unknown): VercelResponse;
};

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function sendJson(res: VercelResponse, data: unknown, status = 200, headers: Record<string, string> = {}) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  return res.status(status).json(data);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    sendJson(res, { error: "Método não permitido." }, 405, { Allow: "GET" });
    return;
  }

  let url: URL;
  try {
    url = new URL(req.url || "/", "https://leadhunter.internal");
  } catch {
    sendJson(res, { error: "Endereço de pesquisa inválido." }, 400);
    return;
  }

  const cityInput = (url.searchParams.get("city") || "").trim();
  const category = url.searchParams.get("category") || "";
  if (cityInput.length < 2 || cityInput.length > 100) {
    sendJson(res, { error: "Informe uma cidade válida (2 a 100 caracteres)." }, 400);
    return;
  }

  const categoryFilter = allowedCategories[category];
  if (!categoryFilter) {
    sendJson(res, { error: "Segmento não suportado." }, 400);
    return;
  }

  const city = cityInput.split(",")[0].trim().replace(/[^\p{L}\p{N}\s'.-]/gu, "").replace(/\s+/g, " ");
  if (city.length < 2) {
    sendJson(res, { error: "Informe o nome da cidade sem caracteres especiais inválidos." }, 400);
    return;
  }

  const query = `[out:json][timeout:7];
area["name"="${city}"]["boundary"="administrative"]->.searchArea;
(
  nwr["name"]${categoryFilter}(area.searchArea);
);
out center 100;`;

  try {
    const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "LeadHunterAI/0.1 (public business discovery)"
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(12000)
      });

      if (!upstream.ok) {
        throw new Error(`Overpass ${new URL(endpoint).hostname} respondeu HTTP ${upstream.status}`);
      }

      const data = await upstream.json() as { elements?: OsmElement[] };
      if (!Array.isArray(data.elements)) {
        throw new Error(`Resposta inválida de ${new URL(endpoint).hostname}`);
      }

      console.info("[LeadHunter] Fonte respondeu:", new URL(endpoint).hostname, data.elements.length);
      return data;
    });

    let payload: { elements?: OsmElement[] };
    try {
      // Dispara as fontes em paralelo para evitar 3 esperas sequenciais.
      payload = await Promise.any(attempts);
    } catch (error) {
      console.error("[LeadHunter] Todas as fontes Overpass falharam:", error);
      sendJson(res, {
        error: "As fontes públicas de mapas não responderam. Tente novamente em instantes."
      }, 503, { "Retry-After": "15" });
      return;
    }

    const seen = new Set<string>();
    const results = (payload.elements || []).flatMap((element) => {
      const tags = element.tags || {};
      const name = (tags.name || "").trim();
      if (!name) return [];
      const id = `osm-${element.type}-${element.id}`;
      if (seen.has(id)) return [];
      seen.add(id);

      const rawWebsite = (tags.website || tags["contact:website"] || "").trim();
      let website = "";
      if (rawWebsite) {
        try {
          const candidate = new URL(/^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`);
          if (candidate.protocol === "https:" || candidate.protocol === "http:") website = candidate.toString();
        } catch { /* Ignore malformed website tags from the public source. */ }
      }

      const phone = tags.phone || tags["contact:phone"] || "";
      const addressParts = [tags["addr:street"], tags["addr:housenumber"], tags["addr:suburb"]].filter(Boolean);
      const location = addressParts.length ? `, ${addressParts.join(", ")}` : "";
      const score = Math.min(95, 45 + (phone ? 12 : 0) + (addressParts.length ? 8 : 0) + (tags.opening_hours ? 8 : 0) + (website ? 0 : 10));

      return [{
        id,
        name,
        category,
        city: cityInput.split(",")[0].trim() + location,
        phone: phone.replace(/[^0-9+]/g, ""),
        websiteStatus: website ? "website_found" : "website_not_identified",
        website,
        score,
        source: "OpenStreetMap",
        sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        discoveredAt: new Date().toISOString()
      }];
    });

    sendJson(res, {
      results,
      count: results.length,
      source: "OpenStreetMap",
      attribution: "© OpenStreetMap contributors",
      searchedAt: new Date().toISOString()
    });
  } catch {
    sendJson(res, { error: "Não foi possível concluir a pesquisa. Tente novamente em instantes." }, 502);
  }
}
