# EduCI 🇨🇮

Interface web d'EduCI, plateforme éducative intelligente pour les élèves
ivoiriens. Cette application Next.js est le point d'entrée utilisateur de la
plateforme : elle ne parle à aucune base de données ni à aucun fournisseur
d'IA en direct — toutes ses routes API relaient leurs appels au `gateway` du
projet, qui les distribue vers les microservices (`auth-service`,
`chat-service`, `ml-service`).

Pour l'architecture globale, le démarrage Docker complet et les autres
services, voir le [README à la racine du dépôt](../README.md). Ce document ne
couvre que ce qui est spécifique au frontend.

## Rôle dans l'architecture

```text
Navigateur
    |
    v
frontend :3000 (Next.js — cette application)
    |
    v
gateway :8000 (validation JWT, routage)
    |-------------------|-------------------|
    v                   v                   v
auth-service :8081  chat-service :8082  ml-service :8086
```

- **Authentification** : NextAuth avec le provider Keycloak (`src/lib/auth.ts`).
  Les tokens sont propagés vers le gateway pour chaque appel API.
- **Chat, conversations, exercices** : les routes sous `src/app/api/` sont de
  simples relais (`fetch` vers `GATEWAY_URL`) — voir par exemple
  `src/app/api/chat/route.ts`, qui transmet le flux SSE de `chat-service` sans
  le bufferiser côté Next.js.
- **Panel administrateur** : les routes sous `src/app/api/admin/` combinent
  des appels au gateway (conversations, stats, leçons) et des appels directs à
  l'API Admin Keycloak via `src/lib/keycloakAdmin.ts` (gestion des
  utilisateurs et de leurs rôles).

## Fonctionnalités

- 💬 **Chat intelligent** — questions/réponses en streaming, propulsées par `chat-service`
- 📝 **Exercices** — génération et correction étape par étape
- 🧠 **RAG** — réponses enrichies par le contenu pédagogique indexé (`ml-service`)
- 🎓 **Programme ivoirien** — contexte curriculaire (APC) injecté dans les prompts (`src/lib/curriculum.ts`)
- 🛠️ **Panel admin** (`/admin`, rôle `ROLE_ADMIN`) — utilisateurs, conversations, documents indexés

## Technologies

- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS 4
- NextAuth.js (provider Keycloak)
- react-markdown + KaTeX pour le rendu des réponses (formules, code)

## Structure du projet

```
src/
├── app/
│   ├── (auth)/          # Connexion (redirige vers Keycloak) / inscription
│   ├── chat/             # Interface de chat IA
│   ├── exercises/        # Générateur d'exercices
│   ├── admin/            # Panel d'administration (utilisateurs, leçons, conversations)
│   └── api/               # Routes API — relais vers le gateway (+ Keycloak Admin pour /admin/users)
├── components/
│   ├── chat/             # Composants du chat
│   ├── ui/                # Composants UI réutilisables
│   └── Providers.tsx      # Providers (Auth, Theme, Toast)
├── lib/
│   ├── auth.ts            # Configuration NextAuth (provider Keycloak)
│   ├── keycloakAdmin.ts   # Client pour l'API Admin Keycloak
│   ├── curriculum.ts      # Programme scolaire ivoirien (APC) utilisé dans les prompts
│   └── utils.ts           # Utilitaires
└── types/                 # Types TypeScript
```

## Développement local

Le frontend seul ne suffit pas à faire fonctionner l'application : il a
besoin du `gateway` et de Keycloak (au minimum) pour l'authentification et les
appels API. Le plus simple est de démarrer toute la plateforme avec Docker
Compose depuis la racine du dépôt (voir le README racine), puis d'itérer sur
le frontend en local :

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Variables d'environnement (voir `.env.example` pour le détail) :

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Configuration NextAuth |
| `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` / `KEYCLOAK_ISSUER` | Client Keycloak utilisé pour la connexion des utilisateurs |
| `KEYCLOAK_ADMIN_CLIENT_ID` / `KEYCLOAK_ADMIN_CLIENT_SECRET` | Compte de service dédié à l'API Admin Keycloak (page `/admin/users`), distinct du client ci-dessus |
| `GATEWAY_URL` | URL du gateway appelée côté serveur (nom du service Docker, ex. `http://gateway:8000`) |

## Build

```bash
npm run build
npm run start
```

En Docker, l'image est construite via `frontend/Dockerfile` (build Next.js en
mode `standalone`) et orchestrée par le `docker-compose.yml` à la racine du
dépôt.

## Licence

MIT
