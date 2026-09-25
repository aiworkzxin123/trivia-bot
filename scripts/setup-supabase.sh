#!/usr/bin/env bash
# Creates and configures the Supabase project for Trivia Bot multiplayer, then
# points the GitHub Pages build at it. Safe to re-run: it reuses an existing project.
#
# Before running: sign in once with   npx supabase login
#
# Usage:
#   scripts/setup-supabase.sh                  # creates a project in REGION (default us-east-1)
#   REGION=ap-southeast-1 scripts/setup-supabase.sh
#   PROJECT_REF=abcd... scripts/setup-supabase.sh   # use a project you already made
set -euo pipefail
cd "$(dirname "$0")/.."

SB="npx --yes supabase"
NAME="trivia-bot"
REGION="${REGION:-us-east-1}"
PASSWORD_FILE="supabase/.db-password"
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(($1)??'')})"; }

step() { printf '\n==> %s\n' "$1"; }

step "Checking you're signed in to Supabase"
if ! $SB projects list -o json >/dev/null 2>&1; then
  echo "Not signed in. Run: npx supabase login   and then run this script again."
  exit 1
fi

if [ -f "$PASSWORD_FILE" ]; then
  DB_PASSWORD="$(cat "$PASSWORD_FILE")"
else
  DB_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
  printf '%s' "$DB_PASSWORD" > "$PASSWORD_FILE"
fi

if [ -z "${PROJECT_REF:-}" ]; then
  PROJECT_REF="$($SB projects list -o json | json "j.find(p=>p.name==='$NAME')?.id ?? j.find(p=>p.name==='$NAME')?.ref")"
fi

if [ -z "$PROJECT_REF" ]; then
  step "Creating project '$NAME' in $REGION"
  ORG_ID="${ORG_ID:-$($SB orgs list -o json | json "j[0]?.id")}"
  if [ -z "$ORG_ID" ]; then echo "No Supabase organization found. Create one at https://supabase.com/dashboard first."; exit 1; fi
  PROJECT_REF="$($SB projects create "$NAME" --org-id "$ORG_ID" --region "$REGION" --db-password "$DB_PASSWORD" -o json | json "j.id ?? j.ref")"
fi
echo "Project ref: $PROJECT_REF"

step "Waiting for the project to be ready (a new project takes 1-3 minutes)"
for _ in $(seq 1 60); do
  STATUS="$($SB projects list -o json | json "j.find(p=>(p.id??p.ref)==='$PROJECT_REF')?.status")"
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  printf '.'; sleep 5
done
echo " $STATUS"

step "Linking this folder to the project"
$SB link --project-ref "$PROJECT_REF" -p "$DB_PASSWORD"

step "Creating the database tables and access rules"
$SB db push -p "$DB_PASSWORD" --yes

step "Applying auth settings (anonymous sign-in, sign-in rate limit)"
$SB config push --project-ref "$PROJECT_REF" --yes

step "Reading the API keys"
KEYS="$($SB projects api-keys --project-ref "$PROJECT_REF" --reveal -o json)"
PUBLIC_KEY="$(echo "$KEYS" | json "(j.find(k=>k.type==='publishable') ?? j.find(k=>k.name==='anon'))?.api_key")"
SECRET_KEY="$(echo "$KEYS" | json "(j.find(k=>k.type==='secret') ?? j.find(k=>k.name==='service_role'))?.api_key")"
SUPABASE_URL="https://$PROJECT_REF.supabase.co"

step "Deploying the game server function"
CLEANUP_KEY="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
$SB secrets set --project-ref "$PROJECT_REF" GAME_SERVICE_KEY="$SECRET_KEY" CLEANUP_KEY="$CLEANUP_KEY" >/dev/null
npm run -s sync:functions
$SB functions deploy game --project-ref "$PROJECT_REF" --use-api

step "Saving settings for local development (.env.local)"
printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' "$SUPABASE_URL" "$PUBLIC_KEY" > .env.local

step "Pointing the GitHub Pages build at the project"
gh variable set SUPABASE_URL --body "$SUPABASE_URL"
gh variable set SUPABASE_ANON_KEY --body "$PUBLIC_KEY"
gh secret set CLEANUP_KEY --body "$CLEANUP_KEY"
gh workflow run deploy.yml

step "Done"
echo "Multiplayer will be live at https://aiworkzxin123.github.io/trivia-bot/ in about a minute."
echo "Optional: add a Cloudflare Turnstile site key with  gh variable set TURNSTILE_SITE_KEY --body <key>"
echo "and enable Turnstile under Authentication > Attack protection in the Supabase dashboard."
