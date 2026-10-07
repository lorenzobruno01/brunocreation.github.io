import { useEffect } from 'react';
import type { PlannerConstraints } from '../domain/planner';
import { CUISINES, DIFFICULTIES, PROTEINS } from '../domain/labels';
import type { Cuisine, Difficulty, ProteinGroup } from '../domain/types';

const KEY = 'cuisine.planConstraints';

export function loadConstraints(): PlannerConstraints {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? [];
  return a.includes(v) ? a.filter((x) => x !== v) : [...a, v];
}

const REGIONS: Record<string, string> = { europe: '🏔️ Europe', mediterranee: '🫒 Méditerranée', orient: '🌙 Orient', asie: '🥢 Asie', ameriques: '🌎 Amériques' };

/** Critères de génération du menu (mémorisés sur l'appareil) */
export function ConstraintsEditor({ value, onChange }: { value: PlannerConstraints; onChange: (c: PlannerConstraints) => void }) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* indisponible */
    }
  }, [value]);
  const set = (p: Partial<PlannerConstraints>) => onChange({ ...value, ...p });
  const times = [20, 30, 45, 60, 90];
  return (
    <details className="card pad" open>
      <summary style={{ cursor: 'pointer', fontWeight: 800 }}>⚙️ Critères du menu</summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <Row label="⏱ Durée max en semaine">
          <Chip on={!value.maxTimeWeek} onClick={() => set({ maxTimeWeek: undefined })}>Libre</Chip>
          {times.map((t) => (
            <Chip key={t} on={value.maxTimeWeek === t} onClick={() => set({ maxTimeWeek: t })}>
              {t} min
            </Chip>
          ))}
        </Row>
        <Row label="⏱ Durée max le week-end">
          <Chip on={!value.maxTimeWeekend} onClick={() => set({ maxTimeWeekend: undefined })}>Libre</Chip>
          {[30, 60, 90, 120, 180].map((t) => (
            <Chip key={t} on={value.maxTimeWeekend === t} onClick={() => set({ maxTimeWeekend: t })}>
              {t < 60 ? `${t} min` : `${t / 60} h`}
            </Chip>
          ))}
        </Row>
        <Row label="⭐ Difficulté autorisée">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
            <Chip key={d} on={!value.difficulties?.length || value.difficulties.includes(d)} onClick={() => set({ difficulties: toggle(value.difficulties?.length ? value.difficulties : (Object.keys(DIFFICULTIES) as Difficulty[]), d) })}>
              {DIFFICULTIES[d].label}
            </Chip>
          ))}
        </Row>
        <Row label="🌍 Cuisines (aucune = toutes)">
          {Object.entries(REGIONS).map(([k, l]) => (
            <Chip key={k} on={!!value.regions?.includes(k)} onClick={() => set({ regions: toggle(value.regions, k) })}>
              {l}
            </Chip>
          ))}
          {(['francaise', 'italienne', 'espagnole', 'grecque', 'rustique'] as Cuisine[]).map((c) => (
            <Chip key={c} on={!!value.cuisines?.includes(c)} onClick={() => set({ cuisines: toggle(value.cuisines, c) })}>
              {CUISINES[c].emoji} {CUISINES[c].label}
            </Chip>
          ))}
        </Row>
        <Row label="🚫 Protéines à éviter cette semaine">
          {(['boeuf', 'veau', 'agneau', 'porc', 'poulet', 'canard', 'poisson-gras', 'poisson-blanc', 'fruits-de-mer', 'abats', 'oeufs'] as ProteinGroup[]).map((p) => (
            <Chip key={p} on={!!value.excludeProteins?.includes(p)} danger onClick={() => set({ excludeProteins: toggle(value.excludeProteins, p) })}>
              {PROTEINS[p].emoji} {PROTEINS[p].label}
            </Chip>
          ))}
        </Row>
        <Row label="🐟 Poisson au moins">
          {[0, 1, 2, 3, 4].map((n) => (
            <Chip key={n} on={(value.minFish ?? 0) === n} onClick={() => set({ minFish: n || undefined })}>
              {n === 0 ? 'indifférent' : `${n} fois`}
            </Chip>
          ))}
        </Row>
        <Row label="🫀 Abats au maximum">
          {[0, 1, 2].map((n) => (
            <Chip key={n} on={value.maxAbats === n} onClick={() => set({ maxAbats: value.maxAbats === n ? undefined : n })}>
              {n === 0 ? 'aucun' : `${n} fois`}
            </Chip>
          ))}
        </Row>
        <Row label="🥩 Protéines min. par plat">
          {[undefined, 30, 40, 50].map((n) => (
            <Chip key={String(n)} on={value.minProtein === n} onClick={() => set({ minProtein: n })}>
              {n ? `≥ ${n} g` : 'indifférent'}
            </Chip>
          ))}
        </Row>
        <Row label="🔥 Calories par plat">
          {[
            { l: 'indifférent', min: undefined, max: undefined },
            { l: '< 700', min: undefined, max: 700 },
            { l: '700 – 1000', min: 700, max: 1000 },
            { l: '> 900 (prise de masse)', min: 900, max: undefined },
          ].map((k) => (
            <Chip key={k.l} on={value.minKcal === k.min && value.maxKcal === k.max} onClick={() => set({ minKcal: k.min, maxKcal: k.max })}>
              {k.l}
            </Chip>
          ))}
        </Row>
        <Row label="🌅 Petit-déjeuner">
          {(
            [
              ['tous', '🔀 Sucré ou salé'],
              ['sucre', '🍯 Sucré'],
              ['sale', '🍳 Salé'],
              ['tradition', '🐟 Salé traditionnel (poisson, abats permis)'],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} on={(value.breakfast ?? 'tous') === k} onClick={() => set({ breakfast: k })}>
              {l}
            </Chip>
          ))}
          <Chip on={!!value.breakfastExpress} onClick={() => set({ breakfastExpress: !value.breakfastExpress })}>
            ⚡ Express (15 min max le matin)
          </Chip>
        </Row>
        <Row label="Autres">
          <Chip on={!!value.seasonOnly} onClick={() => set({ seasonOnly: !value.seasonOnly })}>🍂 Uniquement de saison</Chip>
          <Chip on={!!value.favoritesOnly} onClick={() => set({ favoritesOnly: !value.favoritesOnly })}>❤️ Uniquement mes favoris</Chip>
          <Chip on={!!value.coldLunch} onClick={() => set({ coldLunch: !value.coldLunch })}>🥗 Midi en semaine : repas froid / lunch box</Chip>
          <Chip on={value.simpleSnacks !== false} onClick={() => set({ simpleSnacks: value.simpleSnacks === false })}>🍎 Goûters tout simples en semaine (≤ 10 min)</Chip>
        </Row>
        <button className="btn sm ghost" onClick={() => onChange({})}>
          Réinitialiser les critères
        </button>
      </div>
    </details>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="chips" style={{ marginTop: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children, danger }: { on: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" className={`chip ${on ? 'on' : ''}`} onClick={onClick} style={on && danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}>
      {children}
    </button>
  );
}
