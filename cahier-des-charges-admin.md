# Cahier des charges — Page /admin

## Contexte

Le monolithe Next.js d'origine avait une zone `/admin` avec 4 fonctionnalités, toutes basées sur Prisma (base relationnelle locale) et un ancien pipeline de scraping web, abandonnés lors de la migration vers l'architecture microservices actuelle (gateway, auth-service, chat-service, ml-service, Keycloak, Qdrant/Ollama pour le RAG).

Il faut reconstruire `/admin` en s'appuyant sur les microservices existants, PAS sur Prisma.

## Fonctionnalités à construire

### 1. Page /admin (tableau de bord — stats)

Remplace `src/app/admin/page.tsx` du monolithe (actuellement copié tel quel depuis le monolithe, utilise encore l'ancien `/api/admin/stats` qui appelle Prisma — à refaire entièrement).

Stats à afficher, en les récupérant depuis plusieurs sources :
- Nombre d'utilisateurs total → API Admin Keycloak (voir section "Compte de service Keycloak" plus bas)
- Nombre de conversations et de messages → nouvelle route à ajouter dans chat-service, ex. `GET /admin/stats` (SELECT COUNT(*) sur chat_conversations et chat_messages)
- Nombre de documents indexés dans le RAG → interroger Qdrant directement (`GET http://qdrant:6333/collections/curriculum_educi`, champ `points_count`), soit via une nouvelle route dans ml-service (ex. `GET /admin/stats`) qui fait ce relais

### 2. Page /admin/users (liste des utilisateurs)

Remplace `src/app/admin/users/page.tsx`. Doit lister les utilisateurs Keycloak avec leurs rôles et attributs (grade_level, bac_series).

Comme l'identité vit maintenant dans Keycloak (pas dans une table Prisma locale), il faut appeler l'**API Admin de Keycloak** :
`GET http://keycloak:8080/admin/realms/educi/users`

Cette API nécessite un token d'accès obtenu via un **compte de service** (client confidentiel avec les droits admin appropriés), PAS le token de l'utilisateur connecté. Voir section dédiée ci-dessous.

Prévoir une route API frontend (`/api/admin/users`) qui:
1. Vérifie que l'utilisateur connecté a le rôle ROLE_ADMIN (via sa session/JWT)
2. Obtient un token de service Keycloak (client_credentials grant)
3. Appelle l'API Admin Keycloak pour lister les utilisateurs
4. Retourne les données formatées au frontend

### 3. Page /admin/lessons (ajout de leçon)

Remplace `src/app/admin/lessons/page.tsx`. L'ancien formulaire créait des enregistrements Prisma (Subject/Chapter/Lesson) — cette structure n'existe plus.

Nouveau formulaire : upload d'UN fichier (PDF, texte, docx) avec sélection de matière/niveau/type (cours ou exercice), qui appelle **directement l'endpoint d'ingestion RAG existant** de ml-service :
`POST http://ml-service:8086/lessons/ingest` (déjà fonctionnel, testé avec succès dans BDD/ — voir ml-service/app/main.py)

Il faut probablement une route proxy dans le frontend (`/api/admin/lessons`) qui relaie vers le gateway (`/api/ml/lessons/ingest`), avec vérification du rôle ROLE_ADMIN.

### 4. Scraping — SUPPRIMÉ, PAS À RECONSTRUIRE

La fonctionnalité de scraping web (Tavily, education.gouv.ci) est délibérément abandonnée. Retirer toute trace de `src/app/api/admin/scrape/route.ts` et de tout bouton "Scraper" dans l'UI. Ne pas la reconstruire sous aucune forme.

## Compte de service Keycloak (prérequis technique pour /admin/users)

Il faut créer un client Keycloak confidentiel dédié à l'administration (ex. `educi-admin-service`), avec :
- `serviceAccountsEnabled: true`
- Le rôle `realm-management` / `manage-users` (ou `view-users` a minima) attribué à son service account
- Un client secret à stocker dans les variables d'environnement du frontend (`KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET`)

Ce client est à ajouter dans `keycloak/realm-export.json`, dans la section `clients`, à côté de `educi-frontend` et `educi-backend` existants.

## Protection des routes /admin (contrôle d'accès)

Toutes les pages et routes API `/admin/*` doivent vérifier que `session.user.roles` contient `ROLE_ADMIN` (voir `src/lib/auth.ts`, le rôle est déjà exposé dans le JWT/session depuis la Phase 4). Rediriger vers `/chat` ou afficher une erreur 403 sinon. Le monolithe avait déjà cette logique dans `src/app/admin/layout.tsx` (`if (!session || session.user.role !== "ADMIN") return null`) — à adapter avec `session.user.roles.includes("ROLE_ADMIN")` (tableau, pas un champ singulier, cohérent avec le format Keycloak déjà en place).

## Fichiers concernés (rappel architecture actuelle)

- `chat-service/src/index.js` — ajouter route GET /admin/stats
- `ml-service/app/main.py` — ajouter route GET /admin/stats (comptage Qdrant)
- `gateway/src/index.js` — router /api/admin/* vers les bons services (nouveau préfixe à ajouter, actuellement seuls /api/auth, /api/chat, /api/ml existent)
- `keycloak/realm-export.json` — ajouter le client de service educi-admin-service
- `frontend/src/app/admin/page.tsx`, `admin/users/page.tsx`, `admin/lessons/page.tsx` — à réécrire
- `frontend/src/app/admin/layout.tsx` — corriger la vérification de rôle (roles array, pas role singulier)
- `frontend/src/app/api/admin/*` — nouvelles routes proxy à créer
- Variables d'environnement à ajouter : KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET (docker-compose.yml + .env)

## Ce qui existe déjà et qu'il ne faut PAS casser

- Toute la Phase 2/3/4 déjà fonctionnelle : chat, RAG, exercices, authentification Keycloak, gestion du refresh token
- Le realm Keycloak actuel (comptes eleve.demo, admin.demo, rôles ROLE_STUDENT/TEACHER/ADMIN déjà définis)
- docker-compose.yml : ne pas modifier les services existants au-delà des ajouts nécessaires
