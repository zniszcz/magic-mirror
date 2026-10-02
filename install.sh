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
fi

# This switch blocks every extension the user enabled, wherever it is installed.
if [[ $(gsettings get org.gnome.shell disable-user-extensions) == true ]]; then
    echo "Warning: user extensions are disabled in GNOME, so Magic Mirror will not load." >&2
    echo "To allow them: gsettings set org.gnome.shell disable-user-extensions false" >&2
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
