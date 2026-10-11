#!/usr/bin/env bash
# Adds the demo neighbors to the local SQLite database through the running API.
# Start the backend first: uvicorn app.main:app --port 8000
# Safe to run twice. A 409 means the resident already exists.
BASE="${1:-http://127.0.0.1:8000}"

add() {
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/residents" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$1\",\"name\":\"$2\",\"short_name\":\"$3\",\"street\":\"$4\",\"x\":$5,\"y\":$6}")
  echo "$1 -> $code"
}

add jordan "Jordan Lee"  Jordan "16 Willow Court" 2 1
add sam    "Sam Ortiz"   Sam    "18 Willow Court" 3 3
add riley  "Riley Park"  Riley  "21 Willow Court" 5 2
add noor   "Noor Haddad" Noor   "9 Far Road"       40 0
add maya   "Maya Chen"   Maya   "12 Willow Court"  1 4
add chris  "Chris Nguyen" Chris "22 Willow Court"  4 1
add priya  "Priya Shah"  Priya  "9 Willow Court"   6 4
add elena  "Elena Brooks" Elena "25 Willow Court"  8 2
