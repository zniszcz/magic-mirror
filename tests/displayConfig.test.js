// Run with: gjs -m tests/displayConfig.test.js

import GLib from 'gi://GLib';
import System from 'system';

import {
    Position, Target, buildBuiltinOnlyConfig, buildProfileConfig, describe, parseState,
    snapshotLayout,
} from '../src/displayConfig.js';

const flag = value => new GLib.Variant('b', value);

function mode(id, width, height, refreshRate, {current = false, preferred = false} = {}) {
    const props = {};
    if (current)
        props['is-current'] = flag(true);
    if (preferred)
        props['is-preferred'] = flag(true);
    return [id, width, height, refreshRate, 1.0, [1.0, 2.0], props];
}

const LAPTOP = ['eDP-1', 'AUO', '0xaf90', '0x00000000'];
const DELL_A = ['DP-0', 'DEL', 'DELL P2317H', 'AAA'];
const DELL_B = ['HDMI-1', 'DEL', 'DELL P2317H', 'BBB'];

function monitor(spec, {active = false, builtin = false} = {}) {
    return [
        spec,
        [
            mode('1920x1080@60.000', 1920, 1080, 60.0, {current: active, preferred: true}),
            mode('1280x720@60.000', 1280, 720, 60.0),
        ],
        builtin ? {'is-builtin': flag(true)} : {},
    ];
}

function rawState(connected, logical) {
    const active = new Set(logical.flatMap(([, , , , , specs]) => specs.map(s => s[0])));
    return [
        7,
        connected.map(spec => monitor(spec, {active: active.has(spec[0]), builtin: spec === LAPTOP})),
        logical,
        {},
    ];
}

const threeInLine = rawState([LAPTOP, DELL_A, DELL_B], [
    [0, 0, 1.0, 0, false, [DELL_B]],
    [1920, 0, 1.0, 0, true, [DELL_A]],
    [3840, 0, 1.0, 0, false, [LAPTOP]],
]);
const laptopOnly = rawState([LAPTOP, DELL_A, DELL_B], [[0, 0, 1.0, 0, true, [LAPTOP]]]);
const laptopUnplugged = rawState([LAPTOP], [[0, 0, 1.0, 0, true, [LAPTOP]]]);
const oneDell = rawState([LAPTOP, DELL_A], [
    [0, 0, 1.0, 0, true, [DELL_A]],
    [1920, 0, 1.0, 0, false, [LAPTOP]],
]);

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        print(`ok   ${name}`);
    } else {
        failures++;
        print(`FAIL ${name}\n     expected ${e}\n     actual   ${a}`);
    }
}

const profile = JSON.parse(JSON.stringify(snapshotLayout(parseState(threeInLine))));
const pick = ({position, target}) => ({position, target});

check('no profile: switch disabled',
    pick(describe(parseState(threeInLine), null)), {position: Position.UNDEFINED, target: null});
check('profile active: switches to built-in',
    pick(describe(parseState(threeInLine), profile)), {position: Position.ON, target: Target.BUILTIN});
check('built-in only, monitors connected: switches to profile',
    pick(describe(parseState(laptopOnly), profile)), {position: Position.OFF, target: Target.PROFILE});
check('built-in only, monitors unplugged: disabled',
    pick(describe(parseState(laptopUnplugged), profile)), {position: Position.OFF, target: null});
check('custom layout, profile unavailable: switches to built-in',
    pick(describe(parseState(oneDell), profile)), {position: Position.UNDEFINED, target: Target.BUILTIN});

check('profile config follows identities, not connectors',
    buildProfileConfig(parseState(rawState([LAPTOP, ['HDMI-1', ...DELL_A.slice(1)], ['DP-0', ...DELL_B.slice(1)]],
        [[0, 0, 1.0, 0, true, [LAPTOP]]])), profile).map(l => [l[0], l[5][0][0]]),
    [[0, 'DP-0'], [1920, 'HDMI-1'], [3840, 'eDP-1']]);
check('built-in config keeps the built-in mode',
    buildBuiltinOnlyConfig(parseState(threeInLine)),
    [[0, 0, 1.0, 0, true, [['eDP-1', '1920x1080@60.000', {}]]]]);

if (failures > 0)
    System.exit(1);
