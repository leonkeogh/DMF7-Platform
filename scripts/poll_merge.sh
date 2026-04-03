#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$HOME/DMF7-Platform"
LOG="/tmp/dmf7_poll_merge.log"
PR_NUM="${PR_NUM:-3}"
INTERVAL_SECS="${INTERVAL_SECS:-15}"
REPO="leonkeogh/DMF7-Platform"
cd "$REPO_ROOT" || { echo "$(date -u) ERROR: repo not found at $REPO_ROOT" | tee -a "$LOG"; exit 2; }
echo "$(date -u) Starting poll for PR#$PR_NUM" | tee -a "$LOG"
while true; do
  MERGEABLE=$(gh pr view "$PR_NUM" --json mergeable -q .mergeable 2>/dev/null || echo "UNKNOWN")
  echo "$(date -u) PR#$PR_NUM mergeable=$MERGEABLE" | tee -a "$LOG"
  SHA=$(gh pr view "$PR_NUM" --json headRefOid -q .headRefOid 2>/dev/null || echo "")
  if [ -n "$SHA" ] && [ "$SHA" != "null" ]; then
    STATE=$(gh api -H "Accept: application/vnd.github+json" /repos/"${REPO}"/commits/"${SHA}"/status -q .state 2>/dev/null || echo "unknown")
    echo "$(date -u) Commit $SHA status=$STATE" | tee -a "$LOG"
    if [ "$MERGEABLE" = "MERGEABLE" ] && [ "$STATE" = "success" ]; then
      echo "$(date -u) All checks OK — attempting merge PR#$PR_NUM" | tee -a "$LOG"
      if gh pr merge "$PR_NUM" --merge --delete-branch --repo "$REPO"; then
        echo "$(date -u) PR#$PR_NUM merged successfully." | tee -a "$LOG"
        exit 0
      else
        echo "$(date -u) Merge failed — opening PR for manual review." | tee -a "$LOG"
        gh pr view "$PR_NUM" --web || true
        exit 2
      fi
    fi
  fi
  sleep "$INTERVAL_SECS"
done
# keep shell open after script exits
exec $SHELL
