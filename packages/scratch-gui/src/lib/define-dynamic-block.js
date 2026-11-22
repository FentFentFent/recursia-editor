// TODO: access `BlockType` and `ArgumentType` without reaching into VM
// Should we move these into a new extension support module or something?
import {ArgumentType, BlockType} from '@scratch/scratch-vm';

/**
 * Matches the names of the argument inputs a block's mutator adds.
 * @type {RegExp}
 */
const MUTATOR_ARGUMENT = /^ARG(\d+)$/;

/**
 * The arguments a mutator has added to a block, in the order they appear on it.
 * @param {object} blockInfo - The block's info, as stored in its mutation.
 * @returns {Array.<string>} The argument names.
 */
const mutatorArgumentNames = blockInfo => Object.keys(blockInfo.arguments || {})
    .filter(name => MUTATOR_ARGUMENT.test(name))
    .sort((a, b) => Number(MUTATOR_ARGUMENT.exec(a)[1]) - Number(MUTATOR_ARGUMENT.exec(b)[1]));

/**
 * Give an input an empty text block in it, the way an argument input looks on every other block.
 * @param {object} ScratchBlocks - The ScratchBlocks name space.
 * @param {object} input - The input to fill.
 */
const addTextShadow = (ScratchBlocks, input) => {
    if (!input || !input.connection) return;
    input.connection.setShadowDom(ScratchBlocks.utils.xml.textToDom(
        '<shadow type="text"><field name="TEXT"></field></shadow>'
    ));
};

/**
 * Give a block the connections its block type calls for.
 * @param {object} ScratchBlocks - The ScratchBlocks name space.
 * @param {object} block - The block to set up.
 * @param {object} blockInfo - The block's info, as stored in its mutation.
 */
const applyShape = (ScratchBlocks, block, blockInfo) => {
    switch (blockInfo.blockType) {
    case BlockType.COMMAND:
    case BlockType.CONDITIONAL:
    case BlockType.LOOP:
        block.setOutputShape(ScratchBlocks.OUTPUT_SHAPE_SQUARE);
        block.setPreviousStatement(true);
        block.setNextStatement(!blockInfo.isTerminal);
        break;
    case BlockType.REPORTER:
        block.setOutput(true);
        block.setOutputShape(ScratchBlocks.OUTPUT_SHAPE_ROUND);
        if (!blockInfo.disableMonitor) {
            block.setCheckboxInFlyout(true);
        }
        break;
    case BlockType.BOOLEAN:
        block.setOutput(true);
        block.setOutputShape(ScratchBlocks.OUTPUT_SHAPE_HEXAGONAL);
        break;
    case BlockType.HAT:
    case BlockType.EVENT:
        block.setOutputShape(ScratchBlocks.OUTPUT_SHAPE_SQUARE);
        block.setNextStatement(true);
        break;
    }
};

/**
 * Lay out a block's inputs from its block info, replacing the inputs of the previous layout.
 * This is for a block which has no inputs yet: the inputs it replaces would lose what the project
 * put in them.
 * @param {object} ScratchBlocks - The ScratchBlocks name space.
 * @param {object} block - The block to lay out.
 * @param {object} blockInfo - The block's info, as stored in its mutation.
 */
const layoutBlock = (ScratchBlocks, block, blockInfo) => {
    for (const name of block.blockInfoInputs || []) {
        if (block.getInput(name)) {
            block.removeInput(name);
        }
    }

    const args = [];
    const laidOut = [];
    let argCount = 0;
    const blockText = String(blockInfo.text);
    const scratchBlocksStyleText = blockText.replace(/\[(.+?)]/g, (match, argName) => {
        const arg = (blockInfo.arguments || {})[argName];
        if (!arg) {
            // A placeholder with no argument behind it, such as one a block only uses in some shapes.
            return match;
        }
        switch (arg.type) {
        case ArgumentType.STRING:
            args.push({type: 'input_value', name: argName});
            break;
        case ArgumentType.BOOLEAN:
            args.push({type: 'input_value', name: argName, check: 'Boolean'});
            break;
        default:
            return match;
        }
        laidOut.push(argName);
        return `%${++argCount}`;
    });

    block.blockInfoInputs = laidOut;
    // The method `jsonInit` uses to turn a message and its arguments into fields and inputs.
    block.interpolate(scratchBlocksStyleText, args);
    for (const name of laidOut) {
        addTextShadow(ScratchBlocks, block.getInput(name));
    }
};

