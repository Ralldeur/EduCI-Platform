# HANDOFF — EduCI

Guide opérationnel pour reprendre le projet sans assistance. Aucune valeur
secrète dans ce fichier (il est suivi par git) — voir `SECRETS-TEMPORAIRE.md`
(hors dépôt, sur le Bureau) pour les vraies valeurs actuelles, à transférer
dans un gestionnaire de mots de passe puis à supprimer.

Dernière mise à jour : 2026-09-14.

---

## 0. Emplacement du projet

Le dépôt vit désormais à :

```
C:\Users\zanez\Projects\educi-platform
```

(déplacé le 2026-09-06 depuis `C:\Users\zanez\OneDrive\Documents\educi-platform`,
qui posait des problèmes de synchronisation — voir le piège documenté en
section 1). C'est ce chemin à utiliser pour rouvrir le projet dans VS Code,
PyCharm, ou tout autre éditeur. Le dépôt Git est intact (même historique,
mêmes remotes) — seul l'emplacement sur disque a changé.

---

## 1. Lancer le projet en local

Depuis la racine du dépôt (`docker compose` charge automatiquement le
fichier `.env` à la racine — voir section 5) :

```bash
docker compose up -d
```

Premier lancement : construit les images, tire le modèle Ollama
(`qwen2.5:1.5b`, `nomic-embed-text`), initialise Postgres/Keycloak/Qdrant.
Compter quelques minutes.

Accès une fois démarré :
- Frontend : http://localhost:3000
- Keycloak (console admin `/admin`) : http://localhost:8080
- `keycloak.local` doit résoudre vers `127.0.0.1` dans le fichier hosts
  (`C:\Windows\System32\drivers\etc\hosts` sous Windows) — sinon le login
  échoue. Entrée attendue : `127.0.0.1 keycloak.local`.

Comptes de test (realm `educi`, voir `keycloak/README.md`) :
- `admin.demo` / `admin123` (rôle admin)
- `eleve.demo` / `eleve123` (rôle élève)

### Lancer le frontend seul en mode dev (hors Docker, hot-reload)

Utile pour itérer rapidement sur l'UI sans reconstruire l'image Docker à
chaque changement :

```bash
docker stop educi-frontend   # libère le port 3000
cd frontend
npm run dev
```

Nécessite `frontend/.env` (distinct du `.env` racine — voir section 5) avec
`NEXTAUTH_URL=http://localhost:3000`. Ne pas oublier de relancer
`docker compose up -d` (ou juste le conteneur frontend) après pour revenir
en mode normal.

**Ancien piège (résolu le 2026-09-06)** : le dépôt vivait auparavant dans
`C:\Users\zanez\OneDrive\Documents\educi-platform`, un dossier synchronisé
OneDrive. OneDrive déclenchait par moments une boucle de recompilation
infinie du serveur dev Next.js (le watcher de fichiers réagissait aux
écritures de synchronisation OneDrive) et ralentissait nettement les builds
Docker (retries répétés côté `npm run build`, 3-5 min au lieu de 30-90s). Le
dépôt a été déplacé vers un chemin purement local (voir section 0 ci-dessous)
pour éliminer ce problème. Si `npm run dev` semble malgré tout bloqué en
compilation perpétuelle : tuer le process, supprimer `frontend/.next`,
relancer.

---

## 2. Se connecter au serveur de production (Contabo)

```bash
ssh -i ~/.ssh/educi_contabo root@167.86.116.14
```

- Clé privée : `~/.ssh/educi_contabo` (générée le 2026-09-04, dédiée à ce
  déploiement). Clé publique déjà dans `~/.ssh/authorized_keys` du serveur.
- L'authentification par mot de passe root reste active en plus de la clé
  (jamais désactivée — voir section 8, point en suspens).
- Code applicatif sur le serveur : `/opt/educi` (clone git de ce même
  dépôt, branche `main`).

---

## 3. Déployer un changement de code en production

