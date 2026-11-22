import {DEFAULT_MODE, getColorsForMode, colorModeMap} from '.';

const getBlockIconURI = extensionIcons => {
    if (!extensionIcons) return null;

    return extensionIcons.blockIconURI || extensionIcons.menuIconURI;
};

const getCategoryIconURI = extensionIcons => {
    if (!extensionIcons) return null;

    return extensionIcons.menuIconURI || extensionIcons.blockIconURI;
};

// scratch-blocks colours has a pen property that scratch-gui uses for all extensions
const getExtensionColors = mode => getColorsForMode(mode).pen;

/**
 * Resolve an extension's or block's ColorStyle to the colors used in a color mode.
 * Each color-mode key may hold either the colors for that mode or the name of a built-in block
 * color style to extend; `base` is used for color modes without their own entry.
 * @param {object} [colorStyle] - the extension's or block's color style, if any
 * @param {string} mode - Color Mode name
 * @returns {object|null} Blockly block style colors, or null if this color mode has no colors
 */
const getColorStyleColors = (colorStyle, mode) => {
    if (!colorStyle) return null;

    const styleForMode = colorStyle[mode] || colorStyle.base;
    if (!styleForMode) return null;

    // A color mode may extend a built-in block color style by name.
    if (typeof styleForMode === 'string') {
        const baseStyle = getColorsForMode(mode)[styleForMode];
        if (!baseStyle) {
            console.warn(`Unknown block color style "${styleForMode}" for color mode "${mode}"`);
            return null;
        }
        return baseStyle;
    }

    return {
        colourPrimary: styleForMode.color1,
        colourSecondary: styleForMode.color2 || styleForMode.color1,
        colourTertiary: styleForMode.color3 || styleForMode.color2 || styleForMode.color1,
        colourQuaternary: styleForMode.color3 || styleForMode.color2 || styleForMode.color1
    };
};

/**
 * Applies extension color mode to categories.
 * In the default color mode extensions keep the colors from their own metadata, unless they declare a
 * colorStyle. These colors are not seen if the category provides a blockIconURI.
 * @param {Array.<object>} dynamicBlockXML - XML for each category of extension blocks, returned from getBlocksXML
 * in the vm runtime.
 * @param {string} mode - Color Mode name
 * @returns {Array.<object>} Dynamic block XML updated with colors.
 */
const injectExtensionCategoryMode = (dynamicBlockXML, mode) => {
    const extensionIcons = colorModeMap[mode].extensions;
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    return dynamicBlockXML.map(extension => {
        const styleColors = getColorStyleColors(extension.colorStyle, mode);

        // In the default mode, extensions keep the colors from their own metadata unless they
        // declare a colorStyle.
        if (mode === DEFAULT_MODE && !styleColors) return extension;

        const colors = styleColors || getExtensionColors(mode);
        const dom = parser.parseFromString(extension.xml, 'text/xml');

        // This element is deserialized by Blockly, which uses the UK spelling
        // of "colour".
        dom.documentElement.setAttribute('colour', colors.colourPrimary);
        // Note: the category's secondaryColour matches up with the blocks' tertiary color, both used for border color.
        dom.documentElement.setAttribute('secondaryColour', colors.colourTertiary);

        if (mode !== DEFAULT_MODE) {
            const categoryIconURI = getCategoryIconURI(extensionIcons[extension.id]);
            if (categoryIconURI) {
                dom.documentElement.setAttribute('iconURI', categoryIconURI);
            }
        }

        return {
            ...extension,
            xml: serializer.serializeToString(dom)
        };
    });
};

const injectExtensionBlockIcons = (blockInfoJson, mode) => {
    // Don't do any manipulation for the default color mode
    if (mode === DEFAULT_MODE) return blockInfoJson;

    // Block icons are the first element of `args0`
    if (!blockInfoJson.args0 || blockInfoJson.args0.length < 1 ||
        blockInfoJson.args0[0].type !== 'field_image') return blockInfoJson;

    const extensionIcons = colorModeMap[mode].extensions;
    const extensionId = blockInfoJson.type.substring(0, blockInfoJson.type.indexOf('_'));
    const blockIconURI = getBlockIconURI(extensionIcons[extensionId]);

    if (!blockIconURI) return blockInfoJson;

    return {
        ...blockInfoJson,
        args0: blockInfoJson.args0.map((value, index) => {
            if (index !== 0) return value;

            return {
                ...value,
                src: blockIconURI
            };
        })
    };
};

export {
    getColorStyleColors,
    getExtensionColors,
    injectExtensionBlockIcons,
    injectExtensionCategoryMode
};
