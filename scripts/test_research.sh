#!/bin/bash

# Google Finance AI Research Deep-Dive Tester
# Tests the ExecuteResearchQuery endpoint used in the Research Dossier

QUERY="What is the 2026 outlook for Public Sector Banks in India?"
SID="-2204111825378931503"
AT="AD2Egks085qhoJ0rai2iCUkIvRe-:1772316425702"
REQ_ID=$((RANDOM % 1000000))

# The f.req structure is a deeply nested proto-JSON list
# [null, "[[ [metadata], [queries], context ], []]"]
F_REQ="[null,\"[[[null,null,null,[1,null,null,\\\"_v2_prod\\\"]], [\\\"$QUERY\\\"], null], []]\"]"

echo "Synthesizing Intelligence for: $QUERY"
echo "---"

curl -s -X POST "https://www.google.com/finance/beta/_/FinHubUi/data/finance.hub.proto.FinanceHubService/ExecuteResearchQuery?f.sid=$SID&bl=boq_finhub-uiserver_20260223.01_p0&hl=en&soc-app=1&soc-platform=1&soc-device=1&_reqid=$REQ_ID&rt=c" \
  -H "Content-Type: application/x-www-form-urlencoded;charset=UTF-8" \
  -H "Origin: https://www.google.com" \
  -H "Referer: https://www.google.com/finance/beta" \
  --data-urlencode "f.req=$F_REQ" \
  --data-urlencode "at=$AT" \
  | sed "s/)]}'//" > /tmp/research_curl_raw.json

echo "Raw Intelligence captured to /tmp/research_curl_raw.json"
echo "---"
# Use node to parse and pretty print the specific narrative slot
node -e '
const fs = require("fs");
try {
    const raw = fs.readFileSync("/tmp/research_curl_raw.json", "utf8");
    const parsed = JSON.parse(raw);
    const payload = JSON.parse(parsed[0][2]);
    const narrative = payload[2][0][0];
    console.log("\n--- SYNTHESIZED NARRATIVE ---\n");
    console.log(narrative);
} catch (e) {
    console.log("\n[!] Intelligence node authentication failed. Your AT/SID tokens have likely rotated.");
    console.log("Response starts with:", fs.readFileSync("/tmp/research_curl_raw.json", "utf8").substring(0, 100));
}
'
