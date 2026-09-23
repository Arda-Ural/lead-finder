/**
 * Keyless business discovery layer for the Lead Finder API.
 *
 * Replaces the paid Google Places API with public, key-free data sources:
 *  - OpenStreetMap Nominatim -> resolves "city" text into a lat/lon + bbox
 *  - Postpass (postpass.geofabrik.de) -> PRIMARY: SQL-over-OSM, free, no key
 *  - Overpass API (overpass-api.de / kumi.systems) -> FALLBACK only
 *
 * Why Postpass is primary and Overpass is just a fallback:
 * Since Jan 2026 the main public Overpass instances have been actively
 * blocking large chunks of AWS/Azure IP ranges due to abuse (see
 * https://community.openstreetmap.org/t/overpass-api-will-block-azure-and-aws-for-some-time/136817
 * and https://wiki.openstreetmap.org/wiki/Overpass_API/status). Vercel's
 * serverless functions run on AWS, so Overpass calls from this app fail
 * reliably. Postpass (run by Geofabrik) is a separate, unrelated service
 * and is not part of that block, so it's used first.
 *
 * This module ONLY produces data. It intentionally returns objects shaped
 * to match what /api/leads/search already sent to the frontend
 * (name, address, phone, website, mapsUrl, hasWebsite, score), plus a few
 * extra optional fields the current UI simply ignores. Nothing here touches
 * routing, the WhatsApp flow, or the message composer.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredLead {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  hasWebsite: boolean;
  score: number;
  // Extra enrichment (safe to ignore on the frontend; not part of the
  // original contract, but useful for anyone extending the UI later).
  instagram: string | null;
  hasInstagram: boolean;
  hasWhatsapp: boolean;
  hasBookingSystem: boolean;
  websiteHttps: boolean | null;
  websiteMobileFriendly: boolean | null;
}

interface RawBusiness {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  address: string;
  district: string | null;
  city: string;
  lat?: number;
  lon?: number;
}

interface WebsiteAudit {
  https: boolean;
  reachable: boolean;
  mobileFriendly: boolean;
  hasBookingHint: boolean;
}

export class DiscoveryError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "DiscoveryError";
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Phone normalization -> always "+90XXXXXXXXXX" (or null if unusable)
// This is the format the existing WhatsApp button code already handles
// correctly (it only rewrites numbers starting with "0" or "5").
// ---------------------------------------------------------------------------

export function normalizePhoneTR(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const first = raw.split(/[;,/]/)[0].trim();
  let digits = first.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("90") && digits.length === 12) {
    // already "90XXXXXXXXXX"
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = "90" + digits.slice(1);
  } else if (digits.length === 10 && /^[5-9]/.test(digits)) {
    digits = "90" + digits;
  }

  if (!/^90\d{10}$/.test(digits)) return null;
  return "+" + digits;
}

// ---------------------------------------------------------------------------
// Category -> OSM tag mapping (best-effort; falls back to a free-text
// name search when a category isn't in the dictionary, so any Turkish
// sector term still works, just with lower precision).
// ---------------------------------------------------------------------------

const CATEGORY_TAGS: Record<string, [string, string][]> = {
  "erkek kuaförü": [["shop", "hairdresser"], ["shop", "barber"]],
  "kuaför": [["shop", "hairdresser"]],
  "berber": [["shop", "barber"]],
  "güzellik salonu": [["shop", "beauty"]],
  "güzellik merkezi": [["shop", "beauty"]],
  "nail": [["shop", "beauty"]],
  "tırnak": [["shop", "beauty"]],
  "spa": [["leisure", "spa"]],
  "masaj": [["shop", "massage"]],
  "cafe": [["amenity", "cafe"]],
  "kafe": [["amenity", "cafe"]],
  "restoran": [["amenity", "restaurant"]],
  "lokanta": [["amenity", "restaurant"]],
  "pastane": [["shop", "pastry"], ["shop", "bakery"]],
  "fırın": [["shop", "bakery"]],
  "eczane": [["amenity", "pharmacy"]],
  "diş": [["amenity", "dentist"]],
  "avukat": [["office", "lawyer"]],
  "emlak": [["office", "estate_agent"]],
  "oto tamir": [["shop", "car_repair"]],
  "oto servis": [["shop", "car_repair"]],
  "terzi": [["craft", "tailor"]],
  "çiçek": [["shop", "florist"]],
  "market": [["shop", "supermarket"], ["shop", "convenience"]],
  "pet shop": [["shop", "pet"]],
  "spor salonu": [["leisure", "fitness_centre"]],
  "gym": [["leisure", "fitness_centre"]],
  "otel": [["tourism", "hotel"]],
  "muhasebe": [["office", "accountant"]],
  "mali müşavir": [["office", "accountant"]],
  "veteriner": [["amenity", "veterinary"]],
  "kuru temizleme": [["shop", "dry_cleaning"]],
};

function resolveTags(category: string): [string, string][] {
  const key = category.trim().toLocaleLowerCase("tr");
  const matches: [string, string][] = [];
  for (const [needle, tags] of Object.entries(CATEGORY_TAGS)) {
    if (key.includes(needle)) matches.push(...tags);
  }
  return Array.from(new Map(matches.map((t) => [t.join("="), t])).values());
}

function sanitizeSearchTerm(term: string): string {
  return term.trim().slice(0, 60);
}

// ---------------------------------------------------------------------------
// Step 1: geocode the free-text city/region into a lat/lon + bounding box
// ---------------------------------------------------------------------------

interface GeocodedPlace {
  type: "relation" | "way" | "node";
  id: number;
  lat: number;
  lon: number;
  bbox: { south: number; north: number; west: number; east: number };
}

async function geocodeCity(city: string): Promise<GeocodedPlace | null> {
  const params = new URLSearchParams({
    q: city,
    countrycodes: "tr",
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
  });

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      // Nominatim's usage policy requires a descriptive User-Agent.
      "User-Agent": "lead-finder-app (public business discovery, no API key)",
      "Accept-Language": "tr",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = (await res.json()) as Array<{
    osm_type: string;
    osm_id: number;
    lat: string;
    lon: string;
    boundingbox?: [string, string, string, string];
  }>;

  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  if (first.osm_type !== "relation" && first.osm_type !== "way" && first.osm_type !== "node") {
    return null;
  }

  const lat = Number(first.lat);
  const lon = Number(first.lon);

  let bbox: GeocodedPlace["bbox"];
  if (first.boundingbox) {
    const [south, north, west, east] = first.boundingbox.map(Number);
    bbox = { south, north, west, east };
  } else {
    // Fallback: ~15km box around the point if Nominatim didn't send one.
    bbox = { south: lat - 0.15, north: lat + 0.15, west: lon - 0.15, east: lon + 0.15 };
  }

  return { type: first.osm_type, id: Number(first.osm_id), lat, lon, bbox };
}

// ---------------------------------------------------------------------------
// Step 2a (PRIMARY): query Postpass — SQL over a PostGIS mirror of OSM data,
// run by Geofabrik. Free, keyless, and not affected by Overpass's AWS block.
// Docs: https://wiki.openstreetmap.org/wiki/Postpass
// ---------------------------------------------------------------------------

const POSTPASS_ENDPOINT = "https://postpass.geofabrik.de/api/interpreter";

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function buildPostpassQuery(
  bbox: GeocodedPlace["bbox"],
  tagPairs: [string, string][],
  nameTerm: string
): string {
  const tagConditions = tagPairs.map(([k, v]) => `tags->>'${escapeSql(k)}' = '${escapeSql(v)}'`);
  const nameCondition = `tags->>'name' ILIKE '%${escapeSql(nameTerm)}%'`;
  const whereClause = [...tagConditions, nameCondition].join("\n     OR ");
  const envelope = `ST_SetSRID(ST_MakeBox2D(ST_MakePoint(${bbox.west},${bbox.south}), ST_MakePoint(${bbox.east},${bbox.north})), 4326)`;

  return `
    SELECT osm_id, osm_type, tags, geom
    FROM postpass_pointpolygon
    WHERE (
      ${whereClause}
    )
    AND geom && ${envelope}
    LIMIT 200
  `;
}

interface GeoJSONFeature {
  type: "Feature";
  properties: { osm_id: number; osm_type: string; tags?: Record<string, string> };
  geometry: { type: string; coordinates: unknown } | null;
}

async function runPostpassQuery(sql: string): Promise<GeoJSONFeature[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const res = await fetch(POSTPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(sql),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const bodySnippet = await res.text().catch(() => "");
      throw new Error(`Postpass HTTP ${res.status}: ${bodySnippet.slice(0, 300)}`);
    }

    const data = (await res.json()) as { type?: string; features?: GeoJSONFeature[] };
    if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
      return data.features;
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function centroidOfGeometry(geometry: GeoJSONFeature["geometry"]): { lat?: number; lon?: number } {
  if (!geometry) return {};

  const averageRing = (coords: number[][]): { lat?: number; lon?: number } => {
    if (!coords.length) return {};
    let sumLon = 0;
    let sumLat = 0;
    for (const [lon, lat] of coords) {
      sumLon += lon;
      sumLat += lat;
    }
    return { lon: sumLon / coords.length, lat: sumLat / coords.length };
  };

  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates as [number, number];
    return { lat, lon };
  }
  if (geometry.type === "Polygon") {
    const ring = (geometry.coordinates as number[][][])[0] || [];
    return averageRing(ring);
  }
  if (geometry.type === "MultiPolygon") {
    const ring = (geometry.coordinates as number[][][][])[0]?.[0] || [];
    return averageRing(ring);
  }
  if (geometry.type === "LineString") {
    return averageRing(geometry.coordinates as number[][]);
  }
  return {};
}

function parsePostpassFeature(feature: GeoJSONFeature, cityFallback: string): RawBusiness | null {
  const tags = feature.properties.tags || {};
  const name = tags.name?.trim();
  if (!name) return null;

  const { lat, lon } = centroidOfGeometry(feature.geometry);

  return buildRawBusiness(
    `osm-${feature.properties.osm_type}-${feature.properties.osm_id}`,
    tags,
    lat,
    lon,
    cityFallback
  );
}

// ---------------------------------------------------------------------------
// Step 2b (FALLBACK): Overpass mirrors, tried only if Postpass itself fails
// (e.g. Geofabrik maintenance). Kept for redundancy, not relied upon.
// ---------------------------------------------------------------------------

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function buildOverpassQuery(
  geocoded: GeocodedPlace,
  tagPairs: [string, string][],
  nameTerm: string
): string {
  const tagLines = tagPairs.map(([k, v]) => `  nwr["${k}"="${v}"](area.searchArea);`).join("\n");

  if (geocoded.type === "relation" || geocoded.type === "way") {
    const areaId = geocoded.type === "relation" ? 3600000000 + geocoded.id : 2400000000 + geocoded.id;
    return `
[out:json][timeout:20];
area(${areaId})->.searchArea;
(
${tagLines ? tagLines + "\n" : ""}  nwr["name"~"${nameTerm}",i](area.searchArea);
);
out center tags 60;
`;
  }

  const radius = 15000;
  const aroundLines = tagPairs
    .map(([k, v]) => `  nwr["${k}"="${v}"](around:${radius},${geocoded.lat},${geocoded.lon});`)
    .join("\n");
  return `
[out:json][timeout:20];
(
${aroundLines ? aroundLines + "\n" : ""}  nwr["name"~"${nameTerm}",i](around:${radius},${geocoded.lat},${geocoded.lon});
);
out center tags 60;
`;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function runOverpassQuery(query: string): Promise<OverpassElement[]> {
  let lastError: unknown;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeout);

      if (!res.ok) {
        lastError = new Error(`Overpass ${endpoint} -> HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as { elements?: OverpassElement[] };
      return Array.isArray(data.elements) ? data.elements : [];
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Overpass fallback failed");
}

function parseOverpassElement(el: OverpassElement, cityFallback: string): RawBusiness | null {
  const tags = el.tags || {};
  const name = tags.name?.trim();
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  return buildRawBusiness(`osm-${el.type}-${el.id}`, tags, lat, lon, cityFallback);
}

// ---------------------------------------------------------------------------
// Shared tag -> RawBusiness mapping (used by both Postpass and Overpass paths)
// ---------------------------------------------------------------------------

function buildRawBusiness(
  id: string,
  tags: Record<string, string>,
  lat: number | undefined,
  lon: number | undefined,
  cityFallback: string
): RawBusiness {
  const phoneRaw = tags.phone || tags["contact:phone"] || tags["contact:mobile"] || null;
  const whatsappRaw = tags["contact:whatsapp"] || phoneRaw;
  const websiteRaw = tags.website || tags["contact:website"] || null;
  const instagramRaw = tags["contact:instagram"] || null;

  const district = tags["addr:district"] || tags["addr:suburb"] || null;
  const city = tags["addr:city"] || tags["addr:province"] || cityFallback;

  const streetLine = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const address =
    streetLine ||
    tags["addr:full"] ||
    [district, city].filter(Boolean).join(" / ") ||
    "Adres bulunamadı";

  let website: string | null = null;
  if (websiteRaw) {
    website = /^https?:\/\//i.test(websiteRaw) ? websiteRaw : `https://${websiteRaw}`;
  }

  return {
    id,
    name: tags.name!.trim(),
    phone: normalizePhoneTR(phoneRaw),
    whatsapp: normalizePhoneTR(whatsappRaw),
    website,
    instagram: instagramRaw,
    address,
    district,
    city,
    lat,
    lon,
  };
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

function normalizeNameKey(name: string): string {
  return name.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

function roundCoord(v: number | undefined): number {
  if (!v) return 0;
  return Math.round(v * 500) / 500; // ~0.2 km buckets, enough to catch dup OSM ways/nodes for the same shop
}

function dedupeBusinesses(list: RawBusiness[]): RawBusiness[] {
  const seen = new Map<string, RawBusiness>();
  for (const b of list) {
    const key = b.phone
      ? `phone:${b.phone}`
      : `name:${normalizeNameKey(b.name)}:${roundCoord(b.lat)}:${roundCoord(b.lon)}`;
    if (!seen.has(key)) seen.set(key, b);
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Step 3: best-effort website audit (HTTPS / mobile-friendly / booking hint)
// Capped to a handful of sites per search so a single request can't stall
// the whole search.
// ---------------------------------------------------------------------------

const BOOKING_KEYWORDS = [
  "randevu al",
  "online randevu",
  "randevu sistemi",
  "book now",
  "book an appointment",
  "appointment",
  "calendly",
  "appointlet",
];

async function auditWebsite(url: string): Promise<WebsiteAudit> {
  const https = /^https:\/\//i.test(url);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; lead-finder-app/1.0)" },
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { https, reachable: false, mobileFriendly: false, hasBookingHint: false };
    }

    const html = (await res.text()).slice(0, 25000).toLowerCase();
    const mobileFriendly = html.includes('name="viewport"') || html.includes("name='viewport'");
    const hasBookingHint = BOOKING_KEYWORDS.some((k) => html.includes(k));

    return { https, reachable: true, mobileFriendly, hasBookingHint };
  } catch {
    return { https, reachable: false, mobileFriendly: false, hasBookingHint: false };
  }
}

// ---------------------------------------------------------------------------
// Step 4: scoring — higher score = higher outreach potential for a web
// developer, mirroring the intent of the old (website ? 50 : 90) logic but
// now taking the extra signals we actually collected into account.
// ---------------------------------------------------------------------------

function computeScore(b: RawBusiness, audit: WebsiteAudit | undefined): number {
  let score = 35;

  if (!b.website) {
    score += 40;
  } else {
    score += 10;
    if (audit) {
      if (!audit.reachable) score += 5;
      if (!audit.https) score += 8;
      if (!audit.mobileFriendly) score += 7;
      if (!audit.hasBookingHint) score += 6;
    }
  }

  if (!b.instagram) score += 8;
  if (!b.phone) score -= 15;

  return Math.max(5, Math.min(98, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const MAX_RESULTS = 40;
const AUDIT_LIMIT = 8;

export async function discoverBusinesses(city: string, category: string): Promise<DiscoveredLead[]> {
  const geocoded = await geocodeCity(city);
  if (!geocoded) {
    throw new DiscoveryError(`"${city}" için bir konum bulunamadı. Şehir/ilçe adını kontrol edip tekrar dene.`);
  }

  const tagPairs = resolveTags(category);
  const nameTerm = sanitizeSearchTerm(category);

  let parsed: RawBusiness[] = [];
  let postpassError: unknown = null;

  try {
    const sql = buildPostpassQuery(geocoded.bbox, tagPairs, nameTerm);
    const features = await runPostpassQuery(sql);
    parsed = features
      .map((f) => parsePostpassFeature(f, city))
      .filter((b): b is RawBusiness => b !== null);
  } catch (err) {
    postpassError = err;
    console.error("Postpass discovery failed:", err);
  }

  // Only fall back to Overpass if Postpass genuinely returned nothing usable.
  if (postpassError || parsed.length === 0) {
    try {
      const query = buildOverpassQuery(geocoded, tagPairs, nameTerm);
      const elements = await runOverpassQuery(query);
      const fromOverpass = elements
        .map((el) => parseOverpassElement(el, city))
        .filter((b): b is RawBusiness => b !== null);
      if (fromOverpass.length > 0) parsed = fromOverpass;
    } catch (overpassError) {
      console.error("Overpass fallback also failed:", overpassError);
      if (parsed.length === 0) {
        throw new DiscoveryError(
          "Hem Postpass hem de Overpass (yedek) üzerinden işletme verisine ulaşılamadı. Birkaç dakika sonra tekrar dene.",
          { postpassError, overpassError }
        );
      }
    }
  }

  const deduped = dedupeBusinesses(parsed).slice(0, MAX_RESULTS);

  // Only audit the first N businesses that have a website, so latency stays bounded.
  const auditIndexes = new Set(
    deduped
      .map((b, i) => (b.website ? i : -1))
      .filter((i) => i !== -1)
      .slice(0, AUDIT_LIMIT)
  );

  const audits = await Promise.all(
    deduped.map((b, i) => (auditIndexes.has(i) && b.website ? auditWebsite(b.website) : Promise.resolve(undefined)))
  );

  const leads: DiscoveredLead[] = deduped.map((b, i) => {
    const audit = audits[i];
    return {
      id: b.id,
      name: b.name,
      address: b.district && !b.address.includes(b.district) ? `${b.address} (${b.district})` : b.address,
      phone: b.whatsapp || b.phone,
      website: b.website,
      mapsUrl: b.lat && b.lon ? `https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lon}` : null,
      hasWebsite: Boolean(b.website),
      score: computeScore(b, audit),
      instagram: b.instagram,
      hasInstagram: Boolean(b.instagram),
      hasWhatsapp: Boolean(b.whatsapp),
      hasBookingSystem: Boolean(audit?.hasBookingHint),
      websiteHttps: audit ? audit.https : null,
      websiteMobileFriendly: audit ? audit.mobileFriendly : null,
    };
  });

  return leads.sort((a, b) => b.score - a.score);
}
