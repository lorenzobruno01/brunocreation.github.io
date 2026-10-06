import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useLibrary, useStoredProfiles, useUserData } from '../hooks/library';
import { useActiveProfile } from '../hooks/activeProfile';
import { usePlanAnalysis } from '../hooks/plan';
import { usePendingFeedback } from '../hooks/feedback';
import { isoDate, mondayOf, weekDates } from '../domain/season';
import { commonIngredients, foodSourcesFor } from '../domain/week';
import { reviewWeight } from '../domain/weight';
import { answerRequest, REQUEST_EXAMPLES, type RequestAnswer } from '../domain/requests';
import { useCloud } from '../cloud/sync';
import { FEATURES } from '../cloud/config';
import { askAssistant } from '../cloud/remote';
import { SLOT_LABELS } from './AddToPlanSheet';
import { covColor } from '../pages/Planner';
import { RecipeCard } from './RecipeCard';
import { deName } from './format';
import type { Slot } from '../domain/types';

const ORDER: Slot[] = ['matin', 'midi', 'collation', 'soir'];
const fr = (v: number, d = 2) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

/** Accueil personnel : repas du jour et part de chacun, semaine, à utiliser vite, avis, demandes */
export function HomeToday() {
  const stored = useStoredProfiles();
  const me = useActiveProfile(stored ?? []);
  const dates = weekDates(mondayOf(new Date()));
  const today = isoDate(new Date());
  const { byId, recipes, ingredients, lookup } = useLibrary();
  const { favorites } = useUserData();
  const { weeks, eaters } = usePlanAnalysis(dates);
  const pending = usePendingFeedback(me.id);
  const fridgeRows = useLiveQuery(() => db.fridge.toArray(), []) ?? [];
  const leftovers = useLiveQuery(() => db.leftovers.toArray(), []) ?? [];
  const logs = useLiveQuery(() => db.weights.where('profileId').equals(me.id).toArray(), [me.id]);
  const common = useMemo(() => commonIngredients(recipes), [recipes]);
  const cloud = useCloud();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<RequestAnswer | null>(null);
  const [ai, setAi] = useState<{ text?: string; error?: string; busy?: boolean } | null>(null);

  if (!stored?.length) return null;
  const w = weeks.find((x) => x.profile.id === me.id) ?? weeks[0];
  const todayShares = weeks.map((x) => ({ p: x.profile, day: x.days.find((d) => d.date === today) }));
  const entries = todayShares.find((x) => x.day)?.day?.entries ?? [];
  const soon = [...fridgeRows.filter((f) => f.useSoon).map((f) => lookup(f.ingredientId)?.name).filter(Boolean), ...leftovers.map((l) => l.label)] as string[];
  const gap = w?.gaps[0];
  const food = gap ? foodSourcesFor(gap, w.profile, ingredients, 1, common)[0] : undefined;
  const review = logs && !me.hideNumbers ? reviewWeight(me, logs) : null;
  const showReview = review?.proposal && !(me.reviewSnoozedUntil && me.reviewSnoozedUntil > today);
  const useSoonIds = new Set([...fridgeRows.filter((f) => f.useSoon).map((f) => f.ingredientId), ...leftovers.flatMap((l) => l.ingredientIds)]);

  const ask = (text: string) => {
    setQ(text);
    setAi(null);
    setAnswer(answerRequest(text, { recipes, ingredients, lookup, profiles: eaters.length ? eaters : [me], me, useSoon: useSoonIds, favorites, common }));
  };
  const askAi = async () => {
    setAi({ busy: true });
    try {
      const r = await askAssistant(q, { profil: { prenom: me.name, objectif: me.objective, allergies: me.allergies, intolerances: me.intolerances, naimePas: me.dislikes }, manques: w?.gaps.map((g) => g.label), aUtiliserVite: soon });
      setAi({ text: `${r.answer}\n\n(${r.remaining} question${r.remaining > 1 ? 's' : ''} restante${r.remaining > 1 ? 's' : ''} aujourd’hui)` });
    } catch (e) {
      setAi({ error: (e as Error).message });
    }
  };

  return (
    <div className="stack" style={{ marginBottom: 18 }}>
      <section className="card pad stack" aria-label="Aujourd’hui">
        <div className="row between">
          <h2 style={{ margin: 0 }}>☀️ Aujourd’hui</h2>
          {w && w.days.length > 0 && (
            <Link to="/ma-semaine" className="tag" style={{ background: covColor(w.coverage), color: '#fff', textDecoration: 'none' }} title="Couverture des vitamines et minéraux sur la semaine">
              Semaine {Math.round(w.coverage)} %
            </Link>
          )}
        </div>
        {entries.length ? (
          ORDER.map((slot) => {
            const e = entries.find((x) => x.slot === slot);
            const r = e && byId.get(e.recipeId);
            if (!r) return null;
            return (
              <Link key={slot} to={`/recette/${r.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="small muted">{SLOT_LABELS[slot]}{e.leftoverOf ? ' · ♻️ restes' : ''}</div>
                <strong>
                  {r.emoji} {r.name}
                </strong>
                {todayShares.length > 1 && (
                  <div className="small">
                    {todayShares
                      .filter((x) => x.day)
                      .map((x) => `${x.p.name} ${fr(x.day!.share.portion)}`)
                      .join(' · ')}{' '}
                    portion
                  </div>
                )}
              </Link>
            );
          })
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Rien de prévu aujourd’hui. <Link to="/semaine">Planifier la semaine</Link>
          </p>
        )}
        {entries.length > 0 && (
          <Link to="/ma-journee" className="small">
            Ma part, mes compléments et mon bilan du jour ›
          </Link>
        )}
      </section>

      {(gap || soon.length > 0 || pending.length > 0 || showReview) && (
        <section className="card pad stack" aria-label="À faire">
          {gap && food && (
            <div className="small">
              🎯 Cette semaine, {gap.label.replace(/ \(.*\)/, '').toLowerCase()} à {Math.round(w.pct[gap.key])} % : {food.ing.emoji} {food.grams} g {deName(food.ing.name)} en plus suffiraient presque.{' '}
              <Link to="/ma-semaine">Détails</Link>
            </div>
          )}
          {soon.length > 0 && (
            <div className="small">
              ⏳ À utiliser vite : <strong>{soon.slice(0, 5).join(', ')}</strong>.{' '}
              <button className="btn sm ghost" onClick={() => ask('Utiliser ce qui doit partir vite')}>
                Idées
              </button>
            </div>
          )}
          {pending.length > 0 && (
            <Link to="/appris" className="small">
              💬 {pending.length} repas attend{pending.length > 1 ? 'ent' : ''} votre avis ›
            </Link>
          )}
          {showReview && (
            <Link to="/poids" className="small">
              ⚖️ Bilan du poids : une proposition vous attend ›
            </Link>
          )}
        </section>
      )}

      <section className="card pad stack" aria-label="Demander">
        <h2 style={{ margin: 0 }}>💡 Une envie, un besoin ?</h2>
        <form
          className="row nowrap"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) ask(q);
          }}
        >
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. combler mon manque de fer" aria-label="Votre demande" />
          <button className="btn primary">Chercher</button>
        </form>
        <div className="chips scroll">
          {REQUEST_EXAMPLES.map((x) => (
            <button key={x} className="chip" onClick={() => ask(x)}>
              {x}
            </button>
          ))}
        </div>
        {answer && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="small muted">Compris : {answer.understood.join(', ')}.</span>
            {answer.foods.length > 0 && (
              <span className="small">
                Le plus simple :{' '}
                {answer.foods.map((f, i) => (
                  <span key={f.ing.id}>
                    {i > 0 && ' · '}
                    {f.ing.emoji} {f.grams} g {deName(f.ing.name)} ({Math.round(f.pct)} %)
                  </span>
                ))}
              </span>
            )}
            {answer.recipes.length ? (
              <div className="hscroll">
                {answer.recipes.map((r) => (
                  <RecipeCard key={r.id} recipe={r} compact />
                ))}
              </div>
            ) : (
              <span className="small">Aucun plat ne correspond à tout cela à la fois : essayez avec moins de critères.</span>
            )}
            {FEATURES.ai && cloud.email && (
              <button className="btn sm" onClick={askAi} disabled={ai?.busy}>
                {ai?.busy ? 'L’assistant réfléchit…' : '🤖 Demander à l’assistant'}
              </button>
            )}
            {ai?.text && <div className="callout info small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ai.text}</div>}
            {ai?.error && <div className="callout small" style={{ margin: 0 }}>{ai.error}</div>}
          </div>
        )}
      </section>
    </div>
  );
}
