# Activer les comptes (gratuit, environ 5 minutes)

Les comptes utilisent **Supabase**, un service de base de données avec connexion par e-mail. L'**offre gratuite** suffit largement : 50 000 utilisateurs, 500 Mo de données, sans carte bancaire.

## 1. Créer le projet
1. Allez sur https://supabase.com et cliquez sur **Start your project**. Vous pouvez vous connecter avec votre compte GitHub.
2. Cliquez sur **New project** et remplissez :
   - **Name** : `notre-cuisine` ;
   - **Database password** : générez-en un et gardez-le de côté (il ne servira pas à l'appli) ;
   - **Region** : *West EU (Paris)* ou *Central EU (Frankfurt)*.
3. Cliquez sur **Create new project**, puis attendez environ 1 minute.

## 2. Créer les tables (migrations)

> Exécutez, dans l’ordre, les deux fichiers de `cuisine-app/supabase/migrations/` (voir aussi `docs/SUPABASE.md`). Le premier est l’ancienne table ci-dessous ; le second ajoute les foyers et la synchronisation partagée.

### Ancienne table (premier fichier)
1. Dans le menu de gauche, ouvrez **SQL Editor**, puis **New query**.
2. Collez tout le contenu du fichier `cuisine-app/supabase/migrations/20261005000000_user_data.sql`, puis faites de même avec `20261006000000_foyers.sql`.
3. Cliquez sur **Run**. Le message attendu est « Success. No rows returned ».

## 3. Régler la connexion par e-mail
1. Ouvrez **Authentication**, puis **Sign In / Providers**, puis **Email**.
   - Conseillé : désactivez **Confirm email**. Vos amis pourront alors utiliser l'appli dès la création de leur compte, sans attendre un e-mail. Les e-mails gratuits de Supabase sont limités à quelques-uns par heure.
2. Ouvrez **Authentication**, puis **URL Configuration** :
   - **Site URL** : `https://lorenzobruno01.github.io/brunocreation.github.io/cuisine/`
   - **Redirect URLs** : ajoutez la même adresse. Elle sert au lien « mot de passe oublié ».

## 4. Récupérer les deux valeurs à donner à Claude
1. Ouvrez **Project Settings**, puis **Data API**, et copiez la **Project URL** (sous la forme `https://abcdxyz.supabase.co`).
2. Ouvrez **Project Settings**, puis **API Keys**, et copiez la clé **Publishable** (`sb_publishable_…`). À défaut, prenez la clé **anon public** de l'onglet *Legacy API keys*.

Ces deux valeurs sont **publiques** : elles se retrouvent dans le code du site, comme pour toutes les applications Supabase. La protection vient des règles de sécurité de la table, créées à l'étape 2 : chaque personne ne peut lire et modifier **que sa propre ligne**.
⚠️ Ne donnez **jamais** la clé **secret** ni la clé **service_role**.

Les deux valeurs se placent dans `cuisine-app/src/cloud/config.ts`. Il faut ensuite reconstruire le site.

## Bon à savoir
- **Pause d'inactivité.** Un projet gratuit est mis en pause s'il n'a reçu **aucune requête pendant 7 jours**. Supabase envoie alors un e-mail, et on le relance d'un clic dans le tableau de bord. L'appli continue de marcher hors ligne pendant ce temps.
- **Hors ligne.** Tout est d'abord enregistré dans le téléphone. Les modifications partent vers le compte dès que le réseau revient.
- **Deux appareils modifiés en même temps hors ligne.** Les deux versions sont fusionnées. Les favoris, le planning et les recettes sont combinés ; pour les réglages, c'est la dernière version qui l'emporte.
- **Déconnexion.** Les données de l'appareil sont effacées, mais restent dans le compte. Une autre personne peut ensuite se connecter sur le même téléphone.
