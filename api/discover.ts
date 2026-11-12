const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.maprva.org/api/interpreter",
  "https://ethiopia.overpass.openplaceguide.org/api/interpreter"
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
type PhotonFeature = {
  properties?: { extent?: number[]; name?: string; city?: string; state?: string; country?: string };
  geometry?: { coordinates?: number[] };
};

function sendJson(res: VercelResponse, data: unknown, status = 200, headers: Record<string, string> = {}): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.status(status).json(data);
}

async function geocodeCity(city: string): Promise<{ south: number; west: number; north: number; east: number }> {
  // Photon é a primeira opção; Nominatim fica como fallback independente.
  const photonUrl = new URL("https://photon.komoot.io/api/");
  photonUrl.search = new URLSearchParams({ q: `${city}, Brazil`, limit: "1", lang: "pt" }).toString();

  try {
    const response = await fetch(photonUrl, {
      headers: { "Accept": "application/geo+json", "User-Agent": "LeadHunterAI/1.0 (https://github.com/jonzin12a-cloud/leadhunter-ai)" },
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const data = await response.json() as { features?: PhotonFeature[] };
      const feature = data.features?.[0];
      const extent = feature?.properties?.extent;
      if (extent?.length === 4 && extent.every(Number.isFinite)) {
        const [west, south, east, north] = extent;
        if (south < north && west < east) return { south, west, north, east };
      }
      const coordinates = feature?.geometry?.coordinates;
      if (coordinates && coordinates.length >= 2 && coordinates.slice(0, 2).every(Number.isFinite)) {
        const [lon, lat] = coordinates;
        // Fallback local aproximado de 8 km em torno do centro quando Photon não retorna extent.
        const latDelta = 0.072;
        const lonDelta = 0.072 / Math.max(0.2, Math.cos(lat * Math.PI / 180));
        return { south: lat - latDelta, west: lon - lonDelta, north: lat + latDelta, east: lon + lonDelta };
      }
    } else {
      console.warn("[LeadHunter] Photon HTTP:", response.status);
    }
  } catch (error) {
    console.warn("[LeadHunter] Photon indisponível:", error instanceof Error ? error.message : "erro desconhecido");
  }

  const params = new URLSearchParams({ q: `${city}, Brazil`, format: "jsonv2", limit: "1", countrycodes: "br" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "LeadHunterAI/1.0 (https://github.com/jonzin12a-cloud/leadhunter-ai)"
    },
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error(`GEOCODER_HTTP_${response.status}`);
  const places = await response.json() as GeocodeResult[];
  const box = places[0]?.boundingbox;
  if (!box || box.length !== 4) throw new Error("CITY_NOT_FOUND");
  const [south, north, west, east] = box.map(Number);
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
    throw new Error("INVALID_CITY_BOUNDS");
  }
  return { south, west, north, east };
}

async function queryOverpass(query: string): Promise<OsmElement[]> {
  const controller = new AbortController();
  const abortAll = setTimeout(() => controller.abort(), 22000);
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
    const data = await response.json() as { elements?: OsmElement[]; remark?: string };
    if (data.remark) throw new Error(`${new URL(endpoint).hostname}: ${data.remark}`);
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
    const bounds = await geocodeCity(cityInput);
    const query = `[out:json][timeout:18];
(
  nwr["name"]${categoryFilter}(${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out center 60;`;

    const elements = await queryOverpass(query);
    const seen = new Set<string>();
    const normalizedNames = new Map<string, Array<{ id: string; phone: string; lat: number | null; lon: number | null }>>();
    const possibleDuplicateIds = new Set<string>();
    const results = elements.flatMap((element) => {
      const tags = element.tags || {};
      const name = (tags.name || "").trim();
      if (!name) return [];
      const id = "osm-" + element.type + "-" + element.id;
      if (seen.has(id)) return [];
      seen.add(id);

      const getTag = (...keys: string[]) => keys.map((key) => tags[key]?.trim()).find(Boolean) || "";
      const cleanUrl = (raw: string) => {
        if (!raw) return "";
        try {
          const candidate = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
          return candidate.protocol === "https:" || candidate.protocol === "http:" ? candidate.toString() : "";
        } catch { return ""; }
      };
      const website = cleanUrl(getTag("website", "contact:website", "url"));
      const normalizePhone = (value: string) => {
        const linkedNumber = value.match(/(?:wa\.me\/|phone=)(\+?[0-9]+)/i)?.[1];
        return (linkedNumber || value).replace(/[^0-9+]/g, "");
      };
      const phoneRaw = getTag("phone", "contact:phone", "mobile", "contact:mobile");
      const phone = normalizePhone(phoneRaw);
      const whatsapp = normalizePhone(getTag("contact:whatsapp", "whatsapp"));
      const instagramRaw = getTag("contact:instagram", "instagram");
      const facebookRaw = getTag("contact:facebook", "facebook");
      const instagram = instagramRaw ? (/^https?:\/\//i.test(instagramRaw) ? cleanUrl(instagramRaw) : "https://www.instagram.com/" + instagramRaw.replace(/^@/, "").replace(/^.*instagram\.com\//i, "").replace(/\/$/, "") + "/") : "";
      const facebook = facebookRaw ? (/^https?:\/\//i.test(facebookRaw) ? cleanUrl(facebookRaw) : "https://www.facebook.com/" + facebookRaw.replace(/^@/, "").replace(/^.*facebook\.com\//i, "").replace(/\/$/, "")) : "";
      const email = getTag("email", "contact:email");
      const street = getTag("addr:street");
      const houseNumber = getTag("addr:housenumber");
      const suburb = getTag("addr:suburb", "addr:neighbourhood");
      const postcode = getTag("addr:postcode");
      const address = getTag("addr:full") || [street, houseNumber, suburb, postcode].filter(Boolean).join(", ");
      const rawLat = element.lat ?? element.center?.lat;
      const rawLon = element.lon ?? element.center?.lon;
      const lat = typeof rawLat === "number" && Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90 ? rawLat : null;
      const lon = typeof rawLon === "number" && Number.isFinite(rawLon) && rawLon >= -180 && rawLon <= 180 ? rawLon : null;
      const normalizedName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const sameName = normalizedNames.get(normalizedName) || [];
      const possibleDuplicate = sameName.some((item) =>
        (phone && item.phone && phone === item.phone) ||
        (lat !== null && lon !== null && item.lat !== null && item.lon !== null &&
          Math.abs(lat - item.lat) < 0.00025 && Math.abs(lon - item.lon) < 0.00025)
      );
      if (possibleDuplicate) {
        possibleDuplicateIds.add(id);
        sameName.forEach((item) => possibleDuplicateIds.add(item.id));
      }
      sameName.push({ id, phone, lat, lon });
      normalizedNames.set(normalizedName, sameName);

      // Completude objetiva dos dados disponíveis (não é probabilidade de conversão).
      const scoreFactors = {
        phone: phone ? 25 : 0,
        website: website ? 15 : 0,
        address: address ? 15 : 0,
        social: instagram || facebook ? 15 : 0,
        email: email ? 10 : 0,
        coordinates: lat !== null && lon !== null ? 10 : 0,
        openingHours: tags.opening_hours ? 10 : 0
      };
      const score = Object.values(scoreFactors).reduce((sum, value) => sum + value, 0);

      return [{
        id, name, category, city: cityInput, address, phone, whatsapp,
        email, instagram, facebook, lat, lon, openingHours: getTag("opening_hours"),
        websiteStatus: website ? "website_found" : "website_not_identified",
        website, score, scoreFactors, possibleDuplicate,
        duplicateNote: possibleDuplicate ? "Nome e contato/localização semelhantes a outro registro; revise antes de salvar." : "",
        source: "OpenStreetMap",
        sourceUrl: "https://www.openstreetmap.org/" + element.type + "/" + element.id,
        discoveredAt: new Date().toISOString()
      }];
    });
    results.forEach((lead) => {
      if (possibleDuplicateIds.has(lead.id)) {
        lead.possibleDuplicate = true;
        lead.duplicateNote = "Nome e contato/localização semelhantes a outro registro; revise antes de salvar.";
      }
    });

    sendJson(res, {
      results,
      count: results.length,
      source: "OpenStreetMap",
      attribution: "© OpenStreetMap contributors",
      searchedAt: new Date().toISOString()
    }, 200, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Erro externo desconhecido";
    console.error("[LeadHunter] Falha na descoberta:", detail);
    if (detail === "CITY_NOT_FOUND" || detail === "INVALID_CITY_BOUNDS") {
      sendJson(res, { error: "Não conseguimos localizar essa cidade. Informe cidade e estado, por exemplo: Feira de Santana, BA." }, 422);
      return;
    }
    if (detail.startsWith("GEOCODER_HTTP_")) {
      sendJson(res, { error: "O serviço de localização está temporariamente indisponível. Tente novamente em instantes." }, 503, { "Retry-After": "20" });
      return;
    }
    sendJson(res, {
      error: "A cidade foi localizada, mas a fonte de estabelecimentos não respondeu. Tente novamente em instantes."
    }, 503, { "Retry-After": "20" });
  }
}