/**
 * Set a block up from a block info.
 * @param {object} ScratchBlocks - The ScratchBlocks name space.
 * @param {object} block - The block to set up.
 * @param {(object|string)} source - The block's info, either parsed or serialized.
 */
const setBlockInfo = (ScratchBlocks, block, source) => {
    const blockInfo = typeof source === 'string' ? JSON.parse(source) : source;
    block.blockInfoText = JSON.stringify(blockInfo);
    applyShape(ScratchBlocks, block, blockInfo);
    layoutBlock(ScratchBlocks, block, blockInfo);
    block.render();
};

/**
 * Add an argument input to a block with a mutator. The inputs the project already filled are left
 * alone, so their values and their text blocks stay as they are.
 * @param {object} ScratchBlocks - The ScratchBlocks name space.
 * @param {object} block - The block to change.
 * @returns {string} The name of the new argument.
 */
const addArgument = (ScratchBlocks, block) => {
    const blockInfo = JSON.parse(block.blockInfoText);
    blockInfo.arguments = blockInfo.arguments || {};
    blockInfo.text = String(blockInfo.text);
    const name = `ARG${mutatorArgumentNames(blockInfo).length + 1}`;

    blockInfo.arguments[name] = {type: ArgumentType.STRING};
    blockInfo.text = `${blockInfo.text} [${name}]`;

    const input = block.appendValueInput(name);
    input.appendField(' ');
    addTextShadow(ScratchBlocks, input);
    block.blockInfoInputs = (block.blockInfoInputs || []).concat(name);
    block.blockInfoText = JSON.stringify(blockInfo);
    block.render();
    return name;
};

/**
 * Remove the last argument input of a block with a mutator.
 * @param {object} ScratchBlocks - The ScratchBlocks name space.
 * @param {object} block - The block to change.
 * @returns {?string} The name of the removed argument, or null when there was none.
 */
const removeArgument = (ScratchBlocks, block) => {
    const blockInfo = JSON.parse(block.blockInfoText);
    blockInfo.arguments = blockInfo.arguments || {};
    blockInfo.text = String(blockInfo.text);
    const names = mutatorArgumentNames(blockInfo);
    if (names.length === 0) return null;

    const name = names[names.length - 1];
    delete blockInfo.arguments[name];
    blockInfo.text = blockInfo.text.replace(new RegExp(`\\s*\\[${name}\\]`), '');
    block.removeInput(name);
    block.blockInfoInputs = (block.blockInfoInputs || []).filter(inputName => inputName !== name);
    block.blockInfoText = JSON.stringify(blockInfo);
    block.render();
    return name;
};

/**
 * Add or remove an argument input of a block with a mutator, and tell the VM about the new layout.
 * @param {object} ScratchBlocks - The ScratchBlocks name space.
 * @param {object} block - The block to change.
 * @param {number} delta - 1 to add an argument, -1 to remove the last one.
 */
const changeArgumentCount = (ScratchBlocks, block, delta) => {
    const previousMutation = block.mutationToDom();
    if (delta > 0) {
        addArgument(ScratchBlocks, block);
    } else if (!removeArgument(ScratchBlocks, block)) {
        return;
    }

    // Record the new layout on the block's mutation, so that the VM and saved projects have it too.
    const mutation = block.mutationToDom();
    if (mutation && ScratchBlocks.Events && ScratchBlocks.Events.fire && ScratchBlocks.Events.BlockChange) {
        ScratchBlocks.Events.fire(new ScratchBlocks.Events.BlockChange(
            block,
            'mutation',
            null,
            previousMutation && previousMutation.outerHTML,
            mutation.outerHTML
        ));
    }
};

