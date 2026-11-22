const log = require('../util/log');

/**
 * Build a color style from one set of colors per theme family.
 *
 * Light themes (the default mode and the cherry light mode) share `light`, dark themes share
 * `dark`, and high contrast is authored separately because it needs pale blocks with dark text.
 * @param {object} colors the colors for each theme family.
 * @param {object} colors.light colors for light themes.
 * @param {object} colors.dark colors for dark themes.
 * @param {object} colors.highContrast colors for the high contrast theme.
 * @returns {object} a color style keyed by color mode.
 */
const customColors = ({light, dark, highContrast}) => ({
    base: light,
    dark,
    'cherry-dark': dark,
    'high-contrast': highContrast
});

/**
 * Color styles for the built-in extensions, keyed by extension ID.
 *
 * A color style maps a color mode to that mode's colors. Each entry is either an object with
 * `color1`, `color2` and `color3`, or the name of a core block color style (`motion`, `looks`,
 * `sounds`, `control`, `event`, `sensing`, `pen`, `operators`, `data`, `data_lists`, `more`,
 * `modules`). Named core styles are resolved by the host from that mode's own palette, so the
 * extension keeps fitting the theme. `base` applies to every mode without its own entry.
 *
 * Extensions refer to an entry here by name, e.g. `colorStyle: 'pen'`.
 */
const ColorStyles = {
    arithmetic: customColors({
        light: {color1: '#659C0D', color2: '#5A8B0B', color3: '#4D7709'},
        dark: {color1: '#1A2605', color2: '#4C4C4C', color3: '#84CC16'},
        highContrast: {color1: '#D9F0A3', color2: '#EBF7D1', color3: '#4D7709'}
    }),
    boost: customColors({
        light: {color1: '#E5484D', color2: '#D13D42', color3: '#B32F34'},
        dark: {color1: '#331416', color2: '#4C4C4C', color3: '#E5484D'},
        highContrast: {color1: '#FFB3B5', color2: '#FFD6D7', color3: '#B32F34'}
    }),
    collections: customColors({
        light: {color1: '#475569', color2: '#3E4A5C', color3: '#334155'},
        dark: {color1: '#1A202B', color2: '#4C4C4C', color3: '#94A3B8'},
        highContrast: {color1: '#CBD5E1', color2: '#E2E8F0', color3: '#334155'}
    }),
    ev3: customColors({
        light: {color1: '#B45309', color2: '#9A4708', color3: '#7C3A06'},
        dark: {color1: '#331F0A', color2: '#4C4C4C', color3: '#D97706'},
        highContrast: {color1: '#FFCE85', color2: '#FFE4BF', color3: '#7C3A06'}
    }),
    faceSensing: {base: 'sensing'},
    gamepad: {base: 'control'},
    gdxfor: {base: 'sensing'},
    http: customColors({
        light: {color1: '#0E7490', color2: '#0C657E', color3: '#0A566C'},
        dark: {color1: '#0B2429', color2: '#4C4C4C', color3: '#22B8CF'},
        highContrast: {color1: '#A5D8E4', color2: '#D2EBF1', color3: '#0A566C'}
    }),
    makeymakey: {base: 'event'},
    microbit: customColors({
        light: {color1: '#0D9488', color2: '#0B8075', color3: '#096B62'},
        dark: {color1: '#08302C', color2: '#4C4C4C', color3: '#2DD4BF'},
        highContrast: {color1: '#A3E6DE', color2: '#D1F2EF', color3: '#096B62'}
    }),
    music: {base: 'sounds'},
    pen: {base: 'pen'},
    tempvars: {base: 'data'},
    text2speech: customColors({
        light: {color1: '#D6336C', color2: '#BF2B60', color3: '#A32350'},
        dark: {color1: '#330F1C', color2: '#4C4C4C', color3: '#F06595'},
        highContrast: {color1: '#FFB3C9', color2: '#FFD6E2', color3: '#A32350'}
    }),
    textUtils: {base: 'operators'},
    translate: customColors({
        light: {color1: '#4F46E5', color2: '#443CC7', color3: '#3A33A9'},
        dark: {color1: '#171333', color2: '#4C4C4C', color3: '#8B83F7'},
        highContrast: {color1: '#C4BFFF', color2: '#E0DEFE', color3: '#3A33A9'}
    }),
    videoSensing: {base: 'sensing'},
    wedo2: customColors({
        light: {color1: '#1E3A8A', color2: '#1B3379', color3: '#172B66'},
        dark: {color1: '#111A33', color2: '#4C4C4C', color3: '#4F74E8'},
        highContrast: {color1: '#B3C4FF', color2: '#D6DEFD', color3: '#172B66'}
    })
};

/**
 * Resolve a color style. A style named by a string is looked up in {@link ColorStyles}; a style
 * given as an object is returned unchanged.
 * @param {?(string|object)} colorStyle the declared color style.
 * @param {string} [ownerName] the extension ID or block opcode that declared it, for warnings.
 * @returns {?object} the color style, or `undefined` when the name is unknown.
 */
const resolveColorStyle = (colorStyle, ownerName) => {
    if (typeof colorStyle !== 'string') return colorStyle;
    if (Object.prototype.hasOwnProperty.call(ColorStyles, colorStyle)) {
        return ColorStyles[colorStyle];
    }
    log.warn(`Unknown color style "${colorStyle}"${ownerName ? ` used by "${ownerName}"` : ''}.`);
    return undefined;
};

module.exports = {
    ColorStyles,
    resolveColorStyle
};
