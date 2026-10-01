// ─────────────────────────────────────────────────────────────
// IA intégrée (§13, §43–§45) — Claude via l'API Anthropic.
// L'appel se fait depuis le navigateur avec la clé API du foyer
// (stockée localement, jamais publiée). Sorties structurées
// (JSON Schema) → les recettes générées référencent directement
// les ingrédients normalisés, puis passent par le contrôle
// philosophie + anti-doublons avant d'entrer dans la bibliothèque.
// ─────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import type { Ingredient, IndexedRecipe, PlanEntry, Recipe, Slot } from '../domain/types';
import { CATEGORIES, CUISINES, DIFFICULTIES, FLAVORS, MEAL_TYPES, PROTEINS, SEASONS, TECHNIQUES, CONTEXT_TAGS } from '../domain/labels';
import { RECIPE_UNITS } from '../domain/units';
import { PHILOSOPHY_PROMPT, checkPhilosophy, type PhilosophyIssue } from '../domain/philosophy';
import { indexRecipe, type IngredientLookup } from '../domain/indexing';
import { DUPLICATE_THRESHOLD, TOO_CLOSE_THRESHOLD, similarity } from '../domain/similarity';
import { slugify } from '../domain/text';

import { AiError } from './light';

function client(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

// ── Schéma de sortie ──────────────────────────────────────

function recipeSchema(ingredientIds: string[]) {
  const str = { type: 'string' };
  const int = { type: 'integer' };
  const enumArr = (values: string[]) => ({ type: 'array', items: { type: 'string', enum: values } });
  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'description', 'emoji', 'category', 'mealTypes', 'cuisine', 'prepTime', 'cookTime', 'restTime', 'difficulty', 'servings', 'ingredients', 'steps', 'tags', 'seasons', 'technique', 'flavors', 'tips'],
    properties: {
      name: str,
      description: str,
      emoji: str,
      category: { type: 'string', enum: Object.keys(CATEGORIES) },
      mealTypes: enumArr(Object.keys(MEAL_TYPES)),
      cuisine: { type: 'string', enum: Object.keys(CUISINES) },
      prepTime: int,
      cookTime: int,
      restTime: int,
      difficulty: { type: 'string', enum: Object.keys(DIFFICULTIES) },
      servings: int,
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'qty', 'unit', 'note', 'optional'],
          properties: {
            id: { type: 'string', enum: ingredientIds },
            qty: { type: 'number' },
            unit: { type: 'string', enum: RECIPE_UNITS },
            note: str,
            optional: { type: 'boolean' },
          },
        },
      },
      steps: { type: 'array', items: str },
      tags: { type: 'array', items: str },
      seasons: enumArr(Object.keys(SEASONS)),
      technique: { type: 'string', enum: Object.keys(TECHNIQUES) },
      flavors: enumArr(Object.keys(FLAVORS)),
      tips: str,
    },
  };
}

type RawRecipe = Omit<Recipe, 'id'> & { restTime: number; tips: string };

// ── Contexte système (stable → mis en cache) ──────────────

function systemPrompt(ingredients: Ingredient[]): string {
  const list = ingredients
    .map((i) => `${i.id}: ${i.name}${i.pieceWeight ? ` [pièce≈${i.pieceWeight}g]` : ''}${i.unit !== 'g' ? ` [unité ${i.unit}]` : ''}`)
    .join('\n');
  return `Tu es le chef et nutritionniste personnel d'un couple qui cuisine à la maison (2 personnes par défaut). Tu écris en français des recettes réellement cuisinables, gourmandes, précises et variées.

${PHILOSOPHY_PROMPT}

RÈGLES DE FORMAT :
- Chaque ingrédient référence un id de la BASE D'INGRÉDIENTS ci-dessous (aucun autre id). Si l'ingrédient exact manque, prends le plus proche et précise-le dans "note".
- Unités : g, kg, ml, cl, l, piece (uniquement si l'ingrédient a un poids pièce), cas (c. à soupe), cac (c. à café), pincee, tranche, gousse (ail), brin, feuille, botte, filet, au-gout (sel/poivre : qty 1, unit "au-gout").
- Les quantités correspondent à "servings" portions et doivent être réalistes : la nutrition est calculée automatiquement à partir d'elles.
- 4 à 9 étapes avec températures, durées et repères visuels concrets.
- Plats principaux : viser ≥ 30 g de protéines et 600–1000 kcal par portion, féculent inclus.
- tags parmi : ${CONTEXT_TAGS.join(', ')}.
- restTime = 0 s'il n'y a pas de repos ; tips = "" si rien à ajouter ; note = "" et optional = false par défaut.

BASE D'INGRÉDIENTS (id: nom) :
${list}`;
}

