// Notices cable changes without polling: the kernel sends a uevent on the DRM
// subsystem for every hotplug, and we only listen. Mutter does not always
// pick up outputs of the NVIDIA X driver on its own, so on X11 a single
// RandR probe (xrandr --query, ~50 ms) nudges it before we re-read the state.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GUdev from 'gi://GUdev';
import Meta from 'gi://Meta';

import {logger} from './logger.js';

// A loose HDMI plug can fire dozens of events per second; act once they settle.
const SETTLE_MS = 1000;

export class HotplugWatcher {
    constructor(onChange) {
        this._onChange = onChange;
        this._timeoutId = 0;
        this._cancellable = new Gio.Cancellable();
        this._client = new GUdev.Client({subsystems: ['drm']});
        this._ueventId = this._client.connect('uevent', (_client, action, device) => {
            if (action !== 'change' || device.get_property('HOTPLUG') !== '1')
                return;
            logger.debug(`Hotplug event from ${device.get_name()}`);
            this._schedule();
        });
    }

    _schedule() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTLE_MS, () => {
            this._timeoutId = 0;
            this.reprobe();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Asks the display server to look at its connectors again, then reports back.
    async reprobe() {
        try {
            await probeOutputs(this._cancellable);
        } catch (e) {
            if (!e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logger.warn(`Display probe failed: ${e.message}`);
        }
        if (!this._cancellable.is_cancelled())
            await this._onChange();
    }

    destroy() {
        this._cancellable.cancel();
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
        this._client.disconnect(this._ueventId);
        this._client = null;
    }
}

function probeOutputs(cancellable) {
    // Wayland's Mutter talks to KMS directly and sees hotplugs by itself.
    if (Meta.is_wayland_compositor())
        return Promise.resolve();

    const xrandr = GLib.find_program_in_path('xrandr');
    if (!xrandr) {
        logger.debug('xrandr not found, skipping the probe');
        return Promise.resolve();
    }

    const proc = Gio.Subprocess.new([xrandr, '--query'],
        Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
    return new Promise((resolve, reject) => {
        proc.wait_check_async(cancellable, (p, res) => {
            try {
                p.wait_check_finish(res);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });
}
