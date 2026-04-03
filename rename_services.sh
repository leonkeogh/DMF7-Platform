#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Normalize service directories: strip leading svc[_-]*, underscores -> dashes, lowercase, sanitize.
for d in services/*; do
  [ -d "$d" ] || continue
  base=$(basename "$d")
  new=$(echo "$base" | sed -E 's/^svc[_-]*//; s/_/-/g; s/ //g' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g')
  if [ "$base" != "$new" ]; then
    target="services/$new"
    if [ -e "$target" ]; then
      i=1
      while [ -e "${target}-${i}" ]; do i=$((i+1)); done
      target="${target}-${i}"
    fi
    echo "Renaming services/$base -> ${target#services/}"
    git mv "services/$base" "$target"
  fi
done

# Commit & push if there are changes
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "chore: normalize service directory names (strip svc_/lowercase/normalize)"
  git push origin main
  echo "Renames committed and pushed."
else
  echo "No renames necessary."
fi
