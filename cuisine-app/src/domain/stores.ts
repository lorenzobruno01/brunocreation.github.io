// ─────────────────────────────────────────────────────────────
// Commerces autour d'un code postal, gratuitement et sans clé :
// - géocodage : Géoplateforme IGN (Base Adresse Nationale), puis
//   Nominatim (OpenStreetMap) en secours ;
// - commerces : OpenStreetMap via l'API Overpass.
// ─────────────────────────────────────────────────────────────
import { SHOPS, type ShopKind } from './buying';

export interface Place {
  lat: number;
  lon: number;
  city: string;
}

export interface Store {
  id: string;
  kind: ShopKind;
  name: string;
  lat: number;
  lon: number;
  /** distance en km depuis le centre de la commune */
  km: number;
  address?: string;
  hours?: string;
  website?: string;
  phone?: string;
  organic?: boolean;
}

async function getJson(url: string, init?: RequestInit, timeoutMs = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Code postal (ou nom de commune) → coordonnées */
export async function geocode(q: string): Promise<Place> {
  const query = encodeURIComponent(q.trim());
  const isCp = /^\d{5}$/.test(q.trim());
  type Ban = { features?: Array<{ geometry: { coordinates: [number, number] }; properties: { city?: string; name?: string } }> };
  for (const base of ['https://data.geopf.fr/geocodage/search', 'https://api-adresse.data.gouv.fr/search/']) {
    try {
      const data = (await getJson(`${base}?q=${query}&type=municipality&limit=1${isCp ? `&postcode=${query}` : ''}`)) as Ban;
      const f = data.features?.[0];
      if (f) return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], city: f.properties.city ?? f.properties.name ?? q };
    } catch {
      /* service suivant */
    }
  }
  const nomi = (await getJson(`https://nominatim.openstreetmap.org/search?${isCp ? `postalcode=${query}` : `q=${query}`}&country=fr&format=json&limit=1`)) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!nomi[0]) throw new Error('Code postal introuvable');
  return { lat: Number(nomi[0].lat), lon: Number(nomi[0].lon), city: nomi[0].display_name.split(',')[0] };
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ORGANIC_BRANDS = /biocoop|naturalia|la vie claire|bio c'? ?bon|l'?eau vive|satoriz|marcel ?& ?fils|les comptoirs de la bio|biomonde|botanic/i;

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function classify(tags: Record<string, string>): ShopKind | null {
  const shop = tags.shop;
  if (tags.amenity === 'marketplace') return 'marche';
  if (!shop) return null;
  const organic = tags.organic === 'only' || ORGANIC_BRANDS.test(`${tags.brand ?? ''} ${tags.name ?? ''}`);
  for (const [kind, def] of Object.entries(SHOPS) as Array<[ShopKind, (typeof SHOPS)[ShopKind]]>) {
    if (def.osm.includes(`shop=${shop}`)) return kind === 'supermarche' && organic ? 'bio' : kind;
  }
  return null;
}

export function overpassQuery(p: Place, radiusKm: number): string {
  const r = Math.round(radiusKm * 1000);
  const shops = [...new Set(Object.values(SHOPS).flatMap((s) => s.osm.filter((t) => t.startsWith('shop=')).map((t) => t.slice(5))))].join('|');
  return `[out:json][timeout:25];(nwr["shop"~"^(${shops})$"](around:${r},${p.lat},${p.lon});nwr["amenity"="marketplace"](around:${r},${p.lat},${p.lon}););out center tags 400;`;
}

export function parseStores(elements: OsmElement[], p: Place): Store[] {
  const out: Store[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    const kind = classify(tags);
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!kind || lat == null || lon == null) continue;
    const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    out.push({
      id: `${e.type}/${e.id}`,
      kind,
      name: tags.name ?? tags.brand ?? SHOPS[kind].one,
      lat,
      lon,
      km: Math.round(distanceKm(p, { lat, lon }) * 10) / 10,
      address: [street, tags['addr:city']].filter(Boolean).join(', ') || undefined,
      hours: tags.opening_hours,
      website: tags.website ?? tags['contact:website'],
      phone: tags.phone ?? tags['contact:phone'],
      organic: tags.organic === 'only' || tags.organic === 'yes',
    });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** Commerces alimentaires autour d'un lieu */
export async function findStores(p: Place, radiusKm: number): Promise<Store[]> {
  const body = 'data=' + encodeURIComponent(overpassQuery(p, radiusKm));
  let last: unknown;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const data = (await getJson(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 30000)) as { elements: OsmElement[] };
      return parseStores(data.elements ?? [], p);
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`Recherche des commerces indisponible pour le moment (${(last as Error)?.message ?? 'réseau'})`);
}

export function directionsUrl(s: Pick<Store, 'lat' | 'lon' | 'name'>): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
}
