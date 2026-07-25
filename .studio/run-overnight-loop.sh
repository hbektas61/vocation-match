#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

sh -n .studio/run-overnight-loop.sh

git add .studio/overnight-loop-prompt.md .studio/run-overnight-loop.sh
if ! git diff --cached --quiet; then
  git commit -m "chore(studio): add unattended pilot-hardening loop"
  git push origin main
fi

rm -f "$PROJECT_ROOT/.claude/ralph-loop.local.md"

LOOP_PROMPT="$(sed -n '1p' .studio/overnight-loop-prompt.md)"

exec /Users/hamibektas/.local/bin/claude \
  --bg \
  --model opus \
  --effort high \
  --permission-mode dontAsk \
  --allowedTools "Bash,Edit,Write,Read,Glob,Grep,Task,Skill,TodoWrite" \
  "$LOOP_PROMPT"
