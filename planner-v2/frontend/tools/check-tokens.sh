#!/usr/bin/env bash
# Слой предотвращения (конвейер v2, Гейт «код→токены»).
# Статически (без браузера) ловит дрейф дизайна в источнике:
#   1) битые var(--X) — токен используется, но не определён в theme.css;
#   2) сырой hex вне allowlist — должен быть var(<токен>).
# Нашёл 5 тихих багов цвета при заведении (var(--red)/--steel/--onyx/--hairline + дубли).
# Usage: bash tools/check-tokens.sh   (из planner-v2/frontend). Exit 1 = нарушения.
set -euo pipefail
cd "$(dirname "$0")/.."
THEME="src/theme.css"
fail=0

# --- 1. Битые var() -------------------------------------------------------
# Определения берём без якоря ^ (в theme.css бывает несколько --x: в одну строку).
grep -oE '\-\-[a-z0-9-]+:' "$THEME" | grep -oE '\-\-[a-z0-9-]+' | sort -u > /tmp/_tok_def.txt
grep -rhoE 'var\(--[a-z0-9-]+' src --include='*.tsx' --include='*.css' --include='*.ts' \
  | grep -oE '\-\-[a-z0-9-]+' | sort -u > /tmp/_tok_use.txt
# Рантайм-токены задаются из JS (setProperty) / inline-scoped — не в theme.css, это норма.
RUNTIME='^--(c|kb-inset|prio)$'
broken=$(comm -23 /tmp/_tok_use.txt /tmp/_tok_def.txt | grep -vE "$RUNTIME" || true)
if [ -n "$broken" ]; then
  echo "BLOCK: битые var() (нет в $THEME):"; echo "$broken" | sed 's/^/  ❌ /'
  echo "  места:"; for t in $broken; do grep -rn "var($t)" src --include='*.tsx' --include='*.ts' --include='*.css' | sed 's/^/    /'; done
  fail=1
fi

# --- 2. Сырой hex вне allowlist ------------------------------------------
# Allowlist: theme.css (определения токенов) · preview-*-mock (тест-фикстуры) ·
#            строки с маркером `hex-allowlist` (палитра-данные, напр. цвета проектов).
raw=$(grep -rnE '#[0-9A-Fa-f]{3,6}' src --include='*.tsx' --include='*.css' \
  | grep -v '/theme.css:' | grep -v 'preview-[a-z0-9-]*-mock' | grep -v 'hex-allowlist' || true)
# отсечь allowlist-блоки: строка сразу после комментария-маркера тоже разрешена
if [ -n "$raw" ]; then
  # фильтр: исключить строки, чья предыдущая строка содержит hex-allowlist
  filtered=""
  while IFS= read -r line; do
    f="${line%%:*}"; n="$(echo "$line" | cut -d: -f2)"
    prev=$(sed -n "$((n-1))p" "$f" 2>/dev/null || true)
    echo "$prev" | grep -q 'hex-allowlist' && continue
    filtered+="$line"$'\n'
  done <<< "$raw"
  filtered=$(echo "$filtered" | sed '/^$/d')
  if [ -n "$filtered" ]; then
    echo "BLOCK: сырой hex (замени на var(<токен>) или пометь // hex-allowlist):"
    echo "$filtered" | sed 's/^/  ❌ /'
    fail=1
  fi
fi

[ $fail -eq 0 ] && echo "PASS: токены чисты (нет битых var(), нет сырого hex вне allowlist)"
exit $fail
