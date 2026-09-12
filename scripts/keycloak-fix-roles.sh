#!/bin/sh
# ============================================================================
# Correctif automatique et idempotent (exécuté par le conteneur
# "keycloak-fix-roles" du compose, à CHAQUE démarrage — dev et prod).
#
# Pourquoi : l'API Account de Keycloak (GET/POST /realms/educi/account,
# utilisée par /settings — voir frontend/src/app/api/settings/route.ts) exige
# que l'utilisateur porte les rôles CLIENT "view-profile" et "manage-account"
# du client interne "account". Un compte créé via le flux normal
# d'inscription les reçoit automatiquement (rôle composite
# default-roles-<realm>, assigné implicitement à la création). Un compte créé
# en BLOC via l'import de keycloak/realm-export.json (eleve.demo, admin.demo)
# ne les reçoit PAS — voir keycloak/README.md, section "Rôle
# default-roles-educi manquant sur les comptes de démo" pour le détail complet
# de l'investigation.
#
# realm-export.json a été corrigé pour les FUTURS imports sur un volume
# vierge, mais --import-realm ne réimporte JAMAIS un realm déjà existant (log
# Keycloak "Realm 'educi' already exists. Import skipped.") — sur une
# instance déjà en service (dev local actuel, prod dès son premier
# déploiement), ce correctif ne s'appliquerait donc jamais tout seul. Ce
# script comble ce trou à chaque démarrage, sans étape manuelle à se
# souvenir de rejouer.
#
# Choix : rôles CLIENT directs plutôt que rôle composite ---------------------
# On vérifie/assigne directement "account:view-profile" et
# "account:manage-account" plutôt que le rôle composite
# "default-roles-<realm>" : c'est exactement ce que l'API Account vérifie
# (Auth.hasOneOfAppRole côté Keycloak lit resource_access.account.roles dans
# le token, peu importe la façon dont l'utilisateur a obtenu ces rôles), et
# c'est insensible à un futur renommage du realm (le nom du rôle composite en
# dépend : "default-roles-educi" -> "default-roles-<autre-nom>", alors que
# "account:view-profile"/"account:manage-account" ne changeraient pas).
#
# Portée -----------------------------------------------------------------
# TOUS les comptes réels du realm sont vérifiés (pas seulement
# eleve.demo/admin.demo) : le volume actuel est faible, le coût de tout
# vérifier est négligeable, et ça couvre aussi tout futur compte de
# démo/seed ajouté par le même mécanisme d'import JSON en bloc. Les comptes
# techniques (service-account-*, utilisés uniquement en client_credentials,
# jamais via l'API Account) sont ignorés.
#
# Idempotent : la vérification se fait sur les rôles EFFECTIFS (directs +
# hérités d'un composite comme default-roles-<realm>) — un compte qui les a
# déjà via ce chemin normal n'est jamais retouché, aucun appel d'écriture
# n'est fait pour lui.
# ============================================================================
set -u

KEYCLOAK="http://keycloak:8080"
REALM="educi"
CLIENT_ID="${KEYCLOAK_ADMIN_CLIENT_ID:-educi-admin-service}"
CLIENT_SECRET="${KEYCLOAK_ADMIN_CLIENT_SECRET:-}"

echo "🥾 [keycloak-fix-roles] installation de curl/jq..."
apk add --no-cache curl jq >/dev/null 2>&1 || { echo "❌ [keycloak-fix-roles] apk add curl/jq a échoué"; exit 1; }

if [ -z "$CLIENT_SECRET" ]; then
  echo "❌ [keycloak-fix-roles] KEYCLOAK_ADMIN_CLIENT_SECRET est vide — abandon."
  exit 1
fi

