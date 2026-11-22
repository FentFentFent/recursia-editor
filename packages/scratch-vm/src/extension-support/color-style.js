/**
 * Block color styles built into the editor. An extension's ColorStyle may name one of these
 * to take its colors from a core category in every color mode.
 * @enum {string}
 */
const ColorStyle = {
    Control: 'control',
    Data: 'data',
    DataLists: 'data_lists',
    Event: 'event',
    Looks: 'looks',
    Modules: 'modules',
    More: 'more',
    Motion: 'motion',
    Operators: 'operators',
    Pen: 'pen',
    Sensing: 'sensing',
    Sounds: 'sounds'
};
module.exports = Object.freeze(ColorStyle);
