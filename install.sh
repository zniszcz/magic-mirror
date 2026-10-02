#!/usr/bin/env bash
# Installs Magic Mirror for the current user, or for all users with --system,
# and enables it for the current user. Safe to run again to upgrade.
set -euo pipefail
cd "$(dirname "$0")"
source scripts/common.sh
parse_scope "$@"

if [[ $SCOPE == system ]]; then
    sudo ./scripts/copy-files.sh "$SYSTEM_DIR"
    # A user copy would shadow the system one, so drop it.
    if [[ -d $USER_DIR ]]; then
        rm -rf "$USER_DIR"
        echo "Removed the user copy in $USER_DIR (it would shadow the system one)."
    fi
else
    ./scripts/copy-files.sh "$USER_DIR"
    if [[ $(gsettings get org.gnome.shell disable-user-extensions) == true ]]; then
        echo "Warning: user extensions are disabled in GNOME, so this copy will not load." >&2
        echo "Either run: gsettings set org.gnome.shell disable-user-extensions false" >&2
        echo "or install system-wide: $0 --system" >&2
    fi
fi

# A freshly copied extension is unknown to the running shell, so enabling it
# through gnome-extensions fails until restart; the setting covers that case.
if ! gnome-extensions enable "$UUID" 2>/dev/null; then
    current="$(enabled_extensions)"
    if [[ $current != *"'$UUID'"* ]]; then
        if [[ $current == "@as []" ]]; then
            gsettings set org.gnome.shell enabled-extensions "['$UUID']"
        else
            gsettings set org.gnome.shell enabled-extensions "${current%]}, '$UUID']"
        fi
    fi
fi

echo "Magic Mirror installed ($SCOPE)."
restart_hint
