# frontend/

Ce dossier est vide pour l'instant. À faire pour finaliser la Phase 0 côté frontend :

1. Déplacer tout le contenu du projet Next.js existant (`ivoir-academie-devin-.../`)
   ici, dans `frontend/`.
2. Ajouter `output: "standalone"` dans `next.config.ts` (nécessaire pour le
   Dockerfile fourni).
3. Rien d'autre à changer pour l'instant côté code applicatif — les appels
   vers `/api/...` restent tels quels tant que la Phase 4 (repointer vers
   le Gateway) n'est pas commencée.

## Migration des comptes vers Keycloak (Phase 1)

Le script `scripts/migrate-users-to-keycloak.mjs` (déjà présent dans ce
dossier) lit les utilisateurs via le `@prisma/client` existant et les
recrée dans Keycloak avec leur hash bcrypt tel quel (pas de reset
password). Il nécessite Node 18+ (fetch natif) et que Keycloak tourne
avec le provider bcrypt (déjà dans `keycloak/Dockerfile`, cf. racine).

```bash
KEYCLOAK_URL=http://localhost:8080 \
KEYCLOAK_ADMIN_USER=admin \
KEYCLOAK_ADMIN_PASSWORD=admin \
node scripts/migrate-users-to-keycloak.mjs
```

Idempotent : peut être relancé sans risque, les comptes déjà migrés
(même email) sont ignorés. Vérifier ensuite qu'un compte migré peut se
connecter avec son mot de passe d'origine via Keycloak directement
(`/realms/educi/protocol/openid-connect/token`) avant de basculer le
frontend dessus.
