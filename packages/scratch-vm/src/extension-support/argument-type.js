/**
 * Block argument types
 * @enum {string}
 */
const ArgumentType = {
    /**
     * Numeric value with angle picker
     */
    ANGLE: 'angle',

    /**
     * Boolean value with hexagonal placeholder
     */
    BOOLEAN: 'Boolean',

    /**
     * Numeric value with color picker
     */
    COLOR: 'color',

    /**
     * Numeric value with text field
     */
    NUMBER: 'number',

    /**
     * String value with text field
     */
    STRING: 'string',

    /**
     * String value with matrix field
     */
    MATRIX: 'matrix',

    /**
     * MIDI note number with note picker (piano) field
     */
    NOTE: 'note',

    /**
     * Inline image on block (as part of the label)
     */
    IMAGE: 'image',
    /**
     * A single block input, which accepts one block per input slot. Children of
     * that block, such as the blocks inside its C-shape, may still exist.
     */
    SINGLE_BLOCK: 'single_block',
    /**
     * A stack input, which accepts one block or a stack of blocks.
     */
    INLINE_STACK: 'inline_block_stack',
};

module.exports = Object.freeze(ArgumentType);
