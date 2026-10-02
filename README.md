# Magic Mirror

> Mirror, mirror on the wall — one screen or all?

A GNOME Shell extension that puts an Apple-like switch in the top bar. One click
toggles between a saved multi-monitor layout and the built-in display only.

## Usage

1. Arrange your displays in GNOME Settings the way you like them.
2. Right-click the switch and choose **Save current layout as profile**
   (later: **Update profile with current layout**).
3. Left-click the switch to flip between the profile and the built-in display.

The switch shows three positions:

| Position | Meaning |
| --- | --- |
| Right, green | The saved profile is active. |
| Left | Only the built-in display is on. |
| Middle, dimmed | Some other layout, e.g. changed by hand in Settings. A click applies the profile. |

The whole switch is dimmed and inactive when there is nowhere to go, for example
when the monitors from the profile are not connected. Hover over it to see why.

## Design rules

- **No force.** Layouts are applied through Mutter's `DisplayConfig` D-Bus API,
  exactly like GNOME Settings does. Settings keep working as usual, and the
  extension simply reports a layout it does not recognise as "undefined".
- **Monitors are matched by identity, not by port.** A profile stores vendor,
  product and serial number, so swapping cables between ports does not break it.
- **No runtime dependencies** beyond GNOME Shell itself.
- The profile is plain JSON in `~/.config/magic-mirror/profile.json`.

## Install

```sh
./install.sh            # current user
./install.sh --system   # all users, into /usr/share (uses sudo)
```

Both are safe to run again to upgrade. Afterwards restart GNOME Shell
(X11: <kbd>Alt</kbd>+<kbd>F2</kbd>, `r`; Wayland: log out and back in).

## Uninstall

```sh
./uninstall.sh          # or: ./uninstall.sh --system
```

The saved profile is kept; delete `~/.config/magic-mirror` to remove it too.

## Development

```sh
make check              # layout logic tests, needs only gjs
```

The project is laid out as a Debian package from the start, so a `.deb` can be
built with `dpkg-buildpackage -us -uc -b` (requires `debhelper`).

## License

GPL-2.0-or-later, see [LICENSE](LICENSE).
