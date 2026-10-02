#!/usr/bin/env bash
# Copies the extension into the given extension directory, replacing any
# previous copy. Shared by install.sh and the Makefile (Debian packaging).
set -euo pipefail

UUID="magic-mirror@zniszczynski.pl"
target="${1:?usage: copy-files.sh <extension-directory>}"

# Guard against wiping anything that is not this extension's own directory.
if [[ "$(basename "$target")" != "$UUID" ]]; then
    echo "Refusing to install into $target: it must end with /$UUID" >&2
    exit 1
fi

src="$(cd "$(dirname "$0")/../src" && pwd)"
rm -rf "$target"
install -d "$target"
install -m 0644 "$src"/*.js "$src/metadata.json" "$src/stylesheet.css" "$target/"
