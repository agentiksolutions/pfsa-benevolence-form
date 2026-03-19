#!/bin/bash
# Post-Edit/Write (async): Check for console.log in JS/TS files
input=$(cat)
file=$(echo "$input" | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.tool_input?.file_path||d.tool_result?.file_path||'')}catch{}" 2>/dev/null)
if [ -n "$file" ] && [ -f "$file" ]; then
  case "$file" in
    *.ts|*.tsx|*.js|*.jsx)
      count=$(grep -cE "console\.(log|debug|info)" "$file" 2>/dev/null || echo 0)
      if [ "$count" -gt 0 ]; then
        echo "" >&2
        echo "## CONSOLE.LOG CHECK" >&2
        echo "  Found $count console.log/debug/info statement(s) in $(basename "$file")" >&2
        echo "  Remember to clean up before deploying." >&2
        echo "" >&2
      fi
      ;;
  esac
fi
echo "$input"