#!/bin/sh
set -eu
: "${STUDIO_HASH:?Set the existing browser nonce/envelope key in STUDIO_HASH}"
: "${STUDIO_API_BASE:?Set the existing API base URL in STUDIO_API_BASE}"
# The existing nginx image runs this once at container startup. Node is build-only.
# jq encodes arbitrary environment values safely before inserting JSON in HTML.
# -n runs the filter even when the container has no stdin. Publish atomically so
# a failed injection cannot truncate the document nginx will serve.
output=$(mktemp /usr/share/nginx/html/studio/index.html.XXXXXX)
trap 'rm -f "$output"' EXIT HUP INT TERM
jq -ner --rawfile html /etc/studio-index.template.html \
  --arg hash "$STUDIO_HASH" --arg api "$STUDIO_API_BASE" \
  --arg version "${VITE_PUBLIC_APP_VERSION:-${APP_VERSION:-dev}}" \
  '"<script id=\"studio-runtime\" type=\"application/json\">" as $marker |
    ($html|split($marker)) as $parts |
    if ($parts|length)==2 and ($parts[1]|contains("</script>")) then
      ($parts[1]|index("</script>")) as $end |
      $parts[0] + $marker +
      ({hash:$hash,apiBase:($api|sub("/$";"")),appVersion:$version}|tojson|split("<")|join("\\u003c")) +
      $parts[1][$end:]
    else error("Studio runtime marker missing from HTML template") end' \
  > "$output"
test -s "$output"
chmod 644 "$output"
mv "$output" /usr/share/nginx/html/studio/index.html
