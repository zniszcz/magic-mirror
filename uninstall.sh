#!/usr/bin/env bash
# Disables and removes Magic Mirror (user copy, or system copy with --system).
# The saved profile in ~/.config/magic-mirror is kept; remove it by hand if unwanted.
set -euo pipefail
cd "$(dirname "$0")"
source scripts/common.sh
parse_scope "$@"

gnome-extensions disable "$UUID" 2>/dev/null || true
current="$(enabled_extensions)"
if [[ $current == *"'$UUID'"* ]]; then
    updated="${current//", '$UUID'"/}"
    updated="${updated//"'$UUID', "/}"
    updated="${updated//"'$UUID'"/}"
    [[ $updated == "[]" ]] && updated="@as []"
    gsettings set org.gnome.shell enabled-extensions "$updated"
fi

if [[ $SCOPE == system ]]; then
    sudo rm -rf "$SYSTEM_DIR"
else
    rm -rf "$USER_DIR"
fi

echo "Magic Mirror removed ($SCOPE)."
restart_hint
