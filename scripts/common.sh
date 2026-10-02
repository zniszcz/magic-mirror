# Shared by install.sh and uninstall.sh.

UUID="magic-mirror@zniszczynski.pl"
USER_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
SYSTEM_DIR="/usr/share/gnome-shell/extensions/$UUID"

parse_scope() {
    case "${1:-}" in
        "") SCOPE=user ;;
        --system) SCOPE=system ;;
        *) echo "usage: $0 [--system]" >&2; exit 2 ;;
    esac
}

enabled_extensions() {
    gsettings get org.gnome.shell enabled-extensions
}

restart_hint() {
    echo "Restart GNOME Shell to load the change:"
    echo "  X11: press Alt+F2, type r, press Enter."
    echo "  Wayland: log out and log back in."
}
