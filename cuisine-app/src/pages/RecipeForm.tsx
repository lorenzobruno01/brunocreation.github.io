import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { searchIngredients, useLibrary } from '../hooks/library';
import { saveRecipe, db } from '../db/db';
import { CATEGORIES, CONTEXT_TAGS, CUISINES, DIFFICULTIES, FLAVORS, MEAL_TYPES, SEASONS, TECHNIQUES, INGREDIENT_CATEGORIES } from '../domain/labels';
import { RECIPE_UNITS, UNIT_LABELS } from '../domain/units';
import { slugify, norm } from '../domain/text';
import { indexRecipe } from '../domain/indexing';
import { checkPhilosophy } from '../domain/philosophy';
import { findSimilar } from '../domain/similarity';
import type { Flavor, Ingredient, IngredientCategory, MealType, Recipe, RecipeIngredient, RecipeUnit, Season } from '../domain/types';
import { Sheet, useToast } from '../components/ui';
import { stripIndex } from './RecipeDetail';

const EMPTY: Recipe = {
  id: '',
  name: '',
  description: '',
  emoji: '🍽️',
  category: 'plat',
  mealTypes: ['diner'],
  cuisine: 'francaise',
  prepTime: 15,
  cookTime: 20,
  difficulty: 'facile',
  servings: 2,
  ingredients: [],
  steps: [''],
  tags: [],
  seasons: [],
  technique: 'poele',
  flavors: [],
  source: 'user',
};

