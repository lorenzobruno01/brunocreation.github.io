import { Link } from 'react-router-dom';
import { usePlanAnalysis, useStreak, weekComplete } from '../hooks/plan';
import { useLibrary } from '../hooks/library';
import { commonIngredients, foodSourcesFor } from '../domain/week';
import { useMemo } from 'react';
import type { Slot } from '../domain/types';
import { deName } from './format';

/** Bilan de la semaine par personne : 100 % atteint, ou ce qu'il faudrait ajouter */
export function WeekVerdict({ dates, slots }: { dates: string[]; slots: Slot[] }) {
  const { ingredients, recipes } = useLibrary();
  const streak = useStreak();
  const WeekBadge = () => (
    <div className="week-badge">
      <span className="wb-icon">🏆</span>
      <span>
        <strong>Semaine à 100 %</strong>
        <span className="small">{streak > 1 ? `🔥 ${streak} semaines d’affilée !` : 'Tous les besoins de chacun sont couverts.'}</span>
      </span>
    </div>
  );
  const common = useMemo(() => commonIngredients(recipes), [recipes]);
  const { weeks, loaded } = usePlanAnalysis(dates);
  if (!loaded || !weeks.length || !weeks[0].days.length) return null;
  const partial = slots.length < 4;
  return (
    <section className="card pad section stack" aria-label="Bilan de la semaine">
      {weekComplete(weeks) && <WeekBadge />}
      {weeks.map((w) => {
        const name = weeks.length > 1 ? w.profile.name : 'vous';
        if (!w.gaps.length && !w.excess.length)
          return (
            <div key={w.profile.id} className="callout ok small" style={{ margin: 0 }}>
              ✅ 100 % des vitamines, minéraux, oméga-3, fibres et acides aminés couverts sur la semaine pour {name}.
            </div>
          );
        return (
          <div key={w.profile.id} className="callout small stack" style={{ margin: 0, gap: 4 }}>
            {w.gaps.length > 0 && (
              <>
                <span>
                  ⚠️ {partial ? `Avec ${slots.length} repas planifiés sur 4` : 'Avec vos critères et vos goûts'}, la semaine n’atteint pas 100 % pour {name} :{' '}
                  {w.gaps
                    .slice(0, 4)
                    .map((g) => `${g.label.replace(/ \(.*\)/, '')} ${Math.round(w.pct[g.key])} %`)
                    .join(', ')}
                  {w.gaps.length > 4 ? '…' : ''}.
                </span>
                {w.gaps.slice(0, 3).map((g) => {
                  const f = foodSourcesFor(g, w.profile, ingredients, 1, common)[0];
                  if (!f) return null;
                  const per = Math.max(1, Math.min(7, Math.ceil(((100 - w.pct[g.key]) * 7) / Math.max(1, f.pct))));
                  return (
                    <span key={g.key}>
                      ➕ {g.label.replace(/ \(.*\)/, '')} : {f.ing.emoji} {f.grams} g {deName(f.ing.name)}, {per} fois dans la semaine
                    </span>
                  );
                })}
                {partial && <span className="muted">Les repas non planifiés (petit-déjeuner, collation…) peuvent apporter le reste.</span>}
              </>
            )}
            {w.excess.map((e) => (
              <span key={e.def.key}>⚠️ {e.def.label} au-dessus du repère sur la semaine pour {name}.</span>
            ))}
            <Link to="/ma-semaine">Voir le détail ›</Link>
          </div>
        );
      })}
    </section>
  );
}
