// Talks to Mutter's DisplayConfig D-Bus API (the one GNOME Settings uses)
// and holds the pure layout logic, so it can be tested outside the shell.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const DisplayConfigIface = `
<node>
  <interface name="org.gnome.Mutter.DisplayConfig">
    <method name="GetCurrentState">
      <arg name="serial" direction="out" type="u"/>
      <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})"/>
      <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})"/>
      <arg name="properties" direction="out" type="a{sv}"/>
    </method>
    <method name="ApplyMonitorsConfig">
      <arg name="serial" direction="in" type="u"/>
      <arg name="method" direction="in" type="u"/>
      <arg name="logical_monitors" direction="in" type="a(iiduba(ssa{sv}))"/>
      <arg name="properties" direction="in" type="a{sv}"/>
    </method>
    <signal name="MonitorsChanged"/>
  </interface>
</node>`;

const DisplayConfigProxy = Gio.DBusProxy.makeProxyWrapper(DisplayConfigIface);

// Same as GNOME Settings after the user confirms a change.
const APPLY_PERSISTENT = 2;

export const Position = Object.freeze({
    ON: 'on',
    OFF: 'off',
    UNDEFINED: 'undefined',
});

export const Target = Object.freeze({
    PROFILE: 'profile',
    BUILTIN: 'builtin',
});

export function createProxy(cancellable) {
    return new Promise((resolve, reject) => {
        new DisplayConfigProxy(
            Gio.DBus.session,
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            (proxy, error) => (error ? reject(error) : resolve(proxy)),
            cancellable);
    });
}

export async function fetchState(proxy) {
    return parseState(await proxy.GetCurrentStateAsync());
}

export function applyConfig(proxy, state, logicalMonitors) {
    return proxy.ApplyMonitorsConfigAsync(
        state.serial, APPLY_PERSISTENT, logicalMonitors, {});
}

function unpack(value) {
    return value instanceof GLib.Variant ? value.deepUnpack() : value;
}

function monitorKey({vendor, product, serial}) {
    return JSON.stringify([vendor, product, serial]);
}

export function parseState([serial, monitors, logicalMonitors]) {
    return {
        serial,
        monitors: monitors.map(([[connector, vendor, product, serialNumber], modes, props]) => {
            const identity = {vendor, product, serial: serialNumber};
            return {
                connector,
                identity,
                key: monitorKey(identity),
                builtin: Boolean(unpack(props['is-builtin'])),
                modes: modes.map(([id, width, height, refreshRate, preferredScale, , modeProps]) => ({
                    id,
                    width,
                    height,
                    refreshRate,
                    preferredScale,
                    current: Boolean(unpack(modeProps['is-current'])),
                    preferred: Boolean(unpack(modeProps['is-preferred'])),
                })),
            };
        }),
        logicalMonitors: logicalMonitors.map(([x, y, scale, transform, primary, specs]) => ({
            x,
            y,
            scale,
            transform,
            primary,
            monitors: specs.map(([, vendor, product, serialNumber]) =>
                monitorKey({vendor, product, serial: serialNumber})),
        })),
    };
}

function findMonitor(state, key) {
    return state.monitors.find(monitor => monitor.key === key);
}

function findBuiltin(state) {
    return state.monitors.find(monitor => monitor.builtin);
}

export function snapshotLayout(state) {
    return {
        version: 1,
        logicalMonitors: state.logicalMonitors.map(logical => ({
            x: logical.x,
            y: logical.y,
            scale: logical.scale,
            transform: logical.transform,
            primary: logical.primary,
            monitors: logical.monitors.map(key => {
                const monitor = findMonitor(state, key);
                const mode = monitor?.modes.find(m => m.current);
                if (!mode)
                    throw new Error(`No active mode for monitor ${key}`);
                return {
                    ...monitor.identity,
                    width: mode.width,
                    height: mode.height,
                    refreshRate: mode.refreshRate,
                };
            }),
        })),
    };
}

function canonicalLayout(layout) {
    return JSON.stringify(layout.logicalMonitors.map(logical => [
        logical.x,
        logical.y,
        logical.scale.toFixed(2),
        logical.transform,
        logical.primary,
        logical.monitors.map(m => [
            m.vendor, m.product, m.serial, m.width, m.height, m.refreshRate.toFixed(2),
        ]).sort(),
    ]).sort());
}

function matchesProfile(state, profile) {
    return canonicalLayout(snapshotLayout(state)) === canonicalLayout(profile);
}

function isBuiltinOnly(state) {
    const [logical, ...rest] = state.logicalMonitors;
    return Boolean(logical) && rest.length === 0 && logical.monitors.length === 1 &&
        Boolean(findMonitor(state, logical.monitors[0])?.builtin);
}

function isProfileAvailable(state, profile) {
    return profile.logicalMonitors.every(logical =>
        logical.monitors.every(saved => findMonitor(state, monitorKey(saved))));
}

export function describe(state, profile) {
    let position = Position.UNDEFINED;
    if (profile && matchesProfile(state, profile))
        position = Position.ON;
    else if (isBuiltinOnly(state))
        position = Position.OFF;

    const hasBuiltin = Boolean(findBuiltin(state));
    const profileAvailable = Boolean(profile) && isProfileAvailable(state, profile);

    let target = null;
    if (!profile)
        target = null;
    else if (position === Position.ON)
        target = hasBuiltin ? Target.BUILTIN : null;
    else if (profileAvailable)
        target = Target.PROFILE;
    else if (position === Position.UNDEFINED && hasBuiltin)
        target = Target.BUILTIN;

    return {position, target, hasProfile: Boolean(profile), profileAvailable, hasBuiltin};
}

function pickMode(monitor, saved) {
    const sameSize = monitor.modes.filter(m =>
        m.width === saved.width && m.height === saved.height);
    const closest = sameSize.sort((a, b) =>
        Math.abs(a.refreshRate - saved.refreshRate) -
        Math.abs(b.refreshRate - saved.refreshRate))[0];
    return closest ?? monitor.modes.find(m => m.preferred) ?? monitor.modes[0];
}

export function buildProfileConfig(state, profile) {
    return profile.logicalMonitors.map(logical => [
        logical.x,
        logical.y,
        logical.scale,
        logical.transform,
        logical.primary,
        logical.monitors.map(saved => {
            const monitor = findMonitor(state, monitorKey(saved));
            if (!monitor)
                throw new Error(`Monitor ${saved.vendor} ${saved.product} is not connected`);
            return [monitor.connector, pickMode(monitor, saved).id, {}];
        }),
    ]);
}

export function buildBuiltinOnlyConfig(state) {
    const builtin = findBuiltin(state);
    if (!builtin)
        throw new Error('No built-in display found');

    const current = state.logicalMonitors.find(l => l.monitors.includes(builtin.key));
    const mode = builtin.modes.find(m => m.current) ??
        builtin.modes.find(m => m.preferred) ?? builtin.modes[0];
    return [[
        0,
        0,
        current?.scale ?? mode.preferredScale,
        current?.transform ?? 0,
        true,
        [[builtin.connector, mode.id, {}]],
    ]];
}

export function buildConfig(state, profile, target) {
    return target === Target.PROFILE
        ? buildProfileConfig(state, profile)
        : buildBuiltinOnlyConfig(state);
}