1. En local : commit + push sur `main` comme d'habitude.
   ```bash
   git add ...
   git commit -m "..."
   git push origin main
   ```
2. Sur le serveur :
   ```bash
   ssh -i ~/.ssh/educi_contabo root@167.86.116.14
   cd /opt/educi
   git pull origin main
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build <service>
   ```
   Remplacer `<service>` par le nom du service touché (`frontend`,
   `chat-service`, `gateway`, etc.) pour ne reconstruire que lui — ou
   l'omettre pour tout reconstruire (plus long).
3. Vérifier que le service est reparti sainement :
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
   docker logs <container> --tail 30
   ```

**Toujours utiliser les deux fichiers compose ensemble en production**
(`docker-compose.yml` ET `docker-compose.prod.yml`) — le second contient les
overrides spécifiques à ce serveur (hostname Keycloak sur l'IP publique,
mode `start` au lieu de `start-dev`, etc.). Voir les commentaires en tête de
`docker-compose.prod.yml`.

**Si un fichier du vault Keycloak ou le `.env` change** (nouveau secret,
rotation) : ces fichiers ne sont PAS dans git (gitignored), un `git pull`
ne les met donc jamais à jour automatiquement. Il faut les transférer à la
main :
```bash
scp -i ~/.ssh/educi_contabo <fichier local> root@167.86.116.14:/opt/educi/<chemin>
```

---

## 4. Logs et redémarrage des services

Noms des conteneurs (préfixe `educi-`) : `frontend`, `gateway`,
`auth-service`, `chat-service`, `ml-service`, `keycloak`, `postgres`,
`qdrant`, `ollama`.

Voir les logs d'un service (local ou prod, même commande — se placer dans
le bon répertoire d'abord) :
```bash
docker logs educi-<service> --tail 50 -f    # -f pour suivre en direct
```

Redémarrer un service sans reconstruire (ex. après un changement de
config/env) :
```bash
docker compose restart <service>                                   # local
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart <service>  # prod
```

État de tous les services :
```bash
docker compose ps                                                   # local
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps  # prod
```

---

## 5. Emplacement des secrets (valeurs dans SECRETS-TEMPORAIRE.md, pas ici)

| Secret | Local (dev) | Production |
|---|---|---|
| `POSTGRES_PASSWORD` | `.env` (racine du dépôt) — absent = valeur par défaut faible `educi_admin_pwd` (acceptable en local uniquement) | `/opt/educi/.env` sur le serveur |
| `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` | `.env` (racine) — absent = `admin`/`admin` par défaut | `/opt/educi/.env` |
| `GROQ_API_KEY` | `.env` (racine) et `frontend/.env` n'en a pas besoin | `/opt/educi/.env` (même clé Groq réutilisée dev+prod) |
| `NEXTAUTH_SECRET` | `.env` (racine) ET `frontend/.env` (valeurs différentes possibles) | `/opt/educi/.env` |
| `KEYCLOAK_CLIENT_SECRET` | vide partout — client `educi-frontend` public (PKCE), pas de secret | vide |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | `.env` (racine) + doit correspondre au vault `keycloak/vault/educi_adminclientsecret` | `/opt/educi/.env` + `/opt/educi/keycloak/vault/educi_adminclientsecret` |
| Mot de passe SMTP (Brevo) | `keycloak/vault/educi_smtppassword` (jamais dans `realm-export.json`, référencé via `${vault.smtppassword}`) | `/opt/educi/keycloak/vault/educi_smtppassword` (copié depuis le local, même valeur) |
| Accès SSH serveur | — | clé privée `~/.ssh/educi_contabo` sur cette machine ; mot de passe root initial encore valide (voir SECRETS-TEMPORAIRE.md) |

Voir `keycloak/README.md` pour le détail du mécanisme de vault Keycloak
(convention de nommage, comment ajouter un nouveau secret).

**Piège à connaître** : changer `POSTGRES_PASSWORD` ou
`KEYCLOAK_ADMIN_PASSWORD` dans un `.env` ne suffit PAS sur une base déjà
initialisée — ces valeurs ne sont lues qu'à la création du volume Docker
(premier démarrage). Voir les commentaires dans `docker-compose.yml` pour
la procédure de rotation sur une instance déjà en service (`ALTER USER`
côté Postgres, changement depuis la console admin côté Keycloak).

---

## 6. Comptes tiers créés pendant le projet

Je n'ai pas créé ces comptes moi-même (sauf mention contraire) et je ne
peux donc pas garantir l'adresse e-mail exacte de chacun avec certitude —
à vérifier/compléter toi-même si besoin d'une récupération de mot de
passe :

| Service | Usage | E-mail probable | Certitude |
|---|---|---|---|
| GitHub | Dépôt `Ralldeur/EduCI-Platform` | `zanezana39@gmail.com` | Faible — le compte s'appelle "Ralldeur", l'e-mail de commit git est une adresse noreply GitHub, ne révèle pas l'e-mail d'inscription réel |
| Groq (API LLM, `chat-service`) | Génération des réponses IA | `zanezana39@gmail.com` | Faible — aucune trace de l'e-mail d'inscription dans le code, seulement la clé API |
| Brevo (relais SMTP, e-mails Keycloak) | Vérification de compte, mot de passe oublié | `zanezana39@gmail.com` | Moyenne — c'est l'adresse "from" configurée dans `keycloak/realm-export.json`, cohérent avec un compte Brevo sous cette adresse mais ne le prouve pas formellement |
| Contabo (serveur de production) | Hébergement VPS (167.86.116.14) | `zanezana39@gmail.com` | Faible — aucune trace dans le dépôt, tu as fourni les identifiants directement en conversation |
| Registrar de domaine (Namecheap ou autre) | — | — | **Aucun compte créé à ce jour** — domaine pas encore acheté (voir section 7) |

Si un de ces comptes a été créé avec une adresse différente, c'est
probablement `zanezana39@gmail.com` ou une autre adresse personnelle que
toi seul connais avec certitude.

---

## 7. Points en suspens / connus

- **Déploiement de la personnalisation par prénom (`/settings`)** : le rôle
  manquant sur les comptes importés en bloc (`eleve.demo`/`admin.demo`) est
  désormais corrigé automatiquement à chaque démarrage par le conteneur
  one-shot `keycloak-fix-roles` (voir `docker-compose.yml` et
  `keycloak/README.md`, section "Rôle `default-roles-educi` manquant sur les
  comptes de démo") — plus d'étape manuelle à rejouer pour ce point précis.
  **Une seule étape manuelle reste nécessaire au premier déploiement de ce
  changement en prod** : accorder le rôle `realm-management:view-clients`
  au compte de service `educi-admin-service` (commande dans
  `keycloak/README.md`, sous-section "Permission `view-clients` requise"),
  sans quoi `keycloak-fix-roles` échouera systématiquement à chaque
  démarrage de la stack (visible dans `docker logs
  educi-keycloak-fix-roles`), sans bloquer le reste des services (aucun
  autre service n'en dépend). N'affecte pas les vrais comptes élèves inscrits
  normalement, qui ont toujours eu ce qu'il faut par défaut.
- **Domaine et HTTPS** : pas de nom de domaine acheté (contrainte de
  paiement temporaire, voir conversation du 2026-09-04/05). Le serveur
  tourne en HTTP simple sur l'IP brute (`167.86.116.14`), avec accès
  restreint par pare-feu (`ufw`) à une seule IP autorisée
  (`102.67.250.25`, celle de l'auteur au moment du déploiement — **à
  vérifier/mettre à jour si elle a changé**, via
  `ufw allow from <IP> to any port 3000,8080 proto tcp` sur le serveur).
  Dès qu'un domaine est disponible : pointer son DNS vers l'IP du serveur,
  puis migrer `docker-compose.prod.yml` vers ce domaine + un reverse proxy
  (Caddy recommandé, gère Let's Encrypt automatiquement) — voir les
  commentaires `IP_TEMPORAIRE` dans ce fichier, qui listent précisément ce
  qui doit changer.
- **IP supplémentaires à autoriser** : trois IP sont désormais autorisées
  (`102.67.250.25`, `102.209.219.16` et `102.207.1.106`, ces deux
  dernières ajoutées le 2026-09-14 pour des testeurs de confiance). Si
  d'autres personnes doivent tester la plateforme, même procédure :
  `ufw allow from <IP> to any port 3000,8080 proto tcp` sur le serveur.
- **Incohérence `KEYCLOAK_ADMIN_CLIENT_SECRET` détectée le 2026-09-14** :
  la valeur dans `.env`/`frontend/.env` (dev local) ne correspond pas à
  celle du vault `keycloak/vault/educi_adminclientsecret`. La section 5
  dit qu'elles doivent être identiques — à vérifier laquelle est
  réellement utilisée par Keycloak et à resynchroniser si besoin (sinon
  risque d'échec d'authentification du service `educi-admin-service`,
  notamment pour `keycloak-fix-roles`, voir point ci-dessus).
- **Mot de passe root SSH** : toujours actif en plus de la clé. À changer
  ou désactiver (authentification par clé uniquement) une fois à l'aise
  avec l'accès par clé — voir SECRETS-TEMPORAIRE.md pour le mot de passe
  actuel.
- **Comptes de démo** (`eleve.demo`/`admin.demo`, mots de passe committés
  en clair dans `realm-export.json`) : acceptables pour les tests internes
  actuels, mais **à neutraliser avant toute ouverture publique réelle** —
  voir `keycloak/README.md` pour les 3 options possibles (realm de prod
  séparé, suppression, désactivation).
- **Point mineur KaTeX (`/exercises`, `/chat`)** : les formules
  mathématiques très larges (rares — une équation avec une longue
  annotation textuelle en plus, dans un conteneur très étroit type petit
  téléphone en mode portrait) peuvent encore nécessiter un défilement
  horizontal si même la réduction de police automatique (jusqu'à un
  plancher de 12px, pour rester lisible) ne suffit pas à les faire tenir.
  Compromis jugé raisonnable, pas un bug à corriger dans l'immédiat — voir
  `frontend/src/lib/markdown.ts` (`fitKatexDisplaysToWidth`).
- **Serveur local** : `POSTGRES_PASSWORD`/`KEYCLOAK_ADMIN_PASSWORD` non
  définis dans le `.env` racine → valeurs par défaut faibles utilisées
  (`educi_admin_pwd`, `admin`/`admin`). Sans risque tant que c'est
  local-only et non exposé, mais ne jamais copier ce `.env` tel quel vers
  un serveur exposé.
- **Session Keycloak locale instable observée** : pendant les sessions de
  travail du 2026-09-05/06, le rafraîchissement de token Keycloak a
  échoué fréquemment en local (`invalid_grant: Token is not active`) sans
  cause identifiée avec certitude (possiblement lié à l'horloge de la
  VM/du conteneur, ou à une durée de vie de refresh token très courte
  côté realm). Contournement systématique : se déconnecter puis se
  reconnecter (`/api/auth/signout` puis re-login). N'a pas été observé en
  production.

---

## 8. Repères utiles dans le dépôt

- `docker-compose.yml` — stack de base (dev local), très commenté (chaque
  choix de sécurité y est expliqué).
- `docker-compose.prod.yml` — overrides de production uniquement.
- `keycloak/README.md` — vault, comptes de démo, SMTP, i18n des e-mails.
- `frontend/DESIGN_SYSTEM.md` — palette, rayons, typographie ; toute
  nouvelle page/composant doit réutiliser ces tokens.
- `.env.example` — modèle commenté du `.env` racine (sans valeurs réelles).
- `cahier-des-charges-admin.md` — spécification du panel `/admin`.

---

## 9. Journal de session — 2026-09-14

Session consacrée au test en conditions réelles de la fonctionnalité
photo/vision (chat + correction d'exercices), à l'ouverture de la
plateforme à des testeurs de confiance, et à un premier recensement des
secrets. Trois bugs bloquants trouvés et corrigés en production :

- **`/exercises` — champ de réponse manquant pour les exercices non-QCM** :
  le backend renvoie `"options": []` au lieu d'omettre le champ pour les
  types autres que QCM (contrairement à sa propre consigne de prompt) ;
  le frontend traitait `[]` comme "vrai" et n'affichait donc ni le champ
  de réponse libre ni les options. Corrigé côté frontend avec des
  vérifications explicites `.length > 0` / `.length === 0`
  (`frontend/src/app/exercises/page.tsx`). Le backend n'a pas été touché
  (fix frontend suffisant et plus sûr).
- **Feedback de correction affichant du LaTeX/Markdown brut** (`$x$`,
  `\times`, etc. non rendus) : le texte de correction (feedback, points
  positifs, erreurs, conseils) n'utilisait pas le même pipeline de rendu
  que les questions/réponses. Corrigé en appliquant `ReactMarkdown` +
  KaTeX (mêmes plugins : `remarkGfm`, `remarkMath`, `rehypeRaw`,
  `rehypeSanitize`, `rehypeKatex`) à ces champs, dans
  `frontend/src/app/exercises/page.tsx`. Vérifié visuellement en prod
  après redéploiement.
- **Inscription totalement cassée** : `/register` était une ancienne page
  statique "contacte ton établissement" (décision du 23/08, obsolète
  depuis que l'auto-inscription Keycloak a été activée) qui ne
  redirigeait jamais vers le vrai formulaire. Bug repéré via une vidéo
  WhatsApp d'un testeur externe. Corrigé en deux temps :
  1. Réécriture de `frontend/src/app/(auth)/register/page.tsx` pour
     rediriger vers l'écran d'inscription natif de Keycloak
     (`/protocol/openid-connect/registrations`, mêmes paramètres que le
     login OAuth).
  2. Ajout de `export const dynamic = "force-dynamic"` sur cette page :
     sans ça, Next.js la pré-rendait en statique au `build` Docker, où
     les variables d'environnement (injectées seulement au runtime par
     docker-compose) valaient `undefined`, cassant l'URL de redirection.
  Flux complet vérifié en prod : inscription → e-mail de vérification
  Brevo → retour sur l'app. Un lien "Créer un compte" a aussi été ajouté
  sur `/login` (`frontend/src/app/(auth)/login/page.tsx`).
  **Non vérifié à 100%** : la réception réelle de l'e-mail de
  vérification côté boîte mail du testeur (seul maillon non confirmé en
  conditions réelles à ce jour).

Autres actions :
- IP d'un second testeur de confiance autorisée sur le pare-feu
  (`102.209.219.16`, voir section 7).
- Premier inventaire des secrets connus (dev local) rassemblé dans
  `Desktop\EduCI-Handoff\EduCI-secrets.csv`, prêt à importer dans un
  gestionnaire de mots de passe. Incohérence trouvée entre le
  `KEYCLOAK_ADMIN_CLIENT_SECRET` du `.env` et celui du vault (voir
  section 7) — à résoudre.
- **Reste à faire** : `SECRETS-TEMPORAIRE.md` introuvable (dossier
  `Desktop\EduCI-Handoff` vide à part le CSV ci-dessus — statut à
  clarifier : transféré puis supprimé comme prévu, ou perdu ?) ;
  contenu réel de `/opt/educi/.env` en production pas encore recensé
  (`cat /opt/educi/.env` sur le serveur) ; mots de passe des comptes
  tiers (GitHub, Groq, Brevo, Contabo, registrar) pas encore recensés.
