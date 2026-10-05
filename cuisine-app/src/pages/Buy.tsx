import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSettings } from '../db/db';
import { useLibrary, useUserData } from '../hooks/library';
import { GUIDES, guideFor, nutrientGains, SHOPS, UPGRADES, type BuyGuide, type ShopKind } from '../domain/buying';
import { directionsUrl, findStores, geocode, type Place, type Store } from '../domain/stores';
import { useToast } from '../components/ui';

const ORDER: ShopKind[] = ['ferme', 'boucherie', 'volailler', 'poissonnerie', 'fromagerie', 'marche', 'primeur', 'bio', 'supermarche'];

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

export function Buy() {
  const { settings } = useUserData();
  const { lookup } = useLibrary();
  const toast = useToast();
  const [cp, setCp] = useState(settings.shopCp ?? '');
  const [radius, setRadius] = useState(settings.shopRadius ?? 5);
  const [place, setPlace] = useState<Place | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<ShopKind | 'tout'>('tout');
  const items = useLiveQuery(() => db.shopping.toArray(), []) ?? [];

  const search = async () => {
    if (!cp.trim()) return;
    setBusy(true);
    setError('');
    try {
      const p = await geocode(cp);
      setPlace(p);
      const list = await findStores(p, radius);
      setStores(list);
      saveSettings({ shopCp: cp.trim(), shopRadius: radius });
      if (!list.length) toast('Aucun commerce trouvé : élargissez le rayon');
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  // Ma liste de courses → conseils par famille d'aliments
  const forList = useMemo(() => {
    const groups = new Map<string, { guide: BuyGuide; names: string[] }>();
    const upgrades: Array<{ from: string; to: string; tip: string; gains: Array<{ label: string; ratio: number }> }> = [];
    for (const it of items) {
      const ing = it.ingredientId ? lookup(it.ingredientId) : undefined;
      if (!ing) continue;
      const g = guideFor(ing);
      if (g) {
        const e = groups.get(g.id) ?? { guide: g, names: [] };
        e.names.push(ing.name);
        groups.set(g.id, e);
      }
      const up = UPGRADES[ing.id];
      if (up) upgrades.push({ from: ing.name, to: lookup(up.to)?.name ?? up.to, tip: up.tip, gains: nutrientGains(ing.id, up.to) });
    }
    const order = GUIDES.map((g) => g.id);
    return { groups: [...groups.values()].sort((a, b) => order.indexOf(a.guide.id) - order.indexOf(b.guide.id)), upgrades };
  }, [items, lookup]);

  const neededKinds = new Set(forList.groups.flatMap((g) => g.guide.shops));
  const shown = (stores ?? []).filter((s) => kind === 'tout' || s.kind === kind);
  const counts = new Map<ShopKind, number>();
  for (const s of stores ?? []) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);

  return (
    <div className="page narrow stack" style={{ gap: 18 }}>
      <h1 style={{ margin: 0 }}>🧭 Assistant courses</h1>
      <p className="muted" style={{ margin: 0 }}>
        Où acheter près de chez vous, et comment choisir chaque aliment : élevage, labels, morceaux les plus nutritifs. Entre un steak haché de vache laitière nourrie au maïs et un bœuf élevé à l’herbe, la différence se voit dans l’assiette et dans les nutriments.
      </p>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>📍 Les commerces autour de moi</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input className="input" style={{ maxWidth: 220 }} inputMode="numeric" placeholder="Code postal (ex. 69003)" value={cp} onChange={(e) => setCp(e.target.value)} />
          <button className="btn primary" type="submit" disabled={busy || !cp.trim()}>
            {busy ? 'Recherche…' : '🔎 Chercher'}
          </button>
        </form>
        <div className="chips">
          {[2, 5, 10, 20].map((r) => (
            <button key={r} className={`chip ${radius === r ? 'on' : ''}`} onClick={() => setRadius(r)}>
              {r} km
            </button>
          ))}
        </div>
        {error && <div className="callout danger small">{error}</div>}
        {place && stores && (
          <>
            <div className="small muted">
              {stores.length} commerces alimentaires à moins de {radius} km de {place.city} (données OpenStreetMap, complétées par les habitants : certains commerces peuvent manquer).
            </div>
            <div className="chips">
              <button className={`chip ${kind === 'tout' ? 'on' : ''}`} onClick={() => setKind('tout')}>
                Tout ({stores.length})
              </button>
              {ORDER.filter((k) => counts.get(k)).map((k) => (
                <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                  {SHOPS[k].emoji} {SHOPS[k].label} ({counts.get(k)}){neededKinds.has(k) ? ' ⭐' : ''}
                </button>
              ))}
            </div>
            {kind !== 'tout' && <div className="callout info small">{SHOPS[kind].why}</div>}
            <div className="stack" style={{ gap: 8 }}>
              {shown.slice(0, 60).map((s) => (
                <div key={s.id} className="card pad row between" style={{ boxShadow: 'none', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>
                      {SHOPS[s.kind].emoji} {s.name}
                    </strong>
                    {s.organic && <span className="tag" style={{ marginLeft: 6 }}>bio</span>}
                    <div className="small muted">
                      {SHOPS[s.kind].one} · {String(s.km).replace('.', ',')} km{s.address ? ` · ${s.address}` : ''}
                    </div>
                    {s.hours && <div className="small muted">🕒 {s.hours}</div>}
                    <div className="row small" style={{ gap: 10, marginTop: 4 }}>
                      <a href={directionsUrl(s)} target="_blank" rel="noreferrer">
                        Itinéraire
                      </a>
                      {s.website && (
                        <a href={s.website} target="_blank" rel="noreferrer">
                          Site
                        </a>
                      )}
                      {s.phone && <a href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="small muted">
          Pour trouver aussi des producteurs qui vendent en direct :{' '}
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
          . Pour comparer des produits de supermarché (labels, additifs, origine), scannez-les avec{' '}
          <a href="https://fr.openfoodfacts.org/" target="_blank" rel="noreferrer">
            Open Food Facts
          </a>
          .
        </div>
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>🛒 Pour ma liste de courses</h2>
        {forList.groups.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Votre liste est vide. <Link to="/courses">Générez-la</Link> depuis votre semaine : vous verrez ici où et comment acheter chaque produit.
          </p>
        ) : (
          <>
            {forList.upgrades.length > 0 && (
              <div className="callout ok small" style={{ margin: 0 }}>
                <strong>💡 Morceaux plus nutritifs pour le même plat</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {forList.upgrades.map((u) => (
                    <li key={u.from} style={{ marginBottom: 4 }}>
                      <strong>{u.from}</strong> → <strong>{u.to}</strong> : {u.tip}
                      {u.gains.length > 0 && <span className="muted"> ({u.gains.map((g) => `${g.label} ×${g.ratio >= 10 ? '10+' : String(g.ratio).replace('.', ',')}`).join(', ')} pour 100 g)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {forList.groups.map(({ guide, names }) => (
              <details key={guide.id} className="card pad" style={{ boxShadow: 'none' }}>
                <summary style={{ cursor: 'pointer' }}>
                  <strong>
                    {guide.emoji} {guide.title}
                  </strong>{' '}
                  <span className="small muted">— {[...new Set(names)].slice(0, 5).join(', ')}{names.length > 5 ? '…' : ''}</span>
                </summary>
                <div style={{ marginTop: 8 }}>
                  <GuideCard g={guide} compact />
                </div>
              </details>
            ))}
          </>
        )}
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>📖 Bien choisir, aliment par aliment</h2>
        {GUIDES.map((g) => (
          <details key={g.id} className="card pad" style={{ boxShadow: 'none' }}>
            <summary style={{ cursor: 'pointer' }}>
              <strong>
                {g.emoji} {g.title}
              </strong>
            </summary>
            <div style={{ marginTop: 8 }}>
              <GuideCard g={g} />
            </div>
          </details>
        ))}
        <p className="small muted" style={{ margin: 0 }}>
          Détail des études : <Link to="/sources">Sources & méthode</Link>.
        </p>
      </section>
    </div>
  );
}
