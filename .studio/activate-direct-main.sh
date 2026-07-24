#!/bin/sh
set -eu

PROJECT_ROOT="/Users/hamibektas/Documents/Codex/2026-07-23/claudeme-sistem-kurmak-istiyorum-cunku-bu"
FOUNDATION_WORKTREE="$PROJECT_ROOT/.claude/worktrees/mvp-foundation"
MOBILE_DIR="$FOUNDATION_WORKTREE/mobile"

printf '%s\n' "Verifying the completed MVP foundation..."
sh -n "$FOUNDATION_WORKTREE/.studio/run-loop.sh" "$FOUNDATION_WORKTREE/.studio/git-checkpoint.sh"
(
  cd "$MOBILE_DIR"
  npm test -- --runInBand
  npm run lint
  npx tsc --noEmit
)

printf '%s\n' "Recording the Opus/direct-main Studio configuration..."
git -C "$FOUNDATION_WORKTREE" add \
  .gitignore \
  CLAUDE.md \
  .studio/activate-direct-main.sh \
  .studio/agent-plan.md \
  .studio/backlog.md \
  .studio/decisions.md \
  .studio/git-checkpoint.sh \
  .studio/handoffs.md \
  .studio/loop-prompt.md \
  .studio/run-loop.sh

if ! git -C "$FOUNDATION_WORKTREE" diff --cached --quiet; then
  git -C "$FOUNDATION_WORKTREE" commit -m "chore(studio): run continuous four-phase MVP build"
fi

if [ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]; then
  printf '%s\n' "Preserving the previous root working state in a recoverable git stash..."
  git -C "$PROJECT_ROOT" stash push -u -m "before direct-main activation 2026-07-25"
fi

printf '%s\n' "Fast-forwarding local main to the verified foundation..."
git -C "$PROJECT_ROOT" fetch origin main
git -C "$PROJECT_ROOT" merge --ff-only origin/main
git -C "$PROJECT_ROOT" merge --ff-only worktree-mvp-foundation

printf '%s\n' "Pushing the verified checkpoint directly to origin/main..."
git -C "$PROJECT_ROOT" push -u origin main

printf '%s\n' "Starting the continuous four-phase MVP loop with Opus..."
cd "$PROJECT_ROOT"
rm -f "$PROJECT_ROOT/.claude/ralph-loop.local.md"
sh .studio/run-loop.sh
