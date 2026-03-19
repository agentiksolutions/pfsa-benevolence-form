#!/bin/bash
# Pre-Bash: Review gate before git push
input=$(cat)
if echo "$input" | grep -qiE '"command"[^}]*git[[:space:]]+push'; then
  echo "" >&2
  echo "## GIT PUSH REVIEW GATE" >&2
  echo "  Before pushing, verify:" >&2
  echo "  - All changes reviewed (git diff)" >&2
  echo "  - No debug/temp code left behind" >&2
  echo "  - Commit messages are clean" >&2
  echo "" >&2
fi
echo "$input"