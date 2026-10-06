// ─────────────────────────────────────────────────────────────
// Assistant IA facultatif. La clé Anthropic est un SECRET de la fonction
// (supabase secrets set ANTHROPIC_API_KEY=…) : elle n'est jamais envoyée
// au navigateur. Quota par personne et par jour (AI_DAILY_LIMIT, 10 par
// défaut). Déploiement : docs/SUPABASE.md, section 6.
// ─────────────────────────────────────────────────────────────
import { admin, cors, currentUser, json } from '../_shared/auth.ts';

const SYSTEM = `Tu es l'assistant culinaire de l'application « Notre Cuisine ». Tu réponds en français, simplement et brièvement (10 lignes maximum).
Philosophie : cuisine traditionnelle dense en nutriments (Weston A. Price, Deep Nutrition), anti-inflammatoire, aliments bruts : abats, bouillons, fermentés, poissons gras, œufs, viandes et volailles de qualité (morceaux entiers, avec la peau et le gras), légumes de saison.
Jamais de poudre de protéines, de compléments ni de produits ultra-transformés : uniquement de vrais aliments.
Respecte toujours les allergies, intolérances et aliments refusés indiqués dans le contexte.
Tu ne poses pas de diagnostic médical ; en cas de symptôme, conseille un professionnel de santé.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'Assistant non configuré sur le serveur.' }, 503);
  const user = await currentUser(req);
  if (!user) return json({ error: 'Connectez-vous pour utiliser l’assistant.' }, 401);

  const { question, context } = await req.json().catch(() => ({}));
  if (typeof question !== 'string' || !question.trim() || question.length > 1000) return json({ error: 'Question vide ou trop longue.' }, 400);

  const limit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 10);
  const { data: used, error } = await admin().rpc('ai_take', { p_user: user.id, p_limit: limit });
  if (error) return json({ error: 'Quota indisponible : exécutez la migration 20261007000000_options.sql.' }, 500);
  if (used === -1) return json({ error: `Limite de ${limit} questions par jour atteinte : à demain !` }, 429);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Contexte (profil, semaine, frigo) : ${JSON.stringify(context ?? {}).slice(0, 6000)}\n\nQuestion : ${question}` }],
    }),
  });
  if (!res.ok) return json({ error: `Assistant indisponible (${res.status}).` }, 502);
  const out = await res.json();
  const answer = (out.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n');
  return json({ answer, remaining: Math.max(0, limit - used) });
});
