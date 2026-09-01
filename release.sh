#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BUMP="${1:-patch}"
REMOTE_URL="https://github.com/endrisusanto/Sample-Management.git"
AUTO_COMMIT_MESSAGE="${AUTO_COMMIT_MESSAGE:-chore: auto commit before release}"

echo "🚀 ==============================================="
echo "🚀 SAMPLE MANAGEMENT - RELEASE & DEPLOY PIPELINE"
echo "🌐 Production URL: https://sample.endrisusanto.my.id/"
echo "📦 Target Repo: $REMOTE_URL"
echo "🚀 ==============================================="

# Ensure Git repository is initialized
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Initializing git repository..."
  git init
  git branch -M main
fi

# Ensure Remote URL is set correctly
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE_URL"
else
  git remote set-url origin "$REMOTE_URL"
fi

BRANCH="$(git branch --show-current || echo 'main')"
if [[ -z "$BRANCH" ]]; then
  BRANCH="main"
fi

# Sync Capacitor Android web assets
echo "📱 Syncing Capacitor Android assets..."
npx cap sync android || true

# Auto-commit any untracked changes
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Auto-committing current workspace changes..."
  git add -A
  git commit -m "$AUTO_COMMIT_MESSAGE" || true
fi

# Calculate Next Semantic Version
NEW_VERSION="$(node - "$BUMP" <<'NODE'
import fs from "node:fs";
const bump = process.argv[2];
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const current = String(pkg.version || "2.0.0");
const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) {
  throw new Error(`Unsupported current version: ${current}`);
}

let [major, minor, patch] = match.slice(1).map(Number);
if (/^\d+\.\d+\.\d+$/.test(bump)) {
  console.log(bump);
  process.exit(0);
}

switch (bump) {
  case "major":
    major += 1;
    minor = 0;
    patch = 0;
    break;
  case "minor":
    minor += 1;
    patch = 0;
    break;
  case "patch":
    patch += 1;
    break;
  default:
    throw new Error(`Use patch, minor, major, or an exact x.y.z version. Got: ${bump}`);
}

console.log(`${major}.${minor}.${patch}`);
NODE
)"

TAG="v${NEW_VERSION}"
echo "🏷️ Preparing Release Tag: $TAG"

# Update package.json version
node - "$NEW_VERSION" <<'NODE'
import fs from "node:fs";
const version = process.argv[2];

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = version;
fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
NODE

# Commit release tag
git add package.json
git commit -m "chore(release): ${TAG}" || true

if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  git tag -a "$TAG" -m "$TAG"
fi

echo "🚀 Pushing $BRANCH and $TAG to $REMOTE_URL..."
git push -u origin "HEAD:$BRANCH" "$TAG"

echo "🔄 Restarting local Docker container..."
docker compose restart || true

echo "🎉 Successfully Released $TAG to GitHub Actions!"
echo "🌐 Live Deployment: https://sample.endrisusanto.my.id/"
