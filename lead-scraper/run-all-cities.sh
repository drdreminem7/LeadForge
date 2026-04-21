#!/usr/bin/env zsh

set -euo pipefail

cd "$(dirname "$0")"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./run-all-cities.sh <base_csv_path> [start_city]"
  echo "Example: ./run-all-cities.sh data/companies_raw_2026-03-29T12-06-08-335Z.csv Graz"
  exit 1
fi

BASE_CSV="$1"
START_CITY="${2:-Graz}"

notify() {
  local message="$1"
  local subtitle="$2"
  local sound="$3"

  if command -v terminal-notifier >/dev/null 2>&1; then
    # Sticky notification: stays until dismissed.
    terminal-notifier \
      -title "LeadForge Scraper" \
      -subtitle "$subtitle" \
      -message "$message" \
      -sound "$sound" \
      -timeout 0 >/dev/null 2>&1 || true
    return
  fi

  # Sticky fallback without extra dependencies: an alert dialog that stays until dismissed.
  osascript - "$message" "$subtitle" <<'APPLESCRIPT' >/dev/null 2>&1 &
on run argv
  set msg to item 1 of argv
  set sub to item 2 of argv
  display dialog msg with title ("LeadForge Scraper - " & sub) buttons {"OK"} default button "OK"
end run
APPLESCRIPT
}

if [[ ! -f "$BASE_CSV" ]]; then
  echo "Base CSV not found: $BASE_CSV"
  exit 1
fi

typeset -a CITIES=(
  "Graz|Austria|47.0707,15.4395|Tier1"
  "Bucharest|Romania|44.4268,26.1025|Tier1"
  "Cluj-Napoca|Romania|46.7712,23.6236|Tier1"
  "Timisoara|Romania|45.7489,21.2087|Tier1"
  "Warsaw|Poland|52.2297,21.0122|Tier1"
  "Krakow|Poland|50.0647,19.9450|Tier1"
  "Wroclaw|Poland|51.1079,17.0385|Tier1"
  "Athens|Greece|37.9838,23.7275|Tier1"
  "Thessaloniki|Greece|40.6401,22.9444|Tier1"
  "Lisbon|Portugal|38.7223,-9.1393|Tier1"
  "Porto|Portugal|41.1579,-8.6291|Tier1"
  "Prague|Czechia|50.0755,14.4378|Tier1"
  "Brno|Czechia|49.1951,16.6068|Tier1"
  "Madrid|Spain|40.4168,-3.7038|Tier1"
  "Barcelona|Spain|41.3874,2.1686|Tier1"
  "Valencia|Spain|39.4699,-0.3763|Tier1"
)

start_found=0
current_csv="$BASE_CSV"

for entry in "${CITIES[@]}"; do
  city="${entry%%|*}"
  rest="${entry#*|}"
  country="${rest%%|*}"
  rest="${rest#*|}"
  coords="${rest%%|*}"
  tier="${rest##*|}"

  if [[ "$start_found" -eq 0 ]]; then
    if [[ "$city" == "$START_CITY" ]]; then
      start_found=1
    else
      continue
    fi
  fi

  echo "============================================================"
  echo "Running city: $city, $country"
  echo "Base CSV: $current_csv"
  echo "============================================================"

  if ! caffeinate -dimsu node src/index.js \
    --existing-csv "$current_csv" \
    --city "$city" \
    --country "$country" \
    --coords "$coords" \
    --tier "$tier"; then
    notify "Failed on $city" "Run stopped" "Basso"
    exit 1
  fi

  latest_csv="$(ls -t data/companies_raw_*.csv | grep -v '_deduplicated\.csv$' | head -n1)"
  if [[ -z "$latest_csv" || ! -f "$latest_csv" ]]; then
    notify "No CSV found after $city" "Run stopped" "Basso"
    exit 1
  fi

  current_csv="$latest_csv"
  notify "Done: $city (${latest_csv:t})" "City complete" "Glass"
done

notify "All queued cities complete" "Ready for final dedup" "Hero"

deduped_csv="${current_csv%.csv}_deduplicated.csv"
if [[ "$current_csv" == "$deduped_csv" ]]; then
  deduped_csv="${current_csv%.csv}_deduplicated.csv"
fi

echo "Running final dedup on $current_csv"
if node deduplicate-csv.js "$current_csv" "$deduped_csv"; then
  if [[ -f "$deduped_csv" ]]; then
    rm -f "$current_csv"
    notify "Final dedup complete: ${deduped_csv:t}" "Deduplicated dataset ready" "Hero"
    echo "Dedup complete. Final CSV: $deduped_csv"
  else
    notify "Dedup succeeded but output missing" "Run failed" "Basso"
    exit 1
  fi
else
  notify "Dedup failed" "Please check logs" "Basso"
  exit 1
fi