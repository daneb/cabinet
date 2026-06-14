#!/usr/bin/env bash
# Usage: ./scripts/release.sh [patch|minor|major|x.y.z]
# Bumps version, commits, tags, and creates a GitHub draft release with
# auto-generated notes. The CI workflow builds and attaches the DMG/deb/AppImage.
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────

die()  { echo "error: $*" >&2; exit 1; }
info() { echo "▸ $*"; }

require() {
  for cmd in "$@"; do
    command -v "$cmd" &>/dev/null || die "'$cmd' not found — please install it"
  done
}

# ── pre-flight ────────────────────────────────────────────────────────────────

require git gh node jq

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

[[ -f package.json ]] || die "package.json not found"

# Must be on master
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "master" ]] || die "must be on master (currently on '$BRANCH')"

# Working tree must be clean (untracked files are ignored)
[[ -z "$(git status --porcelain | grep -v '^??')" ]] || die "working tree is not clean — commit or stash first"

# Must be in sync with remote
git fetch origin master --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/master)"
[[ "$LOCAL" == "$REMOTE" ]] || die "local master is not in sync with origin/master — push or pull first"

# gh must be authenticated
gh auth status --hostname github.com &>/dev/null || die "gh is not authenticated — run 'gh auth login'"

# ── version bump ──────────────────────────────────────────────────────────────

BUMP="${1:-patch}"
CURRENT="$(node -p "require('./package.json').version")"

bump_version() {
  local cur="$1" part="$2"
  IFS='.' read -r major minor patch <<< "$cur"
  case "$part" in
    major) echo "$((major+1)).0.0" ;;
    minor) echo "${major}.$((minor+1)).0" ;;
    patch) echo "${major}.${minor}.$((patch+1))" ;;
    *)
      # Treat as explicit version — validate format
      [[ "$part" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "invalid version '$part' — use patch|minor|major or x.y.z"
      echo "$part"
      ;;
  esac
}

NEW_VERSION="$(bump_version "$CURRENT" "$BUMP")"
TAG="v${NEW_VERSION}"

info "Bumping $CURRENT → $NEW_VERSION (tag: $TAG)"

# Confirm if not piped
if [[ -t 0 ]]; then
  read -rp "Continue? [y/N] " confirm
  [[ "$(echo "$confirm" | tr '[:upper:]' '[:lower:]')" == "y" ]] || { echo "Aborted."; exit 0; }
fi

# ── generate release notes ────────────────────────────────────────────────────

PREV_TAG="$(git describe --tags --abbrev=0 HEAD 2>/dev/null || echo "")"

# Extract a named section (## Heading) from a markdown file.
extract_section() {
  local file="$1" heading="$2"
  awk "/^## ${heading}/{found=1; next} found && /^## /{exit} found{print}" "$file"
}

generate_notes() {
  local prev="$1" new_ver="$2"
  local range repo_url
  range="${prev:+${prev}..}HEAD"
  repo_url="$(gh repo view --json url -q .url 2>/dev/null || echo "")"

  echo "## Cabinet ${new_ver}"
  echo ""

  # ── ADR sections (primary source) ─────────────────────────────────────────
  # Find ADR files added or modified since the previous tag.
  local adr_files
  if [[ -n "$prev" ]]; then
    adr_files="$(git diff --name-only "${prev}..HEAD" -- 'docs/adrs/[0-9]*.md' 2>/dev/null || true)"
  else
    adr_files="$(git ls-files 'docs/adrs/[0-9]*.md' 2>/dev/null || true)"
  fi

  if [[ -n "$adr_files" ]]; then
    echo "### Changes"
    echo ""
    while IFS= read -r adr; do
      [[ -f "$adr" ]] || continue
      # Pull the ADR title from the first # heading
      local title
      title="$(grep -m1 '^# ' "$adr" | sed 's/^# //' | sed 's/^ADR-[0-9]*: //')"

      local context decision
      context="$(extract_section "$adr" "Context" | sed '/^$/d' | head -5)"
      decision="$(extract_section "$adr" "Decision" | sed '/^$/d' | head -5)"

      echo "#### ${title}"
      if [[ -n "$context" ]]; then
        echo ""
        echo "$context"
      fi
      if [[ -n "$decision" ]]; then
        echo ""
        echo "$decision"
      fi
      echo ""
    done <<< "$adr_files"
  fi

  # ── Commit-based fallback for fixes not covered by an ADR ─────────────────
  local fixes
  fixes="$(git log "$range" --oneline --no-merges | grep -E '^[a-f0-9]+ fix(\(.+\))?:' || true)"

  if [[ -n "$fixes" ]]; then
    echo "### Bug fixes"
    echo ""
    while IFS= read -r line; do
      local msg="${line#* }"
      msg="$(echo "$msg" | sed 's/^[a-z]*([^)]*): //' | sed 's/^[a-z]*: //')"
      echo "- $msg"
    done <<< "$fixes"
    echo ""
  fi

  # ── Screenshot ─────────────────────────────────────────────────────────────
  if [[ -f "assets/screenshot.png" && -n "$repo_url" ]]; then
    local raw_url="${repo_url/github.com/raw.githubusercontent.com}/master/assets/screenshot.png"
    echo "---"
    echo ""
    echo "![Cabinet ${new_ver}](${raw_url})"
    echo ""
  fi

  # ── Full changelog link ────────────────────────────────────────────────────
  if [[ -n "$prev" && -n "$repo_url" ]]; then
    echo "**Full changelog**: ${repo_url}/compare/${prev}...${TAG}"
  fi
}

NOTES="$(generate_notes "$PREV_TAG" "$NEW_VERSION")"

# ── apply version bump ────────────────────────────────────────────────────────

info "Updating package.json"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${NEW_VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

git add package.json
git commit -m "chore: bump version to ${NEW_VERSION}"

# ── tag and push ──────────────────────────────────────────────────────────────

info "Tagging $TAG"
git tag "$TAG"

info "Pushing master + tag"
git push origin master
git push origin "$TAG"

# ── create draft release ──────────────────────────────────────────────────────

info "Creating draft release $TAG on GitHub"
gh release create "$TAG" \
  --draft \
  --title "$TAG" \
  --notes "$NOTES" \
  --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)"

info "Done — CI will build and attach the DMG, deb, and AppImage, then publish."
echo ""
echo "  Release: $(gh repo view --json url -q .url)/releases/tag/${TAG}"
