#!/bin/bash
# Pre-Write/Edit: Warn about binary document files
input=$(cat)
if echo "$input" | grep -qiE '"file_path"[^}]*\.(docx|xlsx|pptx|pdf)"'; then
  echo "" >&2
  echo "## BINARY DOC WARNING" >&2
  echo "  Writing to a binary document file (.docx/.xlsx/.pptx/.pdf)." >&2
  echo "  Use specialized libraries (python-docx, openpyxl, python-pptx)" >&2
  echo "  Raw text writes will corrupt the file." >&2
  echo "" >&2
fi
echo "$input"