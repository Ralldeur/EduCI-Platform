# Keycloak — realm `educi`

## ⚠️ Comptes de démo à neutraliser avant toute mise en production

`realm-export.json` définit deux comptes applicatifs avec un mot de passe en
clair (Keycloak les hashe à l'import, mais la **source** dans ce fichier est
en clair) :

- `eleve.demo` / `eleve123` (`ROLE_STUDENT`)
- `admin.demo` / `admin123` (`ROLE_ADMIN`)

Ce fichier est suivi par git — ces identifiants sont donc **publics dans
l'historique**, au même titre qu'un secret committé (voir audit sécurité).
Tant que le realm importé par `docker-compose.yml` reste celui-ci, ces
comptes existent avec ces mots de passe exacts, y compris s'ils sont un jour
retirés d'une future version de ce fichier (l'ancien commit reste
consultable).

**Volontairement non modifié pour l'instant** : ces comptes servent au
développement/tests en cours (voir sessions précédentes). Ne pas y toucher
sur l'environnement de dev actif tant qu'ils sont utilisés.

### Avant un vrai déploiement (prod, staging exposé, démo publique…)

Choisir UNE des options suivantes — ne pas se contenter d'un mot de passe
"changé mais deviné" :

**Option A — realm de prod séparé (recommandé)**
Ne pas importer `realm-export.json` tel quel en prod. Exporter un realm
distinct (`realm-export.prod.json` par ex.) sans la section `users` liée à
`eleve.demo`/`admin.demo`, ou avec des comptes de test différents et propres
à cet environnement. C'est l'option la plus sûre : aucune ambiguïté possible
entre "compte de dev qui traîne" et "vrai compte".

**Option B — retirer les entrées du fichier actuel**
Dans `realm-export.json`, repérer dans le tableau `users` les objets dont
`username` vaut `eleve.demo` ou `admin.demo`, et les supprimer entièrement
(objet complet, y compris leur bloc `credentials`). Redémarrer Keycloak avec
`--import-realm` ne les recréera plus. **Attention** : si le realm a déjà été
importé une fois sur l'instance cible, retirer l'entrée du JSON ne supprime
PAS le compte déjà créé en base — il faut aussi le supprimer depuis la
console admin Keycloak (Users → eleve.demo/admin.demo → Delete), ou
repartir d'un volume Postgres/Keycloak vierge.

**Option C — désactiver sans supprimer (rapide, temporaire)**
Depuis la console admin Keycloak (`/admin`, realm `educi` → Users) : ouvrir
`eleve.demo` et `admin.demo`, décocher "Enabled". Le compte devient inutilisable
sans supprimer l'historique/les données liées. À utiliser en dépannage
rapide, pas comme solution définitive — le mot de passe committé reste
public et pourrait être réactivé.

Dans les trois cas, si l'un de ces comptes a servi à autre chose que du test
(conversations réelles, documents ingérés en son nom...), traiter ces
données selon la politique de confidentialité applicable avant suppression.

### Compte admin Keycloak (realm `master`)

Couvert séparément dans `docker-compose.yml` (variables `KEYCLOAK_ADMIN` /
`KEYCLOAK_ADMIN_PASSWORD`, actuellement `admin`/`admin` par défaut) — voir
les commentaires à cet endroit, même logique de "committé en clair, à
changer avant prod, la variable seule ne suffit pas sur une instance déjà
initialisée".

## Secret du client `educi-admin-service`

Comme le mot de passe SMTP ci-dessous, ce secret est référencé dans
`realm-export.json` via `${vault.adminclientsecret}` (jamais en clair) — le
vrai secret vit dans `keycloak/vault/educi_adminclientsecret` (gitignored).
Un premier secret avait été committé en clair dans `realm-export.json`
(historique git jusqu'au commit qui a introduit la référence au vault) — il
a été considéré compromis et remplacé, exactement comme pour
`POSTGRES_PASSWORD`/`KEYCLOAK_ADMIN_PASSWORD` (voir audit sécurité et
docker-compose.yml). Le frontend doit avoir la même valeur dans
`KEYCLOAK_ADMIN_CLIENT_SECRET` (`.env`) — sans quoi l'API Admin Keycloak
(page `/admin/users`) échoue en authentification.

## SMTP (envoi d'e-mails — vérification de compte, mot de passe oublié)

Le realm `educi` est configuré pour envoyer ses e-mails (vérification
d'adresse à l'inscription, obligatoire — `verifyEmail: true` — et
réinitialisation de mot de passe) via le relais SMTP Brevo
(`smtp-relay.brevo.com:587`, STARTTLS).

### Le mot de passe SMTP passe par un vault, jamais par `realm-export.json`

`realm-export.json` est suivi par git — y écrire le mot de passe SMTP en
clair serait exactement le même problème que les comptes de démo plus haut.
À la place, le realm référence `${vault.smtppassword}` dans
`smtpServer.password`, résolu au runtime par le vault fichier de Keycloak :

- Le vrai mot de passe vit dans `keycloak/vault/educi_smtppassword`
  (gitignoré — voir `.gitignore` racine, jamais committé).
- Convention de nommage du vault fichier de Keycloak : `<realm>_<clé>`, donc
  `educi_smtppassword` pour la clé `smtppassword` référencée par
  `${vault.smtppassword}` — Keycloak préfixe automatiquement avec le nom du
  realm courant à la résolution.
- Activé via `--vault=file --vault-dir=/opt/keycloak/vault` dans la commande
  `keycloak` de `docker-compose.yml` (voir le commentaire à cet endroit pour
  le détail du piège rencontré : le `--vault=file` au *build* seul, dans
  `keycloak/Dockerfile`, ne suffisait pas de façon fiable — il faut aussi le
  repasser au *démarrage*).

### Pour changer le mot de passe SMTP (rotation, nouveau compte Brevo...)

1. Écraser le contenu de `keycloak/vault/educi_smtppassword` avec la
   nouvelle valeur — **sans retour à la ligne final** (le fichier est lu tel
   quel comme mot de passe littéral ; un `\n` en trop casse l'authentification
   SMTP). Vérifier avec `wc -c` que la taille correspond exactement à la
   longueur du mot de passe.
2. Redémarrer le conteneur Keycloak (`docker compose restart keycloak`) —
   le vault est relu au démarrage, pas à chaud.
3. Aucune autre étape : le realm référence déjà `${vault.smtppassword}`,
   pas la valeur elle-même.

### Pour ajouter un autre secret au vault (ex. futur provider tiers)

Créer `keycloak/vault/educi_<nomdelacle>` (même règle : pas de retour à la
ligne final), puis référencer `${vault.<nomdelacle>}` dans le champ de
config concerné via l'API Admin ou la console. Redémarrer Keycloak pour que
le nouveau fichier soit pris en compte.

## Langue des e-mails (vérification de compte, mot de passe oublié)

Par défaut, Keycloak envoie ces e-mails en anglais ("Verify Email", "Update
Your Account"...) même quand le reste de l'app est en français, car il
choisit la langue de l'e-mail via l'internationalisation du realm — pas via
la langue du navigateur de l'utilisateur.

Le thème email par défaut de Keycloak (`base`, hérité par `keycloak`, utilisé
ici puisque le realm ne définit pas de `emailTheme` custom) embarque déjà une
traduction française complète (`messages_fr.properties`, dans
`keycloak-themes-<version>.jar`) — donc pas besoin de thème email custom ni de
copier des `.ftl`. Il suffit d'activer l'internationalisation du realm et de
mettre le français par défaut :

```json
"internationalizationEnabled": true,
"supportedLocales": ["en", "fr"],
"defaultLocale": "fr"
```

Ces trois clés sont dans `realm-export.json` (import initial) et ont été
appliquées à l'instance déjà en base via l'API Admin (`PUT
/admin/realms/educi`) — comme `verifyEmail`/`smtpServer`, un changement realm
ne se ré-importe pas automatiquement sur un realm déjà existant (voir la note
"Realm 'educi' already exists. Import skipped" dans les logs au démarrage) :
sur une instance déjà démarrée, il faut le repasser via la console admin ou
l'API, `realm-export.json` seul ne suffit que pour un volume Postgres/Keycloak
vierge.

Sans locale utilisateur explicite (attribut `locale` sur le compte, ou
paramètre `kc_locale` dans l'URL de connexion), c'est ce `defaultLocale` du
realm qui est utilisé pour choisir la langue de l'e-mail — donc tous les
comptes reçoivent leurs e-mails en français par défaut, y compris ceux créés
avant ce changement.

### Débogage si l'envoi échoue avec `535 Authentication failed`

Dans l'ordre :

1. Vérifier que les identifiants sont valides indépendamment de Keycloak
   (ex. script Python `smtplib` direct contre `smtp-relay.brevo.com:587`
   avec STARTTLS) — élimine un vrai problème côté Brevo (compte suspendu,
   IP bloquée...).
2. `docker exec educi-keycloak /opt/keycloak/bin/kc.sh show-config | grep vault`
   — doit afficher `kc.vault = file`. Si absent, le provider de vault n'est
   pas actif malgré `--vault=file` dans la commande : redémarrer le
   conteneur suffit généralement (voir commentaire dans `docker-compose.yml`).
3. Vérifier que `keycloak/vault/educi_smtppassword` existe bien et que sa
   taille en octets correspond exactement à la longueur du mot de passe
   (`wc -c` — un octet de trop = retour à la ligne parasite).
4. Redémarrer Keycloak après toute modification du dossier `vault/` — les
   fichiers y sont relus au démarrage.
