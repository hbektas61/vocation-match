#!/bin/sh
set -eu

AUTHORIZED_REMOTE="https://github.com/hbektas61/vocation-match.git"
CURRENT_BRANCH="$(git branch --show-current)"

if [ -z "$CURRENT_BRANCH" ]; then
  echo "No current branch; checkpoint aborted." >&2
  exit 2
fi

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "Autonomous checkpoints must use a feature branch, not $CURRENT_BRANCH." >&2
  exit 2
fi

if git remote get-url origin >/dev/null 2>&1; then
  CURRENT_REMOTE="$(git remote get-url origin)"
  if [ "$CURRENT_REMOTE" != "$AUTHORIZED_REMOTE" ]; then
    echo "origin does not match the authorized repository; checkpoint aborted." >&2
    exit 2
  fi
else
  git remote add origin "$AUTHORIZED_REMOTE"
fi

git push -u origin "$CURRENT_BRANCH"
