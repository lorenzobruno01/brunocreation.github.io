import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../hooks/library';
import { ingredientLine } from '../domain/units';
import { markCooked } from '../db/db';
import { useToast } from '../components/ui';

/** Repère une durée dans le texte d'une étape (« 25 min », « 1 h 30 ») pour proposer un minuteur */
function findDuration(text: string): number | null {
  const h = text.match(/(\d+)\s*h\s*(\d+)?/i);
  if (h) return parseInt(h[1]) * 60 + (h[2] ? parseInt(h[2]) : 0);
  const m = text.match(/(\d+)(?:\s*(?:à|-)\s*(\d+))?\s*(?:min|minutes)\b/i);
  if (m) return parseInt(m[2] ?? m[1]);
  return null;
}

export function CookMode() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { byId, lookup } = useLibrary();
  const recipe = id ? byId.get(id) : undefined;
  const servings = Number(params.get('p')) || recipe?.servings || 2;
  const [step, setStep] = useState(-1); // -1 = mise en place (ingrédients)
  const navigate = useNavigate();
  const toast = useToast();
  const touch = useRef<number | null>(null);

  // Garder l'écran allumé pendant la cuisine
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);

  const total = recipe ? recipe.steps.length : 0;
  const go = (d: number) => setStep((s) => Math.max(-1, Math.min(total, s + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const duration = useMemo(() => (recipe && step >= 0 && step < total ? findDuration(recipe.steps[step]) : null), [recipe, step, total]);

  if (!recipe) return null;
  const factor = servings / recipe.servings;
  const done = step >= total;

  return (
    <div
      className="cook"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div className="cook-top">
        <button className="icon-btn" onClick={() => navigate(`/recette/${recipe.id}`)} aria-label="Quitter">
          ✕
        </button>
        <div className="grow">
          <strong>{recipe.name}</strong>
          <div className="small muted">👥 {servings} pers.</div>
        </div>
      </div>
      <div className="cook-progress">
        <div style={{ width: `${((step + 1) / (total + 1)) * 100}%` }} />
      </div>
      <div className="cook-body">
        {step === -1 && (
          <>
            <div className="cook-step-n">Mise en place</div>
            <ul className="ing-list" style={{ fontSize: '1.2rem' }}>
              {recipe.ingredients.map((ri, i) => {
                const ing = lookup(ri.id);
                return ing ? (
                  <li key={i}>
                    {ing.emoji} {ingredientLine(ri.qty * factor, ri.unit, ing)}
                    {ri.note && <span className="muted"> — {ri.note}</span>}
                  </li>
                ) : null;
              })}
            </ul>
          </>
        )}
        {step >= 0 && !done && (
          <>
            <div className="cook-step-n">
              Étape {step + 1} / {total}
            </div>
            <div className="cook-text">{recipe.steps[step]}</div>
            {duration && <Timer key={step} minutes={duration} />}
          </>
        )}
        {done && (
          <div className="center stack" style={{ alignItems: 'center' }}>
            <div style={{ fontSize: '4rem' }}>🎉</div>
            <div className="cook-text">Bon appétit !</div>
            <button
              className="btn primary lg"
              onClick={async () => {
                const e = await markCooked(recipe.id, undefined, servings);
                toast('Ajoutée à l’historique');
                navigate(`/recette/${recipe.id}?avis=${e.id}`);
              }}
            >
              ✅ Marquer comme cuisinée
            </button>
            <Link to={`/recette/${recipe.id}`} className="btn ghost">
              Retour à la recette
            </Link>
          </div>
        )}
      </div>
      <div className="cook-nav">
        <button className="btn" onClick={() => go(-1)} disabled={step === -1}>
          ← Précédent
        </button>
        <button className="btn primary" onClick={() => go(1)} disabled={done}>
          {step === -1 ? 'Commencer →' : step === total - 1 ? 'Terminer ✓' : 'Suivant →'}
        </button>
      </div>
    </div>
  );
}

function Timer({ minutes }: { minutes: number }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left == null || left <= 0) return;
    const t = setTimeout(() => setLeft((l) => (l == null ? l : l - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);
  useEffect(() => {
    if (left === 0) {
      navigator.vibrate?.([300, 150, 300, 150, 300]);
      try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        o.frequency.value = 880;
        o.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.8);
      } catch {
        /* audio indisponible */
      }
    }
  }, [left]);
  if (left == null)
    return (
      <button className="btn lg" onClick={() => setLeft(minutes * 60)} style={{ alignSelf: 'flex-start' }}>
        ⏲️ Lancer un minuteur de {minutes} min
      </button>
    );
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="row">
      <span className="timer" style={{ fontSize: '1.6rem', background: left === 0 ? 'var(--ok-soft)' : undefined }}>
        ⏲️ {left === 0 ? 'Terminé !' : `${mm}:${ss}`}
      </span>
      <button className="btn sm" onClick={() => setLeft(null)}>
        Arrêter
      </button>
    </div>
  );
}
