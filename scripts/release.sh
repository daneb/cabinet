#!/usr/bin/env bash
# Usage:
#   ./scripts/release.sh [patch|minor|major|x.y.z]
#   ./scripts/release.sh --create-release <tag>   # retry release creation after auth fix
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────

die()  { echo "error: $*" >&2; exit 1; }
info() { echo "▸ $*"; }

require() {
  for cmd in "$@"; do
    command -v "$cmd" &>/dev/null || die "'$cmd' not found — please install it"
  done
}

require git gh node

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

[[ -f package.json ]] || die "package.json not found"

# ── --create-release recovery mode ───────────────────────────────────────────

if [[ "${1:-}" == "--create-release" ]]; then
  TAG="${2:-}"
  [[ -n "$TAG" ]] || die "usage: $0 --create-release <tag>"
  NEW_VERSION="${TAG#v}"
  PREV_TAG="$(git describe --tags --abbrev=0 "${TAG}^" 2>/dev/null || echo "")"

  # defined below — source the functions by re-entering this script isn't
  # practical, so we inline what's needed here.
  info "Generating release notes for $TAG"
  # (fall through to generate_notes defined later in the script)
  RECOVERY=1
else
  RECOVERY=0
fi

# ── pre-flight (full mode only) ───────────────────────────────────────────────

if [[ "$RECOVERY" == "0" ]]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  [[ "$BRANCH" == "master" ]] || die "must be on master (currently on '$BRANCH')"

  [[ -z "$(git status --porcelain | grep -v '^??')" ]] || die "working tree is not clean — commit or stash first"

  git fetch origin master --quiet
  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse origin/master)"
  [[ "$LOCAL" == "$REMOTE" ]] || die "local master is not in sync with origin/master — push or pull first"
fi

# gh must be authenticated and have repo scope
gh auth status --hostname github.com &>/dev/null || die "gh is not authenticated — run: gh auth login"
gh api user &>/dev/null || die "gh token cannot reach the API — run: gh auth refresh -s repo"
# Probe for release write access
REPO_NWO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
gh api "repos/${REPO_NWO}" --jq '.permissions.push' | grep -q true \
  || die "gh token lacks push permission on ${REPO_NWO} — run: gh auth refresh -s repo"

# ── version bump (full mode only) ────────────────────────────────────────────

if [[ "$RECOVERY" == "0" ]]; then
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
        [[ "$part" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "invalid version '$part' — use patch|minor|major or x.y.z"
        echo "$part"
        ;;
    esac
  }

  NEW_VERSION="$(bump_version "$CURRENT" "$BUMP")"
  TAG="v${NEW_VERSION}"
  PREV_TAG="$(git describe --tags --abbrev=0 HEAD 2>/dev/null || echo "")"

  info "Bumping $CURRENT → $NEW_VERSION (tag: $TAG)"

  if [[ -t 0 ]]; then
    read -rp "Continue? [y/N] " confirm
    [[ "$(echo "$confirm" | tr '[:upper:]' '[:lower:]')" == "y" ]] || { echo "Aborted."; exit 0; }
  fi
fi

# ── generate release notes ────────────────────────────────────────────────────

extract_section() {
  local file="$1" heading="$2"
  awk "/^## ${heading}/{found=1; next} found && /^## /{exit} found{print}" "$file"
}

generate_notes() {
  local prev="$1" new_ver="$2" tag="$3"
  local range repo_url
  range="${prev:+${prev}..}${tag}"
  repo_url="$(gh repo view --json url -q .url 2>/dev/null || echo "")"

  echo "## Cabinet ${new_ver}"
  echo ""

  local adr_files=""
  if [[ -n "$prev" ]]; then
    adr_files="$(git diff --name-only "${prev}..${tag}" -- 'docs/adrs/[0-9]*.md' 2>/dev/null || true)"
  else
    adr_files="$(git ls-files 'docs/adrs/[0-9]*.md' 2>/dev/null || true)"
  fi

  if [[ -n "$adr_files" ]]; then
    echo "### Changes"
    echo ""
    while IFS= read -r adr; do
      [[ -f "$adr" ]] || continue
      local title context decision
      title="$(grep -m1 '^# ' "$adr" | sed 's/^# //' | sed 's/^ADR-[0-9]*: //')"
      context="$(extract_section "$adr" "Context" | sed '/^$/d' | head -5)"
      decision="$(extract_section "$adr" "Decision" | sed '/^$/d' | head -5)"
      echo "#### ${title}"
      [[ -n "$context" ]] && { echo ""; echo "$context"; }
      [[ -n "$decision" ]] && { echo ""; echo "$decision"; }
      echo ""
    done <<< "$adr_files"
  fi

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

  if [[ -f "assets/screenshot.png" && -n "$repo_url" ]]; then
    local raw_url="${repo_url/github.com/raw.githubusercontent.com}/master/assets/screenshot.png"
    echo "---"; echo ""
    echo "![Cabinet ${new_ver}](${raw_url})"; echo ""
  fi

  if [[ -n "$prev" && -n "$repo_url" ]]; then
    echo "**Full changelog**: ${repo_url}/compare/${prev}...${tag}"
  fi
}

NOTES="$(generate_notes "$PREV_TAG" "$NEW_VERSION" "$TAG")"

# ── apply version bump, commit, tag, push (full mode only) ───────────────────

if [[ "$RECOVERY" == "0" ]]; then
  info "Updating package.json"
  node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${NEW_VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  git add package.json
  git commit -m "chore: bump version to ${NEW_VERSION}"

  info "Tagging $TAG"
  git tag "$TAG"

  info "Pushing master + tag"
  git push origin master
  git push origin "$TAG"
fi

# ── create draft release ──────────────────────────────────────────────────────

info "Creating draft release $TAG on GitHub"
gh release create "$TAG" \
  --draft \
  --title "$TAG" \
  --notes "$NOTES" \
  --repo "$REPO_NWO"

info "Done — CI will build and attach the DMG, deb, and AppImage, then publish."
echo ""
echo "  Release: $(gh repo view --json url -q .url)/releases/tag/${TAG}"
