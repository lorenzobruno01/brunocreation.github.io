import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../db/db';
import { searchIngredients, useLibrary } from '../hooks/library';
import { isoDate } from '../domain/season';
import { formatDateFr } from './format';
import { useToast } from './ui';
import type { Leftover } from '../domain/types';

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

/** Ajoute un reste (plat cuisiné ou produit entamé), à manger sous 3 jours par défaut */
export function addLeftover(l: Omit<Leftover, 'id' | 'createdAt'>) {
  return db.leftovers.put({ id: newId(), createdAt: new Date().toISOString(), useBy: inDays(3), ...l });
}

/** « Il me reste… » + produits du frigo à utiliser vite */
export function LeftoversCard({ fridge }: { fridge: Set<string> }) {
  const { ingredients, lookup, byId } = useLibrary();
  const leftovers = useLiveQuery(() => db.leftovers.orderBy('createdAt').toArray(), []) ?? [];
  const rows = useLiveQuery(() => db.fridge.toArray(), []) ?? [];
  const soon = new Set(rows.filter((r) => r.useSoon).map((r) => r.ingredientId));
  const [text, setText] = useState('');
  const toast = useToast();
  const today = isoDate(new Date());

  const add = async () => {
    const label = text.trim();
    if (!label) return;
    // « un demi chou », « 2 cuisses de poulet », « du riz cuit » → l'ingrédient
    const core = label
      .toLowerCase()
      .replace(/\b(un|une|des|du|de la|de l’|de l'|le|la|les|demi|moitié|reste|restes|morceau|morceaux|peu|cuit|cuite|cuits|cuites|\d+[,.]?\d*\s*(g|kg|ml|cl|l)?)\b/g, ' ')
      .replace(/^\s*(de|d’|d')\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const hit = searchIngredients(core || label, ingredients, 1)[0] ?? core.split(' ').map((w) => searchIngredients(w, ingredients, 1)[0]).find(Boolean);
    await addLeftover({ label, ingredientIds: hit ? [hit.id] : [] });
    setText('');
    toast('Noté : le planning en tiendra compte ♻️');
  };

  const plan = async (l: Leftover) => {
    // prochain repas principal libre (demain midi, demain soir, après-demain…)
    for (let n = 0; n < 4; n++) {
      const date = inDays(n);
      for (const slot of ['midi', 'soir'] as const) {
        if (n === 0 && slot === 'midi' && new Date().getHours() >= 13) continue;
        const key = `${date}|${slot}`;
        if (await db.plan.get(key)) continue;
        await db.plan.put({ key, date, slot, recipeId: l.recipeId!, servings: 0, leftoverOf: `reste:${l.id}`, createdAt: new Date().toISOString() });
        toast(`Au menu : ${formatDateFr(date, { weekday: 'long' })} ${slot === 'midi' ? 'midi' : 'soir'} ♻️`);
        return;
      }
    }
    toast('Pas de créneau libre dans les 3 prochains jours');
  };

  return (
    <section className="card pad stack" style={{ marginBottom: 14 }} aria-label="Restes et produits à utiliser vite">
      <h2 style={{ margin: 0 }}>♻️ Il me reste…</h2>
      <div className="row nowrap" style={{ gap: 8 }}>
        <input className="input" value={text} placeholder="ex. un demi chou, du riz cuit, 2 cuisses de poulet" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}>
          Ajouter
        </button>
      </div>
      {leftovers.map((l) => {
        const late = l.useBy && l.useBy < today;
        return (
          <div key={l.id} className="row between nowrap small">
            <span>
              {l.recipeId ? '🍲' : '🥡'} <strong>{l.label}</strong>
              {l.useBy && <span className={late ? '' : 'muted'}> · {late ? '⚠️ à jeter si douteux' : `avant ${formatDateFr(l.useBy, { weekday: 'long' })}`}</span>}
              {!l.recipeId && l.ingredientIds.length > 0 && <span className="muted"> ({l.ingredientIds.map((i) => lookup(i)?.name).join(', ')})</span>}
            </span>
            <span className="row nowrap" style={{ gap: 4 }}>
              {l.recipeId && byId.get(l.recipeId) && (
                <button className="btn sm" onClick={() => plan(l)}>
                  📅 Au menu
                </button>
              )}
              <button className="icon-btn" aria-label="C’est mangé" title="C’est mangé" onClick={() => db.leftovers.delete(l.id)}>
                ✓
              </button>
            </span>
          </div>
        );
      })}
      {fridge.size > 0 && (
        <>
          <span className="small muted">Touchez ce qui doit être utilisé vite : le prochain planning le place en début de semaine.</span>
          <div className="chips">
            {[...fridge].map((id) => {
              const i = lookup(id);
              if (!i) return null;
              const on = soon.has(id);
              return (
                <button key={id} className={`chip ${on ? 'on' : ''}`} onClick={() => db.fridge.put({ ingredientId: id, useSoon: !on })}>
                  ⏳ {i.name}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
