import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useLibrary } from '../hooks/library';
import { useWeekTemplate } from '../hooks/plan';
import { batchFriendly } from '../domain/nutriPlanner';
import { isoDate, mondayOf, weekDates } from '../domain/season';
import { formatDateFr, formatDuration } from '../components/format';
import { SLOT_LABELS } from '../components/AddToPlanSheet';
import { Empty } from '../components/ui';
import type { IndexedRecipe, PlanEntry, Slot } from '../domain/types';

/** Jours de conservation au réfrigérateur (ANSES : plats cuisinés maison, 3 jours à 4 °C) */
const FRIDGE_DAYS = 3;

/** Mode batch cooking : tout cuisiner en une session, dans le bon ordre, et savoir quoi congeler */
export function Batch() {
  const [params] = useSearchParams();
  const start = params.get('du') ?? isoDate(mondayOf(new Date()));
  const dates = weekDates(new Date(start + 'T12:00:00'));
  const { byId } = useLibrary();
  const template = useWeekTemplate();
  const plan = useLiveQuery(() => db.plan.where('date').between(dates[0], dates[6], true, true).toArray(), [dates[0]]);
  if (!plan) return null;
  const wd = (date: string) => (new Date(date + 'T12:00:00').getDay() + 6) % 7;
  const marked = plan.filter((e) => template[`${wd(e.date)}|${e.slot}`] === 'batch' && !e.leftoverOf);
  // sans créneau « batch » dans le gabarit : les plats de la semaine qui se préparent à l'avance
  const list: PlanEntry[] = (marked.length ? marked : plan.filter((e) => !e.leftoverOf && byId.get(e.recipeId) && batchFriendly(byId.get(e.recipeId)!))).sort((a, b) => a.date.localeCompare(b.date));
  // jour du batch : la veille du premier repas concerné (le dimanche s'il tombe en début de semaine)
  const first = list[0]?.date ?? dates[0];
  const batchDay = (() => {
    const d = new Date(first + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return isoDate(d);
  })();
  const recipes = list.map((e) => ({ e, r: byId.get(e.recipeId) as IndexedRecipe })).filter((x) => x.r);
  const ordered = [...recipes].sort((a, b) => b.r.cookTime - a.r.cookTime);
  const prep = recipes.reduce((s, x) => s + x.r.prepTime, 0);
  const longest = ordered[0]?.r.cookTime ?? 0;
  const total = Math.max(prep, longest) + Math.round(prep * 0.3);
  const daysAfter = (date: string) => Math.round((new Date(date + 'T12:00:00').getTime() - new Date(batchDay + 'T12:00:00').getTime()) / 86400000);

  return (
    <div className="page stack">
      <h1 style={{ margin: 0 }}>📦 Batch cooking</h1>
      <p className="small muted" style={{ margin: 0 }}>
        Semaine du {formatDateFr(dates[0], { day: 'numeric', month: 'long' })}. {marked.length ? 'Plats placés sur les créneaux « batch » de votre semaine type.' : 'Aucun créneau « batch » dans votre semaine type : voici les plats de la semaine qui se préparent à l’avance.'}
      </p>
      {!recipes.length ? (
        <Empty emoji="📦" title="Rien à préparer à l’avance">
          <Link to="/semaine" className="btn primary">
            Planifier la semaine
          </Link>
        </Empty>
      ) : (
        <>
          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>⏱ Environ {formatDuration(total)} en cuisine</h2>
            <p className="small" style={{ margin: 0 }}>
              {recipes.length} plats, à préparer le {formatDateFr(batchDay, { weekday: 'long', day: 'numeric', month: 'long' })}. Les cuissons longues tournent pendant que vous préparez le reste.
            </p>
            <Link className="btn" to={`/courses?source=semaine&du=${dates[0]}`}>
              🛒 Liste de courses de la semaine
            </Link>
          </section>
          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>👩‍🍳 Dans quel ordre</h2>
            <ol style={{ margin: 0, paddingLeft: 20 }} className="stack">
              {ordered.map(({ e, r }, i) => (
                <li key={e.key}>
                  <Link to={`/recette/${r.id}/cuisine?p=${e.servings}`}>
                    <strong>
                      {r.emoji} {r.name}
                    </strong>
                  </Link>
                  <div className="small muted">
                    {i === 0 && r.cookTime >= 45 ? 'À lancer en premier : cuisson longue. ' : ''}
                    {r.prepTime} min de préparation, {formatDuration(r.cookTime)} de cuisson · {String(e.servings).replace('.', ',')} portions
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="card pad stack">
            <h2 style={{ margin: 0 }}>🧊 Conservation</h2>
            {recipes.map(({ e, r }) => {
              const n = daysAfter(e.date);
              const freeze = n > FRIDGE_DAYS;
              return (
                <div key={e.key} className="row between nowrap small">
                  <span>
                    {r.name} — {formatDateFr(e.date, { weekday: 'long' })} {SLOT_LABELS[e.slot as Slot].slice(3).toLowerCase()}
                  </span>
                  <span className={`tag ${freeze ? 'primary' : 'ok'}`}>{freeze ? '🧊 Congeler' : '❄️ Frigo'}</span>
                </div>
              );
            })}
            <p className="small muted" style={{ margin: 0 }}>
              Au réfrigérateur, un plat cuisiné maison se garde {FRIDGE_DAYS} jours. Au-delà, congelez-le en portions et sortez-le la veille au frigo. Refroidissez vite (moins de 2 h) avant de ranger.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
