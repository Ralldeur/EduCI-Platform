# EduCI

EduCI est une plateforme educative ivoirienne qui combine une interface web,
des microservices Node.js/Python et une IA capable de repondre a partir du
contenu scolaire ingere dans une base vectorielle.

Le projet est organise autour de trois responsabilites :

- authentifier les utilisateurs avec Keycloak ;
- centraliser les appels via un gateway protege par JWT ;
- fournir des explications et des exercices contextualises par le RAG.

## Architecture

```text
Navigateur
    |
    v
frontend :3000 (Next.js)
    |
    v
gateway :8000 (Express, validation JWT, routage)
    |-------------------|-------------------|
    v                   v                   v
auth-service :8081  chat-service :8082  ml-service :8086
    |                   |                   |
    +-------------------+-------------------+
                        |
              PostgreSQL :5432

Keycloak :8080  Qdrant :6333  Ollama :11434
```

### Services

| Service | Role | Technologie |
| --- | --- | --- |
| `frontend` | Interface web, authentification et routes serveur | Next.js 15, React 19, TypeScript |
| `gateway` | Point d'entree API, validation JWT et proxy | Node.js, Express |
| `auth-service` | Profils applicatifs des utilisateurs | Node.js, Express, PostgreSQL |
| `chat-service` | Conversations et reponses IA | Node.js, Express, Groq |
| `ml-service` | Extraction, embeddings et recherche RAG | Python, FastAPI, Ollama, Qdrant |
| `keycloak` | Gestion des identites et des roles | Keycloak |
| `postgres` | Base relationnelle partagee | PostgreSQL 16 |
| `qdrant` | Stockage vectoriel | Qdrant |
| `ollama` | Generation et embeddings locaux | Ollama |
| `bootstrap` | Ingestion initiale du contenu de `BDD/` | Alpine, shell |

## Prerequis

- Docker Desktop avec Docker Compose ;
- Git ;
- au moins 8 Go de memoire disponibles pour Docker, selon les modeles Ollama ;
- une cle Groq pour les reponses du `chat-service`.

## Demarrage avec Docker

Depuis la racine du projet :

```bash
cp .env.example .env
```

Sous PowerShell, utilisez plutot :

```powershell
Copy-Item .env.example .env
```

Renseignez ensuite `GROQ_API_KEY` dans `.env`, puis lancez la plateforme :

```bash
docker compose up -d --build
```

Au premier demarrage, Docker telecharge les images et Ollama recupere les
modeles `qwen2.5:1.5b` et `nomic-embed-text`. Le service `bootstrap` ingere
ensuite les fichiers places dans `BDD/<matiere>/cours/` et
`BDD/<matiere>/exercices/`.

URLs locales :

- application : http://localhost:3000
- gateway : http://localhost:8000
- Keycloak : http://localhost:8080
- Qdrant : http://localhost:6333/dashboard

Arreter les conteneurs sans supprimer les donnees :

```bash
docker compose down
```

Pour supprimer egalement les volumes PostgreSQL, Qdrant et Ollama :

```bash
docker compose down -v
```

## Configuration

Le fichier `.env` racine contient les variables utilisees par Compose :

```dotenv
GROQ_API_KEY=your_groq_api_key
```

Le frontend dispose de son propre exemple dans
`frontend/.env.example`. En execution Docker, ses appels passent par le
gateway. Les cles et secrets reels ne doivent jamais etre commites.

Identifiants de developpement fournis par le realm Keycloak :

- administration Keycloak : `admin / admin` ;
- utilisateur eleve : `eleve.demo / eleve123` ;
- utilisateur administrateur : `admin.demo / admin123`.

Ces identifiants sont reserves au developpement local et doivent etre changes
avant toute mise en production.

## Contenu pedagogique et RAG

Les documents sont classes par matiere et par type :

```text
BDD/
└── maths/
    ├── cours/
    └── exercices/
```

Le type du document (`cours` ou `exercice`) est conserve lors de l'ingestion.
La recherche RAG applique ce filtre pour eviter qu'un exercice soit utilise
comme contexte d'une explication de cours, ou inversement.

Ajouter un fichier dans `BDD/`, puis relancer l'ingestion :

```bash
docker compose up -d --force-recreate bootstrap
```

Le service expose notamment :

- `POST /api/ml/lessons/ingest` via le gateway ;
- `POST /api/ml/rag/search` via le gateway.

Ces routes necessitent un token Keycloak valide.

## Verification rapide

```bash
curl http://localhost:8000/health
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8086/health
```

Voir l'etat des conteneurs et les logs :

```bash
docker compose ps
docker compose logs -f gateway
docker compose logs -f chat-service
```

## Developpement local

Chaque service Node.js possede ses dependances et ses scripts independants.
Pour le frontend :

```bash
cd frontend
npm install
npm run dev
```

Scripts frontend utiles :

```bash
npm run build
npm run db:generate
npm run db:push
npm run db:studio
```

Pour le `chat-service` :

```bash
cd chat-service
npm install
npm run dev
```

Le developpement local complet necessite toujours les dependances Docker
(PostgreSQL, Keycloak, Qdrant et Ollama). Consultez aussi
`frontend/README.md` pour les details propres a l'interface web.

## Structure du depot

```text
auth-service/       Profils utilisateurs
chat-service/       Conversations et IA
frontend/           Application Next.js
gateway/            Proxy API et securite JWT
keycloak/           Image et realm Keycloak
ml-service/         Ingestion et recherche RAG
BDD/                Contenu pedagogique
scripts/            Scripts d'initialisation
docker-compose.yml  Orchestration locale
```

## Etat du projet

Les fondations microservices, l'authentification Keycloak, le gateway, le
frontend, le chat et le pipeline RAG sont en place. Les evolutions restantes
incluent notamment l'enrichissement des parcours pedagogiques, les paiements,
les statistiques d'apprentissage et une future application mobile.

## Securite

- ne commitez jamais `.env` ni une cle API ;
- utilisez uniquement des placeholders dans les fichiers `.env.example` ;
- revoquez immediatement toute cle exposee ;
- remplacez les mots de passe de developpement avant la production.

## Licence

MIT