function librarySummary(library: IndexedRecipe[], focus?: { cuisine?: string; category?: string }): string {
  const count = (f: (r: IndexedRecipe) => string | undefined) => {
    const m = new Map<string, number>();
    for (const r of library) {
      const k = f(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  };
  // Liste des noms existants (filtrée si la bibliothèque devient très grande)
  let pool = library;
  if (library.length > 1200 && focus) {
    pool = library.filter((r) => (!focus.cuisine || r.cuisine === focus.cuisine) && (!focus.category || r.category === focus.category));
  }
  const names = pool.map((r) => `- ${r.name} [${r.mainProtein ?? '—'} · ${r.cuisine} · ${r.technique}]`).join('\n');
  return `BIBLIOTHÈQUE ACTUELLE : ${library.length} recettes.
Par cuisine : ${count((r) => r.cuisine)}
Par protéine : ${count((r) => r.mainProtein)}
Par catégorie : ${count((r) => r.category)}

RECETTES EXISTANTES (à NE PAS dupliquer, ni produire de variante trop proche : même protéine + même féculent + mêmes légumes + même technique = doublon) :
${names}`;
}

// ── Appel générique ───────────────────────────────────────

async function callStructured<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
  onProgress?: (chars: number) => void;
}): Promise<T> {
  const c = client(opts.apiKey);
  const useFallback = opts.model === 'claude-opus-5-5' || opts.model === 'claude-sonnet-5-5';
  try {
    const stream = c.beta.messages.stream(
      {
        model: opts.model,
        max_tokens: 64000,
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: opts.user }],
        output_config: {
          format: { type: 'json_schema', schema: opts.schema },
          ...(opts.model.startsWith('claude-haiku') ? {} : { effort: opts.effort ?? 'medium' }),
        },
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: opts.signal },
    );
    let chars = 0;
    stream.on('text', (t) => {
      chars += t.length;
      opts.onProgress?.(chars);
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new AiError('La demande a été refusée par le modèle. Reformulez-la.');
    if (msg.stop_reason === 'max_tokens') throw new AiError('Réponse trop longue — demandez moins de recettes à la fois.');
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AiError('Réponse illisible (JSON invalide). Réessayez.');
    }
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('Clé API invalide. Vérifiez-la dans Réglages.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('Cette clé API n’a pas accès à ce modèle.');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('Limite de requêtes atteinte. Réessayez dans une minute.');
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Requête refusée par l’API : ${e.message}`);
    if (e instanceof Anthropic.APIUserAbortError) throw new AiError('Génération annulée.');
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('Connexion impossible à l’API Anthropic (réseau ?).');
    if (e instanceof Anthropic.APIError) throw new AiError(`Erreur de l’API (${e.status ?? '?'}) : ${e.message}`);
    throw e;
  }
}

// ── Contrôle des recettes générées ────────────────────────

export interface GeneratedCandidate {
  recipe: Recipe;
  indexed: IndexedRecipe;
  issues: PhilosophyIssue[];
  closest?: { name: string; score: number; reasons: string[] };
  status: 'ok' | 'proche' | 'doublon' | 'invalide';
}

export function reviewCandidates(raw: RawRecipe[], library: IndexedRecipe[], lookup: IngredientLookup): GeneratedCandidate[] {
  const out: GeneratedCandidate[] = [];
  const now = new Date().toISOString();
  for (const r of raw) {
    const recipe: Recipe = {
      ...r,
      id: `ia-${slugify(r.name)}-${Math.random().toString(36).slice(2, 6)}`,
      restTime: r.restTime || undefined,
      tips: r.tips || undefined,
      ingredients: r.ingredients
        .filter((i) => lookup(i.id))
        .map((i) => ({ id: i.id, qty: i.qty, unit: i.unit, ...(i.note ? { note: i.note } : {}), ...(i.optional ? { optional: true } : {}) })),
      source: 'ai',
      createdAt: now,
    };
    const indexed = indexRecipe(recipe, lookup);
    const issues = checkPhilosophy(recipe, lookup);
    let closest: GeneratedCandidate['closest'];
    for (const other of [...library, ...out.map((o) => o.indexed)]) {
      const s = similarity(indexed, other);
      if (!closest || s.score > closest.score) closest = { name: other.name, score: s.score, reasons: s.reasons };
    }
    const nameClash = library.some((l) => l.name.toLowerCase() === recipe.name.toLowerCase());
    let status: GeneratedCandidate['status'] = 'ok';
    if (issues.some((i) => i.level === 'error') || recipe.ingredients.length < 2 || recipe.steps.length < 3) status = 'invalide';
    else if (nameClash || (closest && closest.score >= DUPLICATE_THRESHOLD)) status = 'doublon';
    else if (closest && closest.score >= TOO_CLOSE_THRESHOLD) status = 'proche';
    out.push({ recipe, indexed, issues, closest, status });
  }
  return out;
}

// ── Génération de nouvelles recettes ──────────────────────

export interface GenerateOptions {
  apiKey: string;
  model: string;
  request: string; // demande en langage naturel
  count: number;
  library: IndexedRecipe[];
  ingredients: Ingredient[];
  lookup: IngredientLookup;
  focus?: { cuisine?: string; category?: string };
  signal?: AbortSignal;
  onStatus?: (s: string) => void;
}

export async function generateRecipes(o: GenerateOptions): Promise<GeneratedCandidate[]> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['recipes'],
    properties: { recipes: { type: 'array', items: recipeSchema(o.ingredients.map((i) => i.id)) } },
  };
  const system = systemPrompt(o.ingredients);
  const accepted: GeneratedCandidate[] = [];
  const rejected: GeneratedCandidate[] = [];
  let remaining = o.count;
  // Jusqu'à 3 passes : les recettes trop proches sont remplacées par de vraies alternatives (§45)
  for (let round = 0; round < 3 && remaining > 0; round++) {
    o.onStatus?.(round === 0 ? `Génération de ${remaining} recette(s)…` : `Remplacement de ${remaining} recette(s) trop proches…`);
    const avoid = [...accepted, ...rejected].map((c) => `- ${c.recipe.name}${c.status !== 'ok' ? ` (rejetée : ${c.status}${c.closest ? `, trop proche de « ${c.closest.name} »` : ''})` : ''}`).join('\n');
    const user = `${librarySummary([...o.library, ...accepted.map((a) => a.indexed)], o.focus)}

${avoid ? `DÉJÀ PROPOSÉES DANS CETTE SESSION (ne pas refaire) :\n${avoid}\n\n` : ''}DEMANDE : ${o.request}

Génère exactement ${remaining} recette(s) NOUVELLES, chacune culinairement distincte des recettes existantes et entre elles (varie protéine, féculent, légumes, technique, cuisine, profil gustatif). Vérifie la philosophie alimentaire pour chacune.`;
    const res = await callStructured<{ recipes: RawRecipe[] }>({
      apiKey: o.apiKey,
      model: o.model,
      system,
      user,
      schema,
      signal: o.signal,
      onProgress: (n) => o.onStatus?.(`Rédaction en cours… ${Math.round(n / 1000)} k caractères`),
    });
    const reviewed = reviewCandidates(res.recipes ?? [], [...o.library, ...accepted.map((a) => a.indexed)], o.lookup);
    for (const c of reviewed) (c.status === 'ok' && accepted.length < o.count ? accepted : rejected).push(c);
    remaining = o.count - accepted.length;
  }
  return [...accepted, ...rejected];
}

// ── Adaptation / substitution d'une recette ───────────────

export async function adaptRecipe(o: {
  apiKey: string;
  model: string;
  recipe: Recipe;
  instruction: string;
  ingredients: Ingredient[];
  lookup: IngredientLookup;
  library: IndexedRecipe[];
  signal?: AbortSignal;
}): Promise<GeneratedCandidate> {
  const schema = recipeSchema(o.ingredients.map((i) => i.id));
  const { id: _id, source: _s, createdAt: _c, photo: _p, ...base } = o.recipe;
  const user = `Voici une recette existante (JSON) :
${JSON.stringify(base)}

DEMANDE D'ADAPTATION : ${o.instruction}

Renvoie la recette adaptée complète (même format). Garde l'esprit du plat, ajuste quantités, étapes et temps en conséquence, respecte la philosophie alimentaire. Donne-lui un nom qui reflète l'adaptation.`;
  const raw = await callStructured<RawRecipe>({ apiKey: o.apiKey, model: o.model, system: systemPrompt(o.ingredients), user, schema, effort: 'low', signal: o.signal });
  const [c] = reviewCandidates([raw], o.library.filter((r) => r.id !== o.recipe.id), o.lookup);
  return c;
}

// ── Menu de la semaine par l'IA ───────────────────────────

export async function planWeekAI(o: {
  apiKey: string;
  model: string;
  candidates: IndexedRecipe[];
  dates: string[];
  slots: Slot[];
  instruction: string;
  favorites: Set<string>;
  recent: string[];
  available: string[];
  lookup: IngredientLookup;
  servings: number;
  signal?: AbortSignal;
}): Promise<{ plan: PlanEntry[]; explanation: string }> {
  const ids = o.candidates.map((r) => r.id);
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['plan', 'explanation'],
    properties: {
      plan: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'slot', 'recipeId'],
          properties: { date: { type: 'string', enum: o.dates }, slot: { type: 'string', enum: o.slots }, recipeId: { type: 'string', enum: ids } },
        },
      },
      explanation: { type: 'string' },
    },
  };
  const catalog = o.candidates
    .map((r) => `${r.id} | ${r.name} | ${r.mainProtein ? PROTEINS[r.mainProtein].label : '—'} | ${r.cuisine} | ${r.totalTime} min | ${r.nutrition.kcal} kcal ${r.nutrition.protein} g prot | ingr: ${r.mainIngredientIds.slice(0, 8).join(',')}${o.favorites.has(r.id) ? ' | ❤️' : ''}`)
    .join('\n');
  const user = `Organise les repas pour les créneaux suivants : ${o.dates.map((d) => o.slots.map((s) => `${d}/${s}`).join(', ')).join(' ; ')}.
Choisis UNIQUEMENT parmi ce catalogue (id | nom | protéine | cuisine | temps | nutrition | ingrédients | favori) :
${catalog}

Contraintes : variété des protéines (jamais la même deux repas de suite, pas plus de 3 fois dans la semaine, abats max 1 fois), variété des cuisines et techniques, plats rapides en semaine le soir, plats longs le week-end, saison actuelle, favoris appréciés, éviter les recettes cuisinées récemment (${o.recent.join(', ') || 'aucune'}), utiliser au mieux les ingrédients disponibles (${o.available.join(', ') || 'aucun'}).
Demande spécifique : ${o.instruction || 'aucune'}
Explique brièvement tes choix (2–4 phrases).`;
  const res = await callStructured<{ plan: Array<{ date: string; slot: Slot; recipeId: string }>; explanation: string }>({
    apiKey: o.apiKey,
    model: o.model,
    system: `Tu es le planificateur de repas d'un couple.\n\n${PHILOSOPHY_PROMPT}`,
    user,
    schema,
    effort: 'low',
    signal: o.signal,
  });
  const valid = new Set(ids);
  const seen = new Set<string>();
  const plan = res.plan
    .filter((p) => valid.has(p.recipeId) && o.dates.includes(p.date) && o.slots.includes(p.slot))
    .filter((p) => (seen.has(`${p.date}|${p.slot}`) ? false : (seen.add(`${p.date}|${p.slot}`), true)))
    .map((p) => ({ key: `${p.date}|${p.slot}`, date: p.date, slot: p.slot, recipeId: p.recipeId, servings: o.servings }));
  return { plan, explanation: res.explanation };
}

// ── Test de connexion (requête minimale) ──────────────────

export async function testConnection(apiKey: string, model: string): Promise<string> {
  try {
    const msg = await client(apiKey).messages.create({
      model,
      max_tokens: 1000,
      messages: [{ role: 'user', content: 'Réponds uniquement : « Connexion réussie ».' }],
    });
    return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim() || 'Connexion réussie';
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('Clé API invalide (vérifiez qu’elle commence par sk-ant- et qu’elle est active).');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('Cette clé n’a pas accès à ce modèle.');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('Limite atteinte ou crédit épuisé : vérifiez la facturation sur console.anthropic.com.');
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Requête refusée : ${e.message} (crédit insuffisant ?)`);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError('Impossible de joindre l’API (connexion internet ?).');
    if (e instanceof Anthropic.APIError) throw new AiError(`Erreur ${e.status ?? ''} : ${e.message}`);
    throw e;
  }
}
