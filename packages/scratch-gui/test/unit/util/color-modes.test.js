import {
    DARK_MODE,
    defaultColors,
    DEFAULT_MODE,
    getColorsForMode,
    HIGH_CONTRAST_MODE
} from '../../../src/lib/settings/color-mode';
import {
    getColorStyleColors,
    injectExtensionBlockIcons,
    injectExtensionCategoryMode
} from '../../../src/lib/settings/color-mode/blockHelpers';
import {detectColorMode, persistColorMode} from '../../../src/lib/settings/color-mode/persistence';

jest.mock('../../../src/lib/settings/color-mode/default');
jest.mock('../../../src/lib/settings/color-mode/dark');

describe('color modes', () => {
    let serializeToString;

    describe('core functionality', () => {
        test('provides the default color mode colors', () => {
            expect(defaultColors.motion.colourPrimary).toEqual('#111111');
        });

        test('returns the dark mode', () => {
            const colors = getColorsForMode(DARK_MODE);

            expect(colors.motion.colourPrimary).toEqual('#AAAAAA');
        });

        test('uses default color mode colors when not specified', () => {
            const colors = getColorsForMode(DARK_MODE);

            expect(colors.motion.colourSecondary).toEqual('#222222');
        });
    });

    describe('color styles', () => {
        test('extends a built-in color style in each color mode', () => {
            const colors = getColorStyleColors({base: 'motion'}, DARK_MODE);

            expect(colors.colourPrimary).toEqual('#AAAAAA');
            expect(colors.colourTertiary).toEqual('#333333');
        });

        test('uses the colors declared for a specific color mode', () => {
            const colors = getColorStyleColors({
                base: 'motion',
                [DARK_MODE]: {color1: '#010203', color2: '#040506'}
            }, DARK_MODE);

            expect(colors).toEqual({
                colourPrimary: '#010203',
                colourSecondary: '#040506',
                colourTertiary: '#040506',
                colourQuaternary: '#040506'
            });
        });

        test('returns no colors for a color mode without an entry', () => {
            expect(getColorStyleColors({[DARK_MODE]: 'motion'}, DEFAULT_MODE)).toBeNull();
        });
    });

    describe('block helpers', () => {
        beforeEach(() => {
            serializeToString = jest.fn(() => 'mocked xml');

            class XMLSerializer {
                constructor () {
                    this.serializeToString = serializeToString;
                }
            }

            global.XMLSerializer = XMLSerializer;
        });

        test('updates extension block icon based on color mode', () => {
            const blockInfoJson = {
                type: 'pen_block',
                args0: [
                    {
                        type: 'field_image',
                        src: 'original'
                    }
                ]
            };

            const updated = injectExtensionBlockIcons(blockInfoJson, DARK_MODE);

            expect(updated).toEqual({
                type: 'pen_block',
                args0: [
                    {
                        type: 'field_image',
                        src: 'darkPenIcon'
                    }
                ]
            });
            // The original value was not modified
            expect(blockInfoJson.args0[0].src).toBe('original');
        });

        test('bypasses updates if using the default color mode', () => {
            const blockInfoJson = {
                type: 'dummy_block',
                args0: [
                    {
                        type: 'field_image',
                        src: 'original'
                    }
                ]
            };

            const updated = injectExtensionBlockIcons(blockInfoJson, DEFAULT_MODE);

            expect(updated).toEqual({
                type: 'dummy_block',
                args0: [
                    {
                        type: 'field_image',
                        src: 'original'
                    }
                ]
            });
        });

        test('applies an extension color style to its category in the default mode', () => {
            const dynamicBlockXML = [
                {
                    id: 'pen',
                    colorStyle: {
                        default: {color1: '#010203', color3: '#040506'}
                    },
                    xml: '<category name="Pen" id="pen" colour="#0FBD8C" secondaryColour="#0DA57A"></category>'
                }
            ];

            injectExtensionCategoryMode(dynamicBlockXML, DEFAULT_MODE);

            expect(serializeToString.mock.calls[0][0].documentElement.getAttribute('colour')).toBe('#010203');
            expect(serializeToString.mock.calls[0][0].documentElement.getAttribute('secondaryColour'))
                .toBe('#040506');
        });

        test('updates extension category based on color mode', () => {
            const dynamicBlockXML = [
                {
                    id: 'pen',
                    xml: '<category name="Pen" id="pen" colour="#0FBD8C" secondaryColour="#0DA57A"></category>'
                }
            ];

            injectExtensionCategoryMode(dynamicBlockXML, DARK_MODE);

            // XMLSerializer is not available outside the browser.
            // Verify the mocked XMLSerializer.serializeToString is called with updated colors.
            expect(serializeToString.mock.calls[0][0].documentElement.getAttribute('colour')).toBe('#FFFFFF');
            expect(serializeToString.mock.calls[0][0].documentElement.getAttribute('secondaryColour')).toBe('#DDDDDD');
            expect(serializeToString.mock.calls[0][0].documentElement.getAttribute('iconURI')).toBe('darkPenIcon');
        });
    });

    describe('color mode persistence', () => {
        test('returns the color mode stored in a cookie', () => {
            window.document.cookie = `scratchtheme=${HIGH_CONTRAST_MODE}`;

            const colorMode = detectColorMode();

            expect(colorMode).toEqual(HIGH_CONTRAST_MODE);
        });

        test('returns the system color mode when no cookie', () => {
            window.document.cookie = 'scratchtheme=';

            const colorMode = detectColorMode();

            expect(colorMode).toEqual(DEFAULT_MODE);
        });

        test('persists color mode to cookie', () => {
            window.document.cookie = 'scratchtheme=';

            persistColorMode(HIGH_CONTRAST_MODE);

            expect(window.document.cookie).toEqual(`scratchtheme=${HIGH_CONTRAST_MODE}`);
        });

        test('clears color mode when matching system preferences', () => {
            window.document.cookie = `scratchtheme=${HIGH_CONTRAST_MODE}`;

            persistColorMode(DEFAULT_MODE);

            expect(window.document.cookie).toEqual('scratchtheme=');
        });
    });
});
