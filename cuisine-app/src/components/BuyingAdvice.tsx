import { useState } from 'react';
import { saveSettings } from '../db/db';
import { SHOPS, type BuyGuide, type ShopKind } from '../domain/buying';
import { directionsUrl, findStores, geocode, type Store } from '../domain/stores';

/** Petit rendu du **gras** des textes du guide */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>))}
    </>
  );
}

export function GuideCard({ g, compact }: { g: BuyGuide; compact?: boolean }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="small" style={{ margin: 0 }}>
        {g.why}
      </p>
      <div className="small">
        <strong style={{ color: 'var(--ok)' }}>✅ Le mieux</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {g.best.map((t) => (
            <li key={t}>
              <Rich text={t} />
            </li>
          ))}
        </ul>
      </div>
      <div className="small">
        <strong style={{ color: 'var(--olive)' }}>👍 Bon compromis</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {g.good.map((t) => (
            <li key={t}>
              <Rich text={t} />
            </li>
          ))}
        </ul>
      </div>
      <div className="small">
        <strong style={{ color: 'var(--danger)' }}>🚫 À éviter</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {g.avoid.map((t) => (
            <li key={t}>
              <Rich text={t} />
            </li>
          ))}
        </ul>
      </div>
      {g.read && (
        <div className="small">
          <strong>🔎 Sur l’étiquette</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {g.read.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="small muted">
        Où : {g.shops.map((s) => `${SHOPS[s].emoji} ${SHOPS[s].label.toLowerCase()}`).join(', ')}
      </div>
      {!compact && <div className="small muted">Sources : {g.sources.join(' ; ')}</div>}
    </div>
  );
}


// ── Commerces autour de chez moi (gardés en mémoire sur l'appareil) ──

const STORES_KEY = 'cuisine.stores';
interface StoresCache {
  cp: string;
  radius: number;
  city: string;
  stores: Store[];
  at: string;
}
function loadCache(): StoresCache | null {
  try {
    return JSON.parse(localStorage.getItem(STORES_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function useNearbyStores(initialCp = '', initialRadius = 5) {
  const [cache, setCache] = useState<StoresCache | null>(loadCache);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const search = async (cp: string, radius: number) => {
    setBusy(true);
    setError('');
    try {
      const place = await geocode(cp);
      const stores = await findStores(place, radius);
      const c = { cp: cp.trim(), radius, city: place.city, stores, at: new Date().toISOString() };
      setCache(c);
      try {
        localStorage.setItem(STORES_KEY, JSON.stringify(c));
      } catch {
        /* stockage indisponible */
      }
      saveSettings({ shopCp: cp.trim(), shopRadius: radius });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  /** commerce le plus proche parmi les types conseillés (la liste est triée par distance) */
  const nearest = (kinds: ShopKind[]): Store | undefined => cache?.stores.find((x) => kinds.includes(x.kind));
  return { cache, busy, error, search, nearest, initialCp: cache?.cp ?? initialCp, initialRadius: cache?.radius ?? initialRadius };
}

const ORDER: ShopKind[] = ['ferme', 'boucherie', 'volailler', 'poissonnerie', 'fromagerie', 'marche', 'primeur', 'bio', 'supermarche'];

export function NearbyShops({ shops }: { shops: ReturnType<typeof useNearbyStores> }) {
  const [cp, setCp] = useState(shops.initialCp);
  const [radius, setRadius] = useState(shops.initialRadius);
  const [kind, setKind] = useState<ShopKind | null>(null);
  const counts = new Map<ShopKind, number>();
  for (const s of shops.cache?.stores ?? []) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  const list = (shops.cache?.stores ?? []).filter((s) => s.kind === kind);
  return (
    <details className="card pad" style={{ marginBottom: 12 }} open={!shops.cache}>
      <summary style={{ cursor: 'pointer' }}>
        <strong>📍 Où acheter près de chez moi</strong>{' '}
        <span className="small muted">{shops.cache ? `— ${shops.cache.stores.length} commerces autour de ${shops.cache.city} (${shops.cache.radius} km)` : '— indiquez votre code postal'}</span>
      </summary>
      <div className="stack" style={{ marginTop: 10, gap: 10 }}>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (cp.trim()) shops.search(cp, radius);
          }}
        >
          <input className="input" style={{ maxWidth: 200 }} inputMode="numeric" placeholder="Code postal" value={cp} onChange={(e) => setCp(e.target.value)} />
          {[2, 5, 10, 20].map((r) => (
            <button type="button" key={r} className={`chip ${radius === r ? 'on' : ''}`} onClick={() => setRadius(r)}>
              {r} km
            </button>
          ))}
          <button className="btn primary sm" type="submit" disabled={shops.busy || !cp.trim()}>
            {shops.busy ? 'Recherche…' : '🔎 Chercher'}
          </button>
        </form>
        {shops.error && <div className="callout danger small">{shops.error}</div>}
        {shops.cache && (
          <>
            <div className="chips">
              {ORDER.filter((k) => counts.get(k)).map((k) => (
                <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(kind === k ? null : k)}>
                  {SHOPS[k].emoji} {SHOPS[k].label} ({counts.get(k)})
                </button>
              ))}
            </div>
            {kind && <div className="callout info small" style={{ margin: 0 }}>{SHOPS[kind].why}</div>}
            {list.slice(0, 20).map((s) => (
              <StoreLine key={s.id} s={s} />
            ))}
            <div className="small muted">
              Sous chaque produit de la liste, l’appli indique le commerce adapté le plus proche. Données OpenStreetMap (certains commerces peuvent manquer). Producteurs en direct :{' '}
              <a href="https://www.bienvenue-a-la-ferme.com/" target="_blank" rel="noreferrer">
                Bienvenue à la ferme
              </a>
              ,{' '}
              <a href="https://laruchequiditoui.fr/" target="_blank" rel="noreferrer">
                La Ruche qui dit Oui
              </a>
              ,{' '}
              <a href="https://www.reseau-amap.org/" target="_blank" rel="noreferrer">
                AMAP
              </a>
              .
            </div>
          </>
        )}
      </div>
    </details>
  );
}

export function StoreLine({ s }: { s: Store }) {
  return (
    <div className="small" style={{ lineHeight: 1.4 }}>
      <strong>
        {SHOPS[s.kind].emoji} {s.name}
      </strong>{' '}
      <span className="muted">
        · {String(s.km).replace('.', ',')} km{s.address ? ` · ${s.address}` : ''}
        {s.hours ? ` · 🕒 ${s.hours}` : ''}
      </span>{' '}
      <a href={directionsUrl(s)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        Itinéraire
      </a>
    </div>
  );
}