# 1. Obtenir un token du compte de service "educi-admin-service"
#    (client_credentials, rôles realm-management:manage-users +
#    realm-management:view-clients requis — voir keycloak/README.md,
#    sous-section "Permission view-clients requise", pour le pourquoi de ce
#    second rôle). Retry le temps que le realm soit importé, même logique
#    que scripts/bootstrap-ingest.sh.
echo "⏳ [keycloak-fix-roles] attente du realm '$REALM' et du compte de service..."
TOKEN=""
i=0
while [ -z "$TOKEN" ]; do
  TOKEN=$(curl -s -X POST "$KEYCLOAK/realms/$REALM/protocol/openid-connect/token" \
    -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET" \
    -d "grant_type=client_credentials" | jq -r '.access_token // empty')
  [ -n "$TOKEN" ] && break
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "❌ [keycloak-fix-roles] authentification impossible après 5 min"; exit 1; }
  sleep 5
done
echo "✅ [keycloak-fix-roles] token obtenu (len=${#TOKEN})"

api_get() {
  curl -s -X GET "$KEYCLOAK/admin/realms/$REALM$1" -H "Authorization: Bearer $TOKEN"
}

# 2. Résoudre le client interne "account" et les deux rôles requis.
ACCOUNT_CLIENT_ID=$(api_get "/clients?clientId=account" | jq -r '.[0].id // empty')
if [ -z "$ACCOUNT_CLIENT_ID" ]; then
  echo "❌ [keycloak-fix-roles] client 'account' introuvable dans le realm '$REALM'."
  exit 1
fi

NEEDED_ROLES_JSON=$(api_get "/clients/$ACCOUNT_CLIENT_ID/roles" \
  | jq -c '[.[] | select(.name == "view-profile" or .name == "manage-account")]')
NEEDED_COUNT=$(echo "$NEEDED_ROLES_JSON" | jq 'length')
if [ "$NEEDED_COUNT" -ne 2 ]; then
  echo "❌ [keycloak-fix-roles] rôles 'view-profile'/'manage-account' introuvables sur le client 'account' (trouvé $NEEDED_COUNT/2) — realm mal configuré ?"
  exit 1
fi

# 3. Vérifier/corriger chaque utilisateur réel du realm. Pagination inutile
#    tant que le volume tient sous une page (max=1000, largement suffisant
#    aujourd'hui) — à revoir si le realm dépasse un jour ce nombre de comptes.
USERS_JSON=$(api_get "/users?max=1000")
USER_COUNT=$(echo "$USERS_JSON" | jq 'length')
echo "🔎 [keycloak-fix-roles] $USER_COUNT compte(s) à vérifier."

echo "$USERS_JSON" | jq -c '.[]' | while IFS= read -r user; do
  USERNAME=$(echo "$user" | jq -r '.username')
  USER_ID=$(echo "$user" | jq -r '.id')

  case "$USERNAME" in
    service-account-*)
      continue
      ;;
  esac

  CURRENT_NAMES=$(api_get "/users/$USER_ID/role-mappings/clients/$ACCOUNT_CLIENT_ID/composite" \
    | jq -r '[.[].name] | join(",")')
  MISSING=$(echo "$NEEDED_ROLES_JSON" | jq -c --arg current "$CURRENT_NAMES" '
    ($current | split(",")) as $have | [.[] | . as $role | select(($have | index($role.name)) == null)]
  ')
  MISSING_COUNT=$(echo "$MISSING" | jq 'length')

  if [ "$MISSING_COUNT" -eq 0 ]; then
    echo "  ✅ $USERNAME : déjà bon (view-profile + manage-account présents)."
    continue
  fi

  MISSING_NAMES=$(echo "$MISSING" | jq -r '[.[].name] | join(", ")')
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$KEYCLOAK/admin/realms/$REALM/users/$USER_ID/role-mappings/clients/$ACCOUNT_CLIENT_ID" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$MISSING")
  if [ "$STATUS" = "204" ]; then
    echo "  🔧 $USERNAME : corrigé (ajout de $MISSING_NAMES)."
  else
    echo "  ❌ $USERNAME : échec de l'assignation ($MISSING_NAMES) — HTTP $STATUS."
  fi
done

echo "🏁 [keycloak-fix-roles] terminé."
