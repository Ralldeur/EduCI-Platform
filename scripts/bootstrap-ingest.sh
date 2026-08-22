#!/bin/sh
# ============================================================================
# Bootstrap automatique (exécuté par le conteneur "bootstrap" du compose).
#   1) crée la collection Qdrant "curriculum_educi" si absente (ml-service
#      la crée aussi à son démarrage — idempotent des deux côtés)
#   2) attend que le gateway + Keycloak soient prêts
#   3) ingère automatiquement les fichiers de BDD/<matière>/cours/ et
#      BDD/<matière>/exercices/ via ml-service (POST /api/ml/lessons/ingest)
# Idempotent : si la collection contient déjà des points, ne fait rien.
#
# Convention attendue pour /BDD (à monter en volume, voir docker-compose.yml) :
#   BDD/
#     maths/
#       cours/limites-continuite.pdf
#       exercices/limites-continuite-exercices.pdf
#     physique-chimie/
#       cours/...
# ============================================================================
set -u

QDRANT="http://qdrant:6333"
GATEWAY="http://gateway:8000"
KEYCLOAK="http://keycloak:8080"
KC_USER="admin.demo"
KC_PASS="admin123"
COLLECTION="curriculum_educi"

echo "🥾 [bootstrap] installation de curl..."
apk add --no-cache curl >/dev/null 2>&1 || { echo "❌ apk add curl a échoué"; exit 1; }

# 1. Idempotence — déjà indexé ?
count=$(curl -s "$QDRANT/collections/$COLLECTION" | grep -o '"points_count":[0-9]*' | head -1 | cut -d: -f2)
if [ -n "${count:-}" ] && [ "${count}" -gt 0 ] 2>/dev/null; then
  echo "✅ [bootstrap] curriculum déjà indexé ($count points) — rien à faire."
  exit 0
fi

# 2. Créer la collection si absente (768 dims = nomic-embed-text, distance Cosine)
if ! curl -sf "$QDRANT/collections/$COLLECTION" >/dev/null 2>&1; then
  echo "📦 [bootstrap] création de la collection $COLLECTION (768 dims, Cosine)..."
  curl -s -X PUT "$QDRANT/collections/$COLLECTION" \
    -H 'Content-Type: application/json' \
    -d '{"vectors":{"size":768,"distance":"Cosine"}}' >/dev/null
fi

# 3. Attendre que le gateway soit UP
echo "⏳ [bootstrap] attente du gateway..."
i=0
until curl -sf "$GATEWAY/health" 2>/dev/null | grep -q '"status":"UP"'; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "❌ gateway indisponible après 5 min"; exit 1; }
  sleep 5
done

# 4. Obtenir un token Keycloak (retry le temps que le realm soit importé)
echo "🔑 [bootstrap] login Keycloak ($KC_USER)..."
TOKEN=""
i=0
while [ -z "$TOKEN" ]; do
  TOKEN=$(curl -s -X POST "$KEYCLOAK/realms/educi/protocol/openid-connect/token" \
    -d "client_id=educi-frontend" -d "grant_type=password" \
    -d "username=$KC_USER" -d "password=$KC_PASS" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  [ -n "$TOKEN" ] && break
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "❌ login Keycloak impossible après 5 min"; exit 1; }
  sleep 5
done
echo "✅ [bootstrap] token obtenu (len=${#TOKEN})"

# 5. Ingérer chaque fichier de /BDD, avec docType dérivé de la structure de
#    dossiers : BDD/<matière>/cours/... ou BDD/<matière>/exercices/...
#    (défaut "cours" si la structure ne suit pas cette convention).
#    Endpoint : POST /api/ml/lessons/ingest (subject, gradeLevel, docType, title)
if [ ! -d /BDD ]; then
  echo "ℹ️  [bootstrap] pas de dossier /BDD monté — rien à ingérer pour l'instant."
  exit 0
fi

total=0; ok=0
for f in $(find /BDD -type f \( -name '*.pdf' -o -name '*.md' -o -name '*.docx' -o -name '*.txt' \) 2>/dev/null | sort); do
  total=$((total + 1))
  rel="${f#/BDD/}"
  subject=$(echo "$rel" | cut -d/ -f1)
  segment2=$(echo "$rel" | cut -d/ -f2)
  case "$segment2" in
    cours) docType="cours" ;;
    exercices) docType="exercice" ;;
    *) docType="cours" ;;
  esac
  name=$(basename "$f")
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 300 -X POST "$GATEWAY/api/ml/lessons/ingest" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$f" -F "subject=$subject" -F "docType=$docType")
  if [ "$code" = "200" ]; then echo "  ✅ $name → $subject/$docType"; ok=$((ok + 1)); else echo "  ⏭️  $name (HTTP $code)"; fi
done

echo "📊 [bootstrap] $ok/$total documents ingérés."
