const Clone = require('../util/clone.js');
const Blocks = require('./blocks.js');

/**
 * Collects the blocks that targets export through their module blocks, so that
 * targets depending on them can show those blocks in the flyout.
 */
class TargetPreprocesser {
    constructor (runtime) {
        this.runtime = runtime;
    }

    /**
     * Copy a block and everything connected to it into an export container.
     * @param {Blocks} blocks Container holding the original block.
     * @param {Blocks} exportBlocks Container to copy the block into.
     * @param {string} blockId Id of the block to copy.
     * @param {?string} parent Id of the copied block's parent, or null for a stack root.
     */
    cloneBlock (blocks, exportBlocks, blockId, parent) {
        const block = blocks.getBlock(blockId);
        if (!block) return;

        const clonedBlock = Clone.simple(block);
        clonedBlock.parent = parent;
        delete clonedBlock.comment;
        if (!parent) {
            // The exported block sits inside a module block's input, so it is not
            // a top-level block in its source container. Marking the copy as
            // top-level makes the export container serialize it as a stack, and
            // dropping its next connection keeps the blocks below it in the
            // module block as separate exports.
            clonedBlock.topLevel = true;
            clonedBlock.x = 0;
            clonedBlock.y = 0;
            clonedBlock.next = null;
        }

        exportBlocks.createBlock(clonedBlock);

        for (const inputName in block.inputs) {
            if (!Object.prototype.hasOwnProperty.call(block.inputs, inputName)) continue;
            const input = block.inputs[inputName];
            if (input.block) {
                this.cloneBlock(blocks, exportBlocks, input.block, blockId);
            }
            if (input.shadow && input.shadow !== input.block) {
                this.cloneBlock(blocks, exportBlocks, input.shadow, blockId);
            }
        }

        if (parent && block.next) {
            this.cloneBlock(blocks, exportBlocks, block.next, blockId);
        }
    }

    /**
     * Get the blocks exported by a target, in a container that can be serialized
     * as flyout XML.
     * @param {Target} target The target to read exports from.
     * @returns {?Blocks} The exported blocks, or null if the target exports nothing.
     */
    getExports (target) {
        const exportBlocks = new Blocks(this.runtime, true);

        for (const scriptId of target.blocks.getScripts()) {
            const script = target.blocks.getBlock(scriptId);
            if (!script || !script.opcode.startsWith('modules_')) continue;

            let exportedBlockId =
                script.inputs?.EXPORT?.block ||
                script.inputs?.EXPORT?.shadow;

            // Blocks in an export's stack are exported one by one: each block
            // connected by a next connection is its own export. Blocks nested
            // inside an exported block stay attached to it.
            while (exportedBlockId) {
                this.cloneBlock(target.blocks, exportBlocks, exportedBlockId, null);
                exportedBlockId = target.blocks.getBlock(exportedBlockId)?.next;
            }
        }

        return exportBlocks.getScripts().length > 0 ? exportBlocks : null;
    }
}

module.exports = TargetPreprocesser;
