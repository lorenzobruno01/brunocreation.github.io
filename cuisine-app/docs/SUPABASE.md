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

Si l'appli indique « Le serveur ne trouve pas les tables … », exécutez `supabase/reparer-tables-partagees.sql`. Ce script recrée les tables partagées manquantes et peut être relancé sans risque.

Tant que la seconde migration n'est pas exécutée, l'appli continue en « ancien mode » (une copie par compte) et le signale dans **Mon compte**. Dès qu'elle l'est, chaque appareil bascule automatiquement à sa prochaine connexion. Le foyer est créé, et l'ancienne sauvegarde y est reprise.

## 3. Connexion par e-mail

**Authentication → Sign In / Providers → Email** :

- **Confirm email** : désactivé conseillé, pour que le compte soit utilisable tout de suite.
- **Lien magique** (connexion sans mot de passe) : rien à activer, il fonctionne avec le fournisseur Email.

**Authentication → URL Configuration** :

- **Site URL** : `https://lorenzobruno01.github.io/brunocreation.github.io/cuisine/`
- **Redirect URLs** : ajoutez la même adresse. Les liens magiques et les liens « mot de passe oublié » y reviennent.

**Code à 6 chiffres dans l'e-mail (pour l'appli installée sur l'écran d'accueil)** : sur iPhone, un lien reçu par e-mail s'ouvre dans Safari, pas dans l'appli installée. Pour pouvoir recopier un code à la place :

1. Allez dans **Authentication → Emails → Templates**, puis ouvrez le modèle **Magic Link**.
2. Remplacez son contenu par :

   ```html
   <h2>Connexion à Notre Cuisine</h2>
   <p>Votre code : <strong style="font-size:24px;letter-spacing:4px">{{ .Token }}</strong></p>
   <p>Ou touchez ce lien depuis le navigateur : <a href="{{ .ConfirmationURL }}">me connecter</a></p>
   ```

3. Faites de même pour le modèle **Confirm signup**, avec le même texte.

Une fois connecté, chacun peut aussi choisir un mot de passe dans **Mon compte**.

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

## 6. Options facultatives (désactivées par défaut)

Tout fonctionne sans elles, gratuitement. Elles ne mettent **aucun secret dans le navigateur** : les clés restent dans des fonctions serveur Supabase (Edge Functions).

### Préparation commune

1. Exécutez `supabase/migrations/20261007000000_options.sql` dans le SQL Editor. Il crée le quota de l'assistant et le coffre des jetons Strava, invisibles depuis le navigateur.
2. Installez l'outil Supabase sur un ordinateur (`npm i -g supabase`), puis lancez `supabase login` et `supabase link --project-ref qjtlbelxragbagfoncrh`.

### Assistant IA (payant : facturé par Anthropic à l'usage)

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-…   # jamais dans le code ni dans le site
supabase secrets set AI_DAILY_LIMIT=10            # questions par personne et par jour
# facultatif : supabase secrets set ANTHROPIC_MODEL=claude-haiku-4-5-20251001
supabase functions deploy assistant
```

Construisez ensuite le site avec `VITE_FEATURE_AI=1`. Le bouton « Demander à l'assistant » apparaît sous les demandes de l'accueil, pour les personnes connectées.

Sans cette option, les demandes (« combler mon manque de fer », « une recette pour deux ce soir en 30 min », « utiliser ce qui doit partir vite »…) sont traitées sur l'appareil, sans IA (`src/domain/requests.ts`).

### Strava

1. Créez une application sur https://www.strava.com/settings/api. Dans « Authorization Callback Domain », indiquez `lorenzobruno01.github.io`.
2. Enregistrez les identifiants côté serveur, puis déployez la fonction :

   ```bash
   supabase secrets set STRAVA_CLIENT_ID=12345 STRAVA_CLIENT_SECRET=…
   supabase functions deploy strava
   ```

3. Construisez le site avec `VITE_FEATURE_STRAVA=1` et `VITE_STRAVA_CLIENT_ID=12345`. L'identifiant est public, le secret ne l'est pas.

Le bouton « Importer mes séances depuis Strava » apparaît dans le profil (Activité et sport). Il résume les 4 dernières semaines (séances par semaine, durée, type, jours habituels) et ne modifie le profil qu'après accord.

### Connexion avec Google

1. Dans **Authentication → Sign In / Providers → Google**, collez l'identifiant OAuth créé dans Google Cloud Console. Son URI de redirection autorisée est celle affichée par Supabase.
2. Construisez le site avec `VITE_FEATURE_GOOGLE=1`.
