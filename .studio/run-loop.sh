#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

LOOP_PROMPT="$(sed -n '1p' .studio/loop-prompt.md)"
exec /Users/hamibektas/.local/bin/claude --bg --model opus --permission-mode acceptEdits "$LOOP_PROMPT"