async function resizeImage(file: File, max = 900): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function RecipeForm() {
  const { id } = useParams();
  const { byId, lookup, recipes, ingredients } = useLibrary();
  const navigate = useNavigate();
  const toast = useToast();
  const existing = id ? byId.get(id) : undefined;
  const [r, setR] = useState<Recipe>(() => (existing ? stripIndex(existing) : EMPTY));
  const [ingQuery, setIngQuery] = useState('');
  const [newIng, setNewIng] = useState<string | null>(null);
  const [useManualNutrition, setUseManualNutrition] = useState(!!existing?.nutritionOverride);

  useEffect(() => {
    if (existing && !r.id) setR(stripIndex(existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const set = (patch: Partial<Recipe>) => setR((x) => ({ ...x, ...patch }));
  const setIng = (i: number, patch: Partial<RecipeIngredient>) => set({ ingredients: r.ingredients.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  const suggestions = useMemo(() => (ingQuery.trim() ? searchIngredients(ingQuery, ingredients, 8) : []), [ingQuery, ingredients]);
  const preview = useMemo(() => {
    const draft = { ...r, id: r.id || 'brouillon', steps: r.steps.filter((s) => s.trim()) };
    const ix = indexRecipe(draft, lookup);
    return {
      ix,
      issues: r.ingredients.length ? checkPhilosophy(draft, lookup) : [],
      similar: r.ingredients.length >= 2 ? findSimilar(ix, recipes.filter((x) => x.id !== r.id), 3, 0.55) : [],
    };
  }, [r, lookup, recipes]);

  const addIngredient = (ing: Ingredient) => {
    const unit: RecipeUnit = ing.unit === 'piece' ? 'piece' : ing.unit === 'ml' ? 'ml' : ing.staple ? 'au-gout' : 'g';
    set({ ingredients: [...r.ingredients, { id: ing.id, qty: unit === 'au-gout' ? 1 : unit === 'piece' ? 1 : 100, unit }] });
    setIngQuery('');
  };

  const save = async () => {
    if (!r.name.trim()) return alert('Donnez un nom à la recette.');
    if (r.ingredients.length < 1) return alert('Ajoutez au moins un ingrédient.');
    const steps = r.steps.map((s) => s.trim()).filter(Boolean);
    if (!steps.length) return alert('Ajoutez au moins une étape.');
    const rid = r.id || `${slugify(r.name)}-${Date.now().toString(36).slice(-4)}`;
    const final: Recipe = {
      ...r,
      id: rid,
      steps,
      source: existing?.source === 'seed' ? 'seed' : r.source ?? 'user',
      createdAt: r.createdAt ?? new Date().toISOString(),
      nutritionOverride: useManualNutrition ? r.nutritionOverride : undefined,
    };
    await saveRecipe(final);
    toast('Recette enregistrée ✅');
    navigate(`/recette/${rid}`);
  };

  return (
    <div className="page narrow stack" style={{ gap: 18 }}>
      <h1>{existing ? '✏️ Modifier la recette' : '➕ Ajouter une recette'}</h1>

      <section className="card pad stack">
        <div className="row nowrap" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ width: 80 }}>
            <label>Emoji</label>
            <input className="input" value={r.emoji ?? ''} onChange={(e) => set({ emoji: e.target.value })} maxLength={4} style={{ textAlign: 'center', fontSize: '1.4rem' }} />
          </div>
          <div className="field grow">
            <label>Nom</label>
            <input className="input" value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex. Agneau confit au cumin" />
          </div>
        </div>
        <div className="field">
          <label>Description</label>
          <textarea className="textarea" style={{ minHeight: 70 }} value={r.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div className="field">
          <label>Photo</label>
          <div className="row">
            {r.photo && <img src={r.photo} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 12 }} />}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) set({ photo: await resizeImage(f) });
              }}
            />
            {r.photo && (
              <button className="btn sm ghost" onClick={() => set({ photo: undefined })}>
                Retirer
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>Classement</h2>
        <div className="form-grid">
          <Select label="Catégorie" value={r.category} options={Object.entries(CATEGORIES).map(([k, v]) => [k, `${v.emoji} ${v.label}`])} onChange={(v) => set({ category: v as Recipe['category'] })} />
          <Select label="Cuisine" value={r.cuisine} options={Object.entries(CUISINES).map(([k, v]) => [k, `${v.emoji} ${v.label}`])} onChange={(v) => set({ cuisine: v as Recipe['cuisine'] })} />
          <Select label="Difficulté" value={r.difficulty} options={Object.entries(DIFFICULTIES).map(([k, v]) => [k, v.label])} onChange={(v) => set({ difficulty: v as Recipe['difficulty'] })} />
          <Select label="Technique" value={r.technique} options={Object.entries(TECHNIQUES).map(([k, v]) => [k, `${v.emoji} ${v.label}`])} onChange={(v) => set({ technique: v as Recipe['technique'] })} />
          <Num label="Préparation (min)" value={r.prepTime} onChange={(v) => set({ prepTime: v })} />
          <Num label="Cuisson (min)" value={r.cookTime} onChange={(v) => set({ cookTime: v })} />
          <Num label="Repos (min)" value={r.restTime ?? 0} onChange={(v) => set({ restTime: v || undefined })} />
          <Num label="Portions" value={r.servings} onChange={(v) => set({ servings: Math.max(1, v) })} />
        </div>
        <Chips label="Repas" all={Object.entries(MEAL_TYPES).map(([k, v]) => [k, v.label])} value={r.mealTypes} onToggle={(v) => set({ mealTypes: toggle(r.mealTypes, v as MealType) })} />
        <Chips label="Saisons (aucune = toute l’année)" all={Object.entries(SEASONS).map(([k, v]) => [k, `${v.emoji} ${v.label}`])} value={r.seasons} onToggle={(v) => set({ seasons: toggle(r.seasons, v as Season) })} />
        <Chips label="Saveurs" all={Object.entries(FLAVORS)} value={r.flavors} onToggle={(v) => set({ flavors: toggle(r.flavors, v as Flavor) })} />
        <Chips label="Tags" all={CONTEXT_TAGS.map((t) => [t, t])} value={r.tags} onToggle={(v) => set({ tags: toggle(r.tags, v) })} />
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>Ingrédients (pour {r.servings} portions)</h2>
        {r.ingredients.map((ri, i) => {
          const ing = lookup(ri.id);
          return (
            <div key={i} className="row nowrap" style={{ alignItems: 'center' }}>
              <span className="grow" style={{ fontWeight: 700 }}>
                {ing?.emoji} {ing?.name ?? ri.id}
              </span>
              <input className="input" style={{ width: 80 }} type="number" inputMode="decimal" min={0} step="any" value={ri.qty} onChange={(e) => setIng(i, { qty: Number(e.target.value) })} disabled={ri.unit === 'au-gout'} />
              <select className="select" style={{ width: 120 }} value={ri.unit} onChange={(e) => setIng(i, { unit: e.target.value as RecipeUnit })}>
                {RECIPE_UNITS.filter((u) => u !== 'piece' || ing?.pieceWeight).map((u) => (
                  <option key={u} value={u}>
                    {u === 'piece' ? 'pièce(s)' : u === 'au-gout' ? 'au goût' : UNIT_LABELS[u].one}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={() => set({ ingredients: r.ingredients.filter((_, k) => k !== i) })} aria-label="Retirer">
                ✕
              </button>
            </div>
          );
        })}
        <div style={{ position: 'relative' }}>
          <input className="input" value={ingQuery} onChange={(e) => setIngQuery(e.target.value)} placeholder="+ Ajouter un ingrédient (ex. pomme de terre, PDT…)" />
          {ingQuery.trim() && (
            <div className="card" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, marginTop: 4 }}>
              <div className="menu-list">
                {suggestions.map((s) => (
                  <button key={s.id} onClick={() => addIngredient(s)}>
                    <span className="mi">{s.emoji}</span>
                    {s.name}
                    <span className="small muted">— {INGREDIENT_CATEGORIES[s.category].label}</span>
                  </button>
                ))}
                {!suggestions.some((s) => norm(s.name) === norm(ingQuery)) && (
                  <button onClick={() => setNewIng(ingQuery.trim())}>
                    <span className="mi">➕</span>Créer l’ingrédient « {ingQuery.trim()} »
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>Étapes</h2>
        {r.steps.map((s, i) => (
          <div key={i} className="row nowrap" style={{ alignItems: 'flex-start' }}>
            <strong style={{ width: 24, paddingTop: 12 }}>{i + 1}.</strong>
            <textarea className="textarea" style={{ minHeight: 64 }} value={s} onChange={(e) => set({ steps: r.steps.map((x, k) => (k === i ? e.target.value : x)) })} placeholder="Température, durée, repère visuel…" />
            <button className="icon-btn" onClick={() => set({ steps: r.steps.filter((_, k) => k !== i) })} aria-label="Supprimer l’étape">
              ✕
            </button>
          </div>
        ))}
        <button className="btn" onClick={() => set({ steps: [...r.steps, ''] })}>
          + Ajouter une étape
        </button>
        <div className="field">
          <label>Astuce / conservation (facultatif)</label>
          <input className="input" value={r.tips ?? ''} onChange={(e) => set({ tips: e.target.value || undefined })} />
        </div>
      </section>

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>Nutrition par portion</h2>
        <div className="small">
          Calcul automatique : 🔥 <strong>{preview.ix.nutrition.kcal} kcal</strong> · 🥩 {preview.ix.nutrition.protein} g protéines · {preview.ix.nutrition.carbs} g glucides · {preview.ix.nutrition.fat} g lipides
        </div>
        <label className="row nowrap small">
          <input type="checkbox" checked={useManualNutrition} onChange={(e) => {
            setUseManualNutrition(e.target.checked);
            if (e.target.checked && !r.nutritionOverride) set({ nutritionOverride: preview.ix.nutrition });
          }} />
          Saisir les valeurs manuellement
        </label>
        {useManualNutrition && r.nutritionOverride && (
          <div className="form-grid">
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
              <Num key={k} label={{ kcal: 'Calories', protein: 'Protéines (g)', carbs: 'Glucides (g)', fat: 'Lipides (g)' }[k]} value={r.nutritionOverride![k]} onChange={(v) => set({ nutritionOverride: { ...r.nutritionOverride!, [k]: v } })} />
            ))}
          </div>
        )}
      </section>

      {(preview.issues.length > 0 || preview.similar.length > 0) && (
        <div className="callout">
          {preview.issues.map((i, k) => (
            <div key={k} className="small">
              {i.level === 'error' ? '⛔' : '⚠️'} {i.message}
            </div>
          ))}
          {preview.similar.map((s) => (
            <div key={s.recipe.id} className="small">
              🔁 Ressemble à « {s.recipe.name} » ({Math.round(s.score * 100)} %)
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ position: 'sticky', bottom: 'calc(var(--tabbar-h) + 10px)' }}>
        <button className="btn primary lg grow" onClick={save} style={{ boxShadow: 'var(--shadow-lg)' }}>
          💾 Enregistrer la recette
        </button>
      </div>

      {newIng && <NewIngredientSheet name={newIng} onClose={() => setNewIng(null)} onCreated={(ing) => { addIngredient(ing); setNewIng(null); }} />}
    </div>
  );
}

function NewIngredientSheet({ name, onClose, onCreated }: { name: string; onClose: () => void; onCreated: (i: Ingredient) => void }) {
  const [cat, setCat] = useState<IngredientCategory>('legume');
  const [kcal, setKcal] = useState(50);
  const [protein, setProtein] = useState(2);
  const [carbs, setCarbs] = useState(8);
  const [fat, setFat] = useState(1);
  const aisleOf: Record<string, Ingredient['aisle']> = { viande: 'viandes-poissons', volaille: 'viandes-poissons', abats: 'viandes-poissons', poisson: 'viandes-poissons', 'fruits-de-mer': 'viandes-poissons', oeufs: 'oeufs', laitier: 'laitiers', legume: 'legumes', fruit: 'fruits', feculent: 'feculents', herbe: 'herbes-epices', epice: 'herbes-epices' };
  return (
    <Sheet title={`Nouvel ingrédient : ${name}`} onClose={onClose}>
      <div className="stack">
        <Select label="Catégorie" value={cat} options={Object.entries(INGREDIENT_CATEGORIES).map(([k, v]) => [k, `${v.emoji} ${v.label}`])} onChange={(v) => setCat(v as IngredientCategory)} />
        <p className="small muted" style={{ margin: 0 }}>Valeurs pour 100 g (approximatives, pour le calcul nutritionnel) :</p>
        <div className="form-grid">
          <Num label="kcal" value={kcal} onChange={setKcal} />
          <Num label="Protéines" value={protein} onChange={setProtein} />
          <Num label="Glucides" value={carbs} onChange={setCarbs} />
          <Num label="Lipides" value={fat} onChange={setFat} />
        </div>
        <button
          className="btn primary"
          onClick={async () => {
            const ing: Ingredient = { id: `perso-${slugify(name)}`, name, category: cat, aisle: aisleOf[cat] ?? 'epicerie', unit: 'g', kcal, protein, carbs, fat };
            await db.customIngredients.put(ing);
            onCreated(ing);
          }}
        >
          Créer
        </button>
      </div>
    </Sheet>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Chips({ label, all, value, onToggle }: { label: string; all: Array<[string, string]>; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="chips">
        {all.map(([k, l]) => (
          <button key={k} type="button" className={`chip ${value.includes(k) ? 'on' : ''}`} onClick={() => onToggle(k)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
