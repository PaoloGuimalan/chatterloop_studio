#!/bin/sh
set -eu
: "${STUDIO_HASH:?Set the existing browser nonce/envelope key in STUDIO_HASH}"
: "${STUDIO_API_BASE:?Set the existing API base URL in STUDIO_API_BASE}"
# The existing nginx image runs this once at container startup. Node is build-only.
# jq encodes arbitrary environment values safely before inserting JSON in HTML.
jq -r --rawfile html /etc/studio-index.template.html \
  --arg hash "$STUDIO_HASH" --arg api "$STUDIO_API_BASE" \
  '$html | sub("<script id=\"studio-runtime\" type=\"application/json\">[^<]*</script>";
    "<script id=\"studio-runtime\" type=\"application/json\">" +
    ({hash:$hash,apiBase:($api|sub("/$";""))}|tojson|gsub("<";"\\u003c")) + "</script>")' \
  > /usr/share/nginx/html/studio/index.html
