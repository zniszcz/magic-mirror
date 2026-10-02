import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MirrorIndicator} from './indicator.js';
import {logger} from './logger.js';

export default class MagicMirrorExtension extends Extension {
    enable() {
        this._indicator = new MirrorIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        logger.info(`Enabled (${this.metadata['version-name']})`);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        logger.info('Disabled');
    }
}
