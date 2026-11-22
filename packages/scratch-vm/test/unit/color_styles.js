const test = require('tap').test;
const {ColorStyles, resolveColorStyle} = require('../../src/extension-support/color_styles');
const ExtensionManager = require('../../src/extension-support/extension-manager');

/**
 * Color style names the host resolves from a color mode's own palette.
 * @type {Array<string>}
 */
const CORE_STYLES = [
    'motion',
    'looks',
    'sounds',
    'control',
    'event',
    'sensing',
    'pen',
    'operators',
    'data',
    'data_lists',
    'more',
    'modules'
];

/**
 * Every extension in src/extensions.
 * @type {Array<string>}
 */
const BUILT_IN_EXTENSIONS = [
    'arithmetic',
    'boost',
    'collections',
    'ev3',
    'faceSensing',
    'gamepad',
    'gdxfor',
    'http',
    'makeymakey',
    'microbit',
    'music',
    'pen',
    'tempvars',
    'text2speech',
    'textUtils',
    'translate',
    'videoSensing',
    'wedo2'
];

test('every built-in extension has a color style', t => {
    for (const id of BUILT_IN_EXTENSIONS) {
        t.ok(ColorStyles[id], `${id} has a color style`);
    }
    t.end();
});

test('color styles name a core style or give colors for the mode', t => {
    for (const [id, style] of Object.entries(ColorStyles)) {
        t.ok(style.base, `${id} has a base entry for modes without their own colors`);
        for (const [mode, entry] of Object.entries(style)) {
            if (typeof entry === 'string') {
                t.ok(CORE_STYLES.includes(entry), `${id}.${mode} names the core style "${entry}"`);
            } else {
                t.ok(entry.color1, `${id}.${mode} has color1`);
                t.ok(entry.color2, `${id}.${mode} has color2`);
                t.ok(entry.color3, `${id}.${mode} has color3`);
            }
        }
    }
    t.end();
});

test('the styles the request calls out', t => {
    t.same(ColorStyles.tempvars, {base: 'data'}, 'temporary variables use the variables colors');
    t.same(ColorStyles.pen, {base: 'pen'}, 'pen keeps its color in every mode');
    t.end();
});

test('a name resolves to the color style it names', t => {
    t.equal(resolveColorStyle('pen'), ColorStyles.pen);
    t.equal(resolveColorStyle('gamepad'), ColorStyles.gamepad);

    const custom = {base: 'motion'};
    t.equal(resolveColorStyle(custom), custom, 'a color style object passes through');
    t.equal(resolveColorStyle(undefined), undefined, 'an absent color style stays absent');
    t.equal(resolveColorStyle('notARealStyle'), undefined, 'an unknown name resolves to nothing');
    t.end();
});

test('extensions resolve named color styles when they are registered', t => {
    const manager = new ExtensionManager({runtime: {}});
    const info = manager._prepareExtensionInfo('testService', {
        id: 'gamepad',
        colorStyle: 'gamepad'
    });
    t.same(info.colorStyle, ColorStyles.gamepad);
    t.end();
});
