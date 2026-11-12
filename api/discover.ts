const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

const allowedCategories: Record<string, string> = {
  "Restaurantes e cafés": '["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court"]',
  "Lojas e comércio": '["shop"]',
  "Saúde e bem-estar": '["amenity"~"clinic|doctors|dentist|pharmacy|hospital"]',
  "Beleza e estética": '["shop"~"beauty|hairdresser|cosmetics"]',
  "Serviços profissionais": '["office"]',
  "Academias e esportes": '["leisure"~"fitness_centre|sports_centre"]',
  "Hospedagem e turismo": '["tourism"~"hotel|guest_house|hostel|motel"]'
};

type VercelRequest = { method?: string; url?: string };
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
type GeocodeResult = { boundingbox?: string[]; display_name?: string };

function sendJson(res: VercelResponse, data: unknown, status = 200, headers: Record<string, string> = {}) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.status(status).json(data);
}

async function geocodeCity(city: string): Promise<{ south: number; west: number; north: number; east: number }> {
  const params = new URLSearchParams({ q: `${city}, Brazil`, format: "jsonv2", limit: "1", countrycodes: "br" });
  const response = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "LeadHunterAI/1.0 (https://github.com/jonzin12a-cloud/leadhunter-ai)"
    },
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error(`Geocodificação respondeu HTTP ${response.status}`);
  const places = await response.json() as GeocodeResult[];
  const box = places[0]?.boundingbox;
  if (!box || box.length !== 4) throw new Error("Cidade não localizada pelo serviço geográfico");
  const [south, north, west, east] = box.map(Number);
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
    throw new Error("Limites geográficos inválidos");
  }
  return { south, west, north, east };
}

async function queryOverpass(query: string): Promise<OsmElement[]> {
  const controller = new AbortController();
  const abortAll = setTimeout(() => controller.abort(), 10500);
  const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json",
        "User-Agent": "LeadHunterAI/1.0 (business discovery)"
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${new URL(endpoint).hostname}: HTTP ${response.status}`);
    const data = await response.json() as { elements?: OsmElement[] };
    if (!Array.isArray(data.elements)) throw new Error(`${new URL(endpoint).hostname}: resposta inválida`);
    return data.elements;
  });

  try {
    // A primeira resposta válida encerra as demais conexões.
    const elements = await Promise.any(attempts);
    controller.abort();
    return elements;
  } catch (error) {
    console.error("[LeadHunter] Falha nas instâncias Overpass:", error);
    throw new Error("Nenhuma instância Overpass respondeu");
  } finally {
    clearTimeout(abortAll);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    sendJson(res, { error: "Método não permitido." }, 405, { Allow: "GET" });
    return;
  }

  const params = new URLSearchParams((req.url || "").split("?", 2)[1] || "");
  const cityInput = (params.get("city") || "").trim();
  const category = params.get("category") || "";
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

  try {
    // Geocodificar primeiro evita a busca cara por nome de área administrativa no Overpass.
    const bounds = await geocodeCity(city);
    const query = `[out:json][timeout:8];
(
  nwr["name"]${categoryFilter}(${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out center 60;`;

    const elements = await queryOverpass(query);
    const seen = new Set<string>();
    const results = elements.flatMap((element) => {
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
        } catch { /* Ignora URLs inválidas da fonte pública. */ }
      }
      const phone = tags.phone || tags["contact:phone"] || "";
      const addressParts = [tags["addr:street"], tags["addr:housenumber"], tags["addr:suburb"]].filter(Boolean);
      const location = addressParts.length ? `, ${addressParts.join(", ")}` : "";
      const score = Math.min(95, 45 + (phone ? 12 : 0) + (addressParts.length ? 8 : 0) + (tags.opening_hours ? 8 : 0) + (!website ? 10 : 0));

      return [{
        id,
        name,
        category,
        city: city + location,
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Erro externo desconhecido";
    console.error("[LeadHunter] Falha na descoberta:", detail);
    if (detail.includes("Geocodificação") || detail.includes("Cidade não localizada") || detail.includes("Limites geográficos")) {
      sendJson(res, { error: "Não conseguimos localizar essa cidade. Confira o nome e tente novamente." }, 422);
      return;
    }
    sendJson(res, {
      error: "A fonte pública de empresas está temporariamente indisponível. Tente novamente em instantes."
    }, 503, { "Retry-After": "20" });
  }
}
