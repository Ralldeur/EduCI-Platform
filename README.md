# EduCI — squelette microservices (Phase 0 + Phase 1)

Structure inspirée de `yeredon-ai`, réduite à l'essentiel et en Node.js/Next.js
au lieu de Java Spring Boot / Angular. Voir `plan-architecture-microservices.md`
pour le plan complet phase par phase.

## État actuel

**Phase 0 (fondations)** : squelette Docker Compose, tous les services démarrent.

**Phase 1 (Gateway + Keycloak + auth) — fait :**
- `gateway/` — proxy Express, **validation JWT réelle** (`src/auth.js`, vérifie
  la signature via le JWKS Keycloak), transmet l'identité aux services en aval
  via headers internes (`x-user-id`, `x-user-email`, `x-user-roles`).
- `auth-service/` — endpoints `POST /profile/sync` et `GET /profile/:userId`
  pour le profil applicatif (niveau, série BAC), stocké dans `auth_user_profiles`
  (table dans la base Postgres partagée).
- `keycloak/Dockerfile` — image Keycloak avec le **provider bcrypt** ajouté,
  pour importer les comptes existants sans reset password.
- `frontend/scripts/migrate-users-to-keycloak.mjs` — migration one-shot des
  comptes Prisma existants vers Keycloak (hash bcrypt préservé).

**Phase 3 (ml-service — priorisé avant la Phase 2 chat-service) — fait :**
- `ml-service/rag/pipeline.py` — embeddings via Ollama (`nomic-embed-text`),
  découpage en chunks, ingestion et recherche dans Qdrant (collection
  `curriculum_educi`, créée automatiquement au démarrage).
- `ml-service/rag/extract.py` — extraction de texte depuis PDF/DOCX/texte brut.
- `POST /lessons/ingest` — ingère un cours ou un exercice (`docType`
  obligatoire : `"cours"` ou `"exercice"`).
- `POST /rag/search` — recherche RAG filtrable par matière, niveau, et
  **`docType`** — c'est ce filtre qui garantit que les exercices ne
  remontent jamais dans le contexte d'une explication de cours, et
  inversement (règle produit non négociable, voir plan §Phase 3).
- `scripts/bootstrap-ingest.sh` — ingère automatiquement `BDD/<matière>/cours/`
  et `BDD/<matière>/exercices/` au démarrage, avec `docType` dérivé du dossier.

**Pas encore fait :**
- `chat-service/` — Node/Express, vide (Phase 2 : extraction depuis le
  monolithe Next.js, puis branchement sur `POST /rag/search` pour ancrer
  les réponses sur les cours/exercices ingérés)
- `payroll-service/` — pas encore créé, reporté (Phase 5)
- `frontend/` — code applicatif Next.js pas encore déplacé ici

## Démarrer

```bash
cp .env.example .env
docker compose up -d
```

Vérifier que chaque service répond :

```bash
curl http://localhost:8000/health   # gateway
curl http://localhost:8081/health   # auth-service
curl http://localhost:8082/health   # chat-service
curl http://localhost:8086/health   # ml-service
```

Keycloak : http://localhost:8080 (admin/admin), realm `educi` déjà importé.
Comptes de démo : `admin.demo / admin123`, `eleve.demo / eleve123`.

⚠️ Le service `frontend` ne démarrera pas tant que son dossier est vide —
voir `frontend/README.md` pour la suite.

## Tester la Phase 1

1. Récupérer un token depuis Keycloak (compte de démo) :
   ```bash
   curl -X POST http://localhost:8080/realms/educi/protocol/openid-connect/token \
     -d client_id=educi-frontend -d grant_type=password \
     -d username=eleve.demo -d password=eleve123
   ```
2. Appeler un service protégé via le gateway avec ce token :
   ```bash
   curl -X POST http://localhost:8000/api/auth/profile/sync \
     -H "Authorization: Bearer <access_token>" \
     -H "Content-Type: application/json" \
     -d '{"gradeLevel": "Terminale D", "bacSeries": "D"}'
   ```
   Sans token (ou token invalide) → `401`. Avec un bon token → le profil est créé/mis à jour.
3. Une fois le code Next.js déplacé dans `frontend/`, lancer la migration des
   comptes existants (voir `frontend/README.md`).

## Tester la Phase 3 (RAG)

1. Déposer un fichier de test :
   ```bash
   mkdir -p BDD/maths/cours
   echo "Une limite décrit le comportement d'une fonction..." > BDD/maths/cours/limites.md
   docker compose up -d --build
   ```
   Le conteneur `bootstrap` ingère automatiquement ce fichier au démarrage.
2. Vérifier la recherche RAG directement (sans passer par chat-service, qui n'existe pas encore) :
   ```bash
   curl -X POST http://localhost:8000/api/ml/rag/search \
     -H "Authorization: Bearer <access_token>" \
     -H "Content-Type: application/json" \
     -d '{"query": "Comment calculer une limite ?", "subject": "maths", "docType": "cours", "topK": 3}'
   ```

## Prochaine étape

Phase 2 : extraction de `/api/chat` et `/api/conversations` du monolithe
Next.js vers `chat-service`.
