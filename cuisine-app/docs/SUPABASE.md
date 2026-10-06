# Mise en place de Supabase (comptes, foyers, synchronisation)

L'appli reste un site statique sur GitHub Pages. Supabase fournit les comptes et la base de données partagée du foyer. L'offre gratuite suffit pour un usage familial.

Le front ne contient que deux valeurs **publiques** : l'URL du projet et la clé *publishable* (ou *anon*). Les secrets (clé Anthropic, Strava) restent dans les Edge Functions, jamais dans le navigateur.

## 1. Créer le projet (une fois)

Voir `docs/COMPTES.md` pour le pas-à-pas illustré. En résumé :

1. Créez un compte sur supabase.com, puis cliquez sur **New project**. Choisissez la région Paris ou Francfort.
2. Copiez la **Project URL** et la **Publishable key**.
3. Mettez-les dans `src/cloud/config.ts` (valeurs par défaut), ou dans `.env.local` (voir `.env.example`).

## 2. Exécuter les migrations (dans l'ordre)

Ouvrez **SQL Editor**, puis **New query**. Pour chaque fichier ci-dessous, collez tout son contenu et cliquez sur **Run**. Les fichiers peuvent être relancés sans risque.

| Fichier | Contenu |
|---|---|
| `supabase/migrations/20261005000000_user_data.sql` | Ancienne sauvegarde par compte. Elle reste utile pour reprendre les données existantes. |
| `supabase/migrations/20261006000000_foyers.sql` | Foyers, membres, invitations, et toutes les tables partagées : profils, planning, courses, garde-manger, frigo, favoris, historique, retours, poids, gabarit, restes, recettes privées. S'y ajoutent les règles de sécurité (RLS) et le temps réel. |

Pour vérifier : dans **Table Editor**, vous devez voir `households`, `household_members`, `invitations`, `meal_plans`, `shopping_items`… Dans **Database → Publications → supabase_realtime**, les tables du foyer doivent être cochées.

Tant que la seconde migration n'est pas exécutée, l'appli continue en « ancien mode » (une copie par compte) et le signale dans **Mon compte**. Dès qu'elle l'est, chaque appareil bascule automatiquement à sa prochaine connexion. Le foyer est créé, et l'ancienne sauvegarde y est reprise.

## 3. Connexion par e-mail

**Authentication → Sign In / Providers → Email** :

- **Confirm email** : désactivé conseillé, pour que le compte soit utilisable tout de suite.
- **Lien magique** (connexion sans mot de passe) : rien à activer, il fonctionne avec le fournisseur Email.

**Authentication → URL Configuration** :

- **Site URL** : `https://lorenzobruno01.github.io/brunocreation.github.io/cuisine/`
- **Redirect URLs** : ajoutez la même adresse. Les liens magiques et les liens « mot de passe oublié » y reviennent.

**Google (facultatif)** : **Authentication → Sign In / Providers → Google**. Il faut un identifiant OAuth créé dans Google Cloud Console, avec comme URL de redirection celle indiquée par Supabase. Tant que ce n'est pas fait, l'appli propose le lien magique et le mot de passe.

## 4. Comment fonctionne la synchronisation

- **Hors ligne d'abord.** Toutes les données vivent dans le téléphone (IndexedDB).
- **Envoi.** Chaque modification va dans une file d'envoi, rejouée au retour du réseau (`src/cloud/sync.ts`).
- **Réception.**
  - Les changements des autres membres arrivent en temps réel (Supabase Realtime).
  - En secours, un relevé a lieu toutes les 20 s et au retour sur l'appli.
- **Conflits.** Chaque élément (un article de courses, un repas du planning…) est une ligne à part. Si deux personnes modifient le même élément, la dernière modification l'emporte.
- **Un foyer** partage :
  - le planning, les courses, le garde-manger, le frigo et les favoris ;
  - les recettes ajoutées (privées au foyer) ;
  - le gabarit de semaine ;
  - les profils des membres, leurs retours et leur suivi de poids. Chaque élément est rattaché à un membre.
- **La bibliothèque commune** (plus de 1000 recettes) et les données nutritionnelles des ingrédients sont livrées avec le site. Elles sont donc lisibles par tous, disponibles hors ligne et ne coûtent rien en base.

## 5. Tests

- `npm test` : tests unitaires (domaine).
- `npm run test:e2e` : scénarios de bout en bout dans un vrai navigateur au format téléphone, avec un faux Supabase en mémoire (`e2e/mock-supabase.mjs`). Ils couvrent :
  - le foyer partagé entre deux téléphones ;
  - la liste cochée en direct ;
  - le mode hors ligne ;
  - la reprise de l'ancienne sauvegarde.
