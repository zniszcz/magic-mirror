// Top bar button: an Apple-like switch on left click, a small menu on right click.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
    Position, Target, applyConfig, buildConfig, createProxy, describe, fetchState,
    snapshotLayout,
} from './displayConfig.js';
import {logger} from './logger.js';
import {loadProfile, profilePath, saveProfile} from './profile.js';

const KNOB_FRACTION = {
    [Position.OFF]: 0,
    [Position.UNDEFINED]: 0.5,
    [Position.ON]: 1,
};

const ANIMATION_TIME = 150;
const DISABLED_OPACITY = 110;

const MirrorSwitch = GObject.registerClass(
class MirrorSwitch extends St.Widget {
    _init() {
        super._init({
            style_class: 'magic-mirror-track',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._knob = new St.Widget({style_class: 'magic-mirror-knob'});
        this.add_child(this._knob);
        this._position = Position.UNDEFINED;
        this._travel = 0;
    }

    setPosition(position) {
        if (position === this._position)
            return;

        for (const name of Object.values(Position))
            this.remove_style_class_name(name);
        this.add_style_class_name(position);
        this._position = position;
        this._knob.ease({
            translation_x: this._travel * KNOB_FRACTION[position],
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const content = this.get_theme_node().get_content_box(box);
        const [, , knobWidth, knobHeight] = this._knob.get_preferred_size();
        const x = content.x1;
        const y = content.y1 + Math.floor((content.get_height() - knobHeight) / 2);
        this._knob.allocate(Clutter.ActorBox.new(x, y, x + knobWidth, y + knobHeight));

        this._travel = Math.max(0, content.get_width() - knobWidth);
        if (!this._knob.get_transition('translation-x'))
            this._knob.translation_x = this._travel * KNOB_FRACTION[this._position];
    }
});

export const MirrorIndicator = GObject.registerClass(
class MirrorIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, _('Magic Mirror'));

        this._box = new St.BoxLayout({style_class: 'panel-status-menu-box magic-mirror-box'});
        this._box.add_child(new St.Icon({
            icon_name: 'video-display-symbolic',
            style_class: 'system-status-icon',
        }));
        this._switch = new MirrorSwitch();
        this._box.add_child(this._switch);
        this.add_child(this._box);

        this._statusItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._saveItem = this.menu.addAction('', () => this._saveCurrentLayout());

        this._tooltip = new St.Label({style_class: 'dash-label', visible: false});
        Main.uiGroup.add_child(this._tooltip);
        // The shell may destroy uiGroup (and the tooltip with it) before us.
        this._tooltip.connect('destroy', () => (this._tooltip = null));
        this.connect('notify::hover', () => this._syncTooltip());
        this.menu.connect('open-state-changed', () => this._syncTooltip());

        this._view = null;
        this._busy = false;
        this._destroyed = false;
        this._refreshTicket = 0;
        this._sync();

        this._cancellable = new Gio.Cancellable();
        createProxy(this._cancellable).then(proxy => {
            if (this._destroyed)
                return;
            this._proxy = proxy;
            this._signalId = proxy.connectSignal('MonitorsChanged', () => {
                logger.debug('Monitors changed');
                this._refresh();
            });
            logger.debug('Connected to Mutter DisplayConfig');
            this._refresh();
        }).catch(e => this._logError(e));

        this.connect('destroy', () => this._onDestroy());
    }

    vfunc_event(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS) {
            const button = event.get_button();
            if (button === Clutter.BUTTON_SECONDARY)
                this.menu.toggle();
            else if (button === Clutter.BUTTON_PRIMARY)
                this._toggle();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_BEGIN) {
            this._toggle();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    async _refresh() {
        if (!this._proxy)
            return;

        const ticket = ++this._refreshTicket;
        try {
            const state = await fetchState(this._proxy);
            if (this._destroyed || ticket !== this._refreshTicket)
                return;

            let profile = null;
            try {
                profile = loadProfile();
            } catch (e) {
                logger.warn(`Ignoring unreadable profile: ${e.message}`);
            }
            this._profile = profile;
            this._view = describe(state, profile);
            logger.debug(`State: ${JSON.stringify(this._view)}`);
            this._sync();
        } catch (e) {
            this._logError(e);
        }
    }

    async _toggle() {
        if (this._busy || !this._proxy || !this._view?.target)
            return;

        this._busy = true;
        try {
            // Re-read the state: the serial must be fresh and cables may have moved.
            const state = await fetchState(this._proxy);
            const view = describe(state, this._profile);
            if (!view.target)
                return;

            const config = buildConfig(state, this._profile, view.target);
            logger.info(`Switching from ${view.position} to ${view.target}`);
            logger.debug(`Applying ${JSON.stringify(config)}`);
            await applyConfig(this._proxy, state, config);
        } catch (e) {
            this._reportError(_('Could not switch displays'), e);
        } finally {
            this._busy = false;
        }
    }

    async _saveCurrentLayout() {
        if (!this._proxy)
            return;

        try {
            const profile = snapshotLayout(await fetchState(this._proxy));
            saveProfile(profile);
            logger.info(`Saved profile with ${profile.logicalMonitors.length} display(s) to ${profilePath()}`);
            await this._refresh();
        } catch (e) {
            this._reportError(_('Could not save the profile'), e);
        }
    }

    _statusText() {
        const view = this._view;
        if (!view)
            return _('Reading display configuration…');
        if (!view.hasProfile)
            return _('No profile yet. Arrange displays in Settings, then right-click and save.');

        switch (view.position) {
        case Position.ON:
            return view.target
                ? _('Profile active. Click to use the built-in display only.')
                : _('Profile active. No built-in display to switch to.');
        case Position.OFF:
            return view.profileAvailable
                ? _('Built-in display only. Click to apply the profile.')
                : _('Built-in display only. Profile displays are not connected.');
        default:
            if (view.target === Target.PROFILE)
                return _('Custom layout. Click to apply the profile.');
            return view.target
                ? _('Custom layout. Profile displays are not connected; click to use the built-in display only.')
                : _('Custom layout. Profile displays are not connected.');
        }
    }

    _sync() {
        const view = this._view;
        this._switch.setPosition(view?.position ?? Position.UNDEFINED);
        this._box.opacity = view?.target ? 255 : DISABLED_OPACITY;

        this._statusItem.label.text = this._statusText();
        this._saveItem.label.text = view?.hasProfile
            ? _('Update profile with current layout')
            : _('Save current layout as profile');
        this._saveItem.setSensitive(Boolean(this._proxy));
        this._syncTooltip();
    }

    _syncTooltip() {
        if (!this._tooltip)
            return;
        if (!this.hover || this.menu.isOpen) {
            this._tooltip.hide();
            return;
        }

        this._tooltip.text = this._statusText();
        this._tooltip.show();
        const [x, y] = this.get_transformed_position();
        const [width, height] = this.get_transformed_size();
        const [tooltipWidth] = this._tooltip.get_preferred_width(-1);
        const monitor = Main.layoutManager.findMonitorForActor(this);
        const minX = monitor?.x ?? 0;
        const maxX = minX + (monitor?.width ?? global.stage.width) - tooltipWidth;
        this._tooltip.set_position(
            Math.floor(Math.max(minX, Math.min(maxX, x + (width - tooltipWidth) / 2))),
            Math.floor(y + height + 6));
    }

    _reportError(title, error) {
        this._logError(error);
        if (!this._destroyed)
            Main.notifyError(title, error.message);
    }

    _logError(error) {
        if (!error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            logger.error(String(error));
    }

    _onDestroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        if (this._proxy && this._signalId)
            this._proxy.disconnectSignal(this._signalId);
        this._proxy = null;
        this._tooltip?.destroy();
    }
});
