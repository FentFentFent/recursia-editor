/**
 * Types of block
 * @enum {string}
 */
const BlockType = {
    /**
     * Boolean reporter with hexagonal shape
     */
    BOOLEAN: 'Boolean',

    /**
     * A button (not an actual block) for some special action, like making a variable
     */
    BUTTON: 'button',

    /**
     * Command block
     */
    COMMAND: 'command',

    /**
     * Specialized command block which may or may not run a child branch
     * The thread continues with the next block whether or not a child branch ran.
     */
    CONDITIONAL: 'conditional',

    /**
     * Specialized hat block with no implementation function
     * This stack only runs if the corresponding event is emitted by other code.
     */
    EVENT: 'event',

    /**
     * Hat block which conditionally starts a block stack
     */
    HAT: 'hat',

    /**
     * Specialized command block which may or may not run a child branch
     * If a child branch runs, the thread evaluates the loop block again.
     */
    LOOP: 'loop',

    /**
     * General reporter with numeric or string value
     */
    REPORTER: 'reporter',
    /**
     * A label displayed in the flyout itself (not an actual block)
     */
    LABEL: 'label', 

    /**
     * XML that is inserted into the flyout as a block.
     */
    XML: 'xml'
};

module.exports = Object.freeze(BlockType);