/**
 * Define a block using extension info which has the ability to dynamically determine (and update) its layout.
 * This functionality is used for extension blocks which can change its properties based on different state
 * information. For example, the `control_stop` block changes its shape based on which menu item is selected
 * and a variable block changes its text to reflect the variable name without using an editable field.
 *
 * A block whose extension info sets `mutator` starts with the arguments in its block info and lets the
 * user add more with its context menu. The input names a mutator adds are `ARG1`, `ARG2`, and so on.
 *
 * The layout is carried both as a mutation, which projects and the VM use, and as extra state, which is how
 * Blockly 12 copies a block: dragging a block out of the flyout, pasting one, or undoing a change loads a
 * block's state, so a block which only revived its layout from a mutation would be copied without it.
 * @param {object} ScratchBlocks - The ScratchBlocks name space.
 * @param {object} categoryInfo - Information about this block's extension category, including any menus and icons.
 * @param {object} staticBlockInfo - The base block information before any dynamic changes.
 * @param {string} extendedOpcode - The opcode for the block (including the extension ID).
 */
// TODO: grow this until it can fully replace `_convertForScratchBlocks` in the VM runtime
const defineDynamicBlock = (ScratchBlocks, categoryInfo, staticBlockInfo, extendedOpcode) => ({
    init: function () {
        const blockJson = {
            type: extendedOpcode,
            inputsInline: true,
            category: categoryInfo.name,
            // The VM assigns a distinct style name to blocks which declare their own colorStyle.
            style: (staticBlockInfo.json && staticBlockInfo.json.style) || categoryInfo.id
        };
        // There is a scratch-blocks / Blockly extension called "scratch_extension" which adjusts the styling of
        // blocks to allow for an icon, a feature of Scratch extension blocks. However, Scratch "core" extension
        // blocks don't have icons and so they should not use 'scratch_extension'. Adding a scratch-blocks / Blockly
        // extension after `jsonInit` isn't fully supported (?), so we decide now whether there will be an icon.
        if (staticBlockInfo.blockIconURI || categoryInfo.blockIconURI) {
            blockJson.extensions = ['scratch_extension'];
        }
        // initialize the basics of the block, to be overridden & extended later by `domToMutation` / `loadExtraState`
        this.jsonInit(blockJson);
        // initialize the cached block info used to carry block info from `domToMutation` to `mutationToDom`
        this.blockInfoText = '{}';
    },
    saveExtraState: function () {
        return JSON.parse(this.blockInfoText);
    },
    loadExtraState: function (state) {
        setBlockInfo(ScratchBlocks, this, state);
    },
    mutationToDom: function () {
        const container = document.createElement('mutation');
        container.setAttribute('blockInfo', this.blockInfoText);
        return container;
    },
    domToMutation: function (xmlElement) {
        const blockInfoText = xmlElement.getAttribute('blockInfo');
        if (!blockInfoText) return;
        setBlockInfo(ScratchBlocks, this, blockInfoText);
    },
    customContextMenu: function (options) {
        if (!staticBlockInfo.info || !staticBlockInfo.info.mutator) return;
        if (this.isInFlyout) return;
        const names = mutatorArgumentNames(JSON.parse(this.blockInfoText));
        options.push({
            enabled: true,
            text: 'add argument',
            callback: () => changeArgumentCount(ScratchBlocks, this, 1)
        });
        options.push({
            enabled: names.length > 0,
            text: 'remove argument',
            callback: () => changeArgumentCount(ScratchBlocks, this, -1)
        });
    }
});

export default defineDynamicBlock;
