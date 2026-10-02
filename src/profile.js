// Stores the saved layout as plain JSON in ~/.config/magic-mirror/profile.json.

import GLib from 'gi://GLib';

function profileDir() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'magic-mirror']);
}

export function profilePath() {
    return GLib.build_filenamev([profileDir(), 'profile.json']);
}

export function loadProfile() {
    const path = profilePath();
    if (!GLib.file_test(path, GLib.FileTest.EXISTS))
        return null;

    const [, bytes] = GLib.file_get_contents(path);
    const profile = JSON.parse(new TextDecoder().decode(bytes));
    if (profile?.version !== 1 || !Array.isArray(profile.logicalMonitors))
        throw new Error(`Unsupported profile format in ${path}`);
    return profile;
}

export function saveProfile(profile) {
    GLib.mkdir_with_parents(profileDir(), 0o700);
    GLib.file_set_contents(profilePath(), `${JSON.stringify(profile, null, 2)}\n`);
}
