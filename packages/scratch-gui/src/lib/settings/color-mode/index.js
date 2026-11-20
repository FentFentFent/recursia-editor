import defaultsDeep from 'lodash.defaultsdeep';
import {defineMessages} from 'react-intl';

import {
    blockColors as darkModeBlockColors,
    extensions as darkModeExtensions
} from './dark';
import {
    blockColors as highContrastBlockColors,
    extensions as highContrastExtensions
} from './high-contrast';
import {
    blockColors as cherryLightBlockColors,
    extensions as cherryLightExtensions
} from './cherry-light';
import {
    blockColors as cherryDarkBlockColors,
    extensions as cherryDarkExtensions
} from './cherry-dark';
import {blockColors as defaultColors} from './default';

import defaultIcon from './default/icon.svg';
import highContrastIcon from './high-contrast/icon.svg';
import darkModeIcon from './dark/icon.svg';
import cherryLightIcon from './cherry-light/icon.svg';
import cherryDarkIcon from './cherry-dark/icon.svg';

const DEFAULT_MODE = 'default';
const HIGH_CONTRAST_MODE = 'high-contrast';
const DARK_MODE = 'dark';
const CHERRY_LIGHT_MODE = 'cherry-light';
const CHERRY_DARK_MODE = 'cherry-dark';

const mergeWithDefaults = colors => defaultsDeep({}, colors, defaultColors);

const messages = defineMessages({
    [DEFAULT_MODE]: {
        id: 'gui.theme.default',
        defaultMessage: 'Original',
        description: 'label for original color mode'
    },
    [DARK_MODE]: {
        id: 'gui.theme.dark',
        defaultMessage: 'Dark',
        description: 'label for dark mode'
    },
    [HIGH_CONTRAST_MODE]: {
        id: 'gui.theme.highContrast',
        defaultMessage: 'High Contrast',
        description: 'label for high contrast mode'
    },
    [CHERRY_LIGHT_MODE]: {
        id: 'gui.theme.cherryLight',
        defaultMessage: 'Cherry Light',
        description: 'label for cherry light color mode'
    },
    [CHERRY_DARK_MODE]: {
        id: 'gui.theme.cherryDark',
        defaultMessage: 'Cherry Dark',
        description: 'label for cherry dark color mode'
    }
});

const colorModeMap = {
    [DEFAULT_MODE]: {
        blocksMediaFolder: 'blocks-media/default',
        colors: defaultColors,
        extensions: {},
        label: messages[DEFAULT_MODE],
        icon: defaultIcon
    },
    [CHERRY_LIGHT_MODE]: {
        blocksMediaFolder: 'blocks-media/default',
        colors: mergeWithDefaults(cherryLightBlockColors),
        extensions: cherryLightExtensions,
        label: messages[CHERRY_LIGHT_MODE],
        icon: cherryLightIcon
    },
    [CHERRY_DARK_MODE]: {
        blocksMediaFolder: 'blocks-media/default',
        colors: mergeWithDefaults(cherryDarkBlockColors),
        extensions: cherryDarkExtensions,
        label: messages[CHERRY_DARK_MODE],
        icon: cherryDarkIcon
    },
    [DARK_MODE]: {
        blocksMediaFolder: 'blocks-media/default',
        colors: mergeWithDefaults(darkModeBlockColors),
        extensions: darkModeExtensions,
        label: messages[DARK_MODE],
        icon: darkModeIcon
    },
    [HIGH_CONTRAST_MODE]: {
        blocksMediaFolder: 'blocks-media/high-contrast',
        colors: mergeWithDefaults(highContrastBlockColors),
        extensions: highContrastExtensions,
        label: messages[HIGH_CONTRAST_MODE],
        icon: highContrastIcon
    }
};

const getColorsForMode = colorMode => {
    const modeInfo = colorModeMap[colorMode];

    if (!modeInfo) {
        throw new Error(`Undefined color mode ${colorMode}`);
    }

    return modeInfo.colors;
};

export {
    CHERRY_DARK_MODE,
    CHERRY_LIGHT_MODE,
    DEFAULT_MODE,
    DARK_MODE,
    HIGH_CONTRAST_MODE,
    defaultColors,
    getColorsForMode,
    colorModeMap
};
