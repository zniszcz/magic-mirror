// Logs go to the systemd journal through GNOME Shell. Read them with:
//   journalctl --user -b -g 'Magic Mirror'
// Debug lines are hidden unless GNOME Shell runs with G_MESSAGES_DEBUG=all.

const PREFIX = '[Magic Mirror]';

export const logger = {
    debug: (...args) => console.debug(PREFIX, ...args),
    info: (...args) => console.log(PREFIX, ...args),
    warn: (...args) => console.warn(PREFIX, ...args),
    error: (...args) => console.error(PREFIX, ...args),
};
