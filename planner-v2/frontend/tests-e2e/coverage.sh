#!/usr/bin/env bash
# Гейт полноты (конвейер v2): каждый интерактивный элемент мокапа (ecode) учтён в контракте —
# либо ПОКРЫТ тестом, либо ЯВНО отложен (COVERAGE-DEFER). Молчаливых дыр нет.
# Usage: bash coverage.sh <mockup.html> <spec.ts> [<spec2.ts> ...]
# Контракт экрана может быть разбит на неск. spec-файлов (напр. T1 = T1-today + T1-full) — передай все.
# Разметка V3: <span class="ecode">A6</span> (код = текст; суффикс ·DETAIL/·T1 = кросс-реф, отрезаем).
set -euo pipefail
mockup="${1:?нужен путь к мокапу}"; shift
[ "$#" -ge 1 ] || { echo "нужен хотя бы один spec-файл"; exit 2; }
[ -f "$mockup" ] || { echo "MOCKUP NOT FOUND: $mockup"; exit 2; }
for s in "$@"; do [ -f "$s" ] || { echo "CONTRACT NOT FOUND: $s"; exit 2; }; done

codes=$(grep -oE '<span class="ecode[^"]*">[^<]*</span>' "$mockup" \
  | sed -E 's/<[^>]+>//g; s/·.*//' | sort -u)
[ -n "$codes" ] || { echo "WARN: в мокапе нет <span class=\"ecode\">; проверь разметку"; exit 3; }

# Граница в каждом spec: до маркера COVERAGE-DEFER = зона покрытия; после = отложенное.
# Зоны склеиваем по всем переданным spec-файлам.
covered_zone=""; defer_zone=""
for s in "$@"; do
  covered_zone+=$'\n'$(awk '/COVERAGE-DEFER/{exit} {print}' "$s")
  defer_zone+=$'\n'$(awk 'f{print} /COVERAGE-DEFER/{f=1}' "$s")
done

miss=0; cov=0; def=0
for c in $codes; do
  if grep -qE "(^|[^A-Z0-9])$c([^0-9]|$)" <<<"$covered_zone"; then
    echo "  ✅ $c — покрыт тестом"; cov=$((cov+1))
  elif grep -qE "(^|[^A-Z0-9])$c([^0-9]|$)" <<<"$defer_zone"; then
    echo "  ⏭  $c — отложен (COVERAGE-DEFER)"; def=$((def+1))
  else
    echo "  ❌ $c — НЕ учтён (ни теста, ни defer)"; miss=$((miss+1))
  fi
done

total=$(wc -w <<<"$codes" | tr -d ' ')
echo "── итог: $cov покрыто · $def отложено · $miss дыр (из $total ecode) ──"
if [ "$miss" -gt 0 ]; then echo "BLOCK: $miss непокрытых элементов мокапа"; exit 1; fi
echo "PASS: каждый ecode учтён (покрыт или явно отложен)"
