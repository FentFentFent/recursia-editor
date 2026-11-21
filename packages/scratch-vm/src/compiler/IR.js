

class CompilerError extends Error {
    constructor(message,{
        code = 'E_COMPILER',
        blockId = null,
        scriptId = null,
        target = null,
        details = null,
        cause = null
    } = {}) {
        super(message,{ cause });

        this.name = 'CompilerError';
        this.code = code;
        this.blockId = blockId;
        this.scriptId = scriptId;
        this.target = target;
        this.details = details;

        Error.captureStackTrace?.(this,CompilerError);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            blockId: this.blockId,
            scriptId: this.scriptId,
            target: this.target,
            details: this.details
        };
    }
}

class ScriptIR {
    /**
     * @param {import('../virtual-machine.js')} vm
     * @param {RenderedTarget} target
     * @param {string} scriptId
     */
    constructor(runtime,target,scriptId) {
        if (!runtime) {
            throw new CompilerError('Cannot initialize ScriptIR without a VM.',{
                code: 'E_MISSING_VM'
            });
        }

        if (!target) {
            throw new CompilerError('Cannot initialize ScriptIR without a target.',{
                code: 'E_MISSING_TARGET'
            });
        }

        if (typeof scriptId !== 'string' || !scriptId.length) {
            throw new CompilerError('Invalid script ID.',{
                code: 'E_INVALID_SCRIPT_ID',
                details: { scriptId }
            });
        }

        this.runtime = runtime;
        this.target = target;
        this.blocks = target.blocks;
        this.scriptId = scriptId;

        if (!this.blocks || typeof this.blocks.getBlock !== 'function') {
            throw new CompilerError('Target does not contain a valid block container.',{
                code: 'E_INVALID_BLOCK_CONTAINER',
                scriptId,
                target: target.id
            });
        }

        this.scriptBlock = this.blocks.getBlock(scriptId);
        this.sourceBlocks = [];
        this.visitedBlocks = new Set();
        this.activeBlocks = new Set();
    }

    /**
     * Retrieves a block and validates its existence.
     */
    getBlock(id,parentId,inputName = null) {
        if (!id) {
            throw new CompilerError('Encountered an empty block reference.',{
                code: 'E_EMPTY_BLOCK_REFERENCE',
                scriptId: this.scriptId,
                blockId: parentId,
                details: { inputName }
            });
        }

        const block = this.blocks.getBlock(id);

        if (!block) {
            throw new CompilerError(`Block "${ id }" does not exist.`,{
                code: 'E_MISSING_BLOCK',
                scriptId: this.scriptId,
                blockId: parentId,
                details: {
                    referencedBlockId: id,
                    inputName
                }
            });
        }

        return block;
    }

    /**
     * Recursively captures blocks referenced by inputs.
     */
    captureSourceInputsRecursive(block) {
        if (!block || typeof block !== 'object') {
            throw new CompilerError('Encountered an invalid block object.',{
                code: 'E_INVALID_BLOCK',
                scriptId: this.scriptId
            });
        }

        const blockId = block.id;

        if (this.activeBlocks.has(blockId)) {
            throw new CompilerError(`Circular block dependency detected at "${ blockId }".`,{
                code: 'E_CIRCULAR_DEPENDENCY',
                scriptId: this.scriptId,
                blockId
            });
        }

        if (this.visitedBlocks.has(blockId)) {
            return;
        }

        this.activeBlocks.add(blockId);

        if (block.inputs !== undefined && (
            !block.inputs || typeof block.inputs !== 'object'
        )) {
            throw new CompilerError(`Block "${ blockId }" has malformed inputs.`,{
                code: 'E_INVALID_INPUTS',
                scriptId: this.scriptId,
                blockId
            });
        }

        const inputs = block.inputs || {};

        for (const [key,input] of Object.entries(inputs)) {
            if (!input || typeof input !== 'object') {
                throw new CompilerError(`Input "${ key }" on block "${ blockId }" is malformed.`,{
                    code: 'E_INVALID_INPUT',
                    scriptId: this.scriptId,
                    blockId,
                    details: { inputName: key }
                });
            }

            const id = input.block ?? input.shadow;

            if (id) {
                const child = this.getBlock(id,blockId,key);

                this.captureSourceInputsRecursive(child);
            }
        }

        this.activeBlocks.delete(blockId);
        this.visitedBlocks.add(blockId);
        this.sourceBlocks.push(block);
    }

    /**
     * Captures all blocks belonging to this script.
     */
    captureSourceBlocks() {
        if (!this.scriptBlock) {
            throw new CompilerError(`Script block "${ this.scriptId }" does not exist.`,{
                code: 'E_SCRIPT_NOT_FOUND',
                scriptId: this.scriptId,
                target: this.target.id
            });
        }

        this.sourceBlocks = [];
        this.visitedBlocks.clear();
        this.activeBlocks.clear();

        let current = this.scriptBlock;

        while (current) {
            if (this.visitedBlocks.has(current.id)) {
                throw new CompilerError(`Circular next-chain detected at block "${ current.id }".`,{
                    code: 'E_CIRCULAR_NEXT',
                    scriptId: this.scriptId,
                    blockId: current.id
                });
            }

            this.captureSourceInputsRecursive(current);

            current = current.next
                ? this.getBlock(current.next,current.id,'next')
                : null;
        }

        return this.sourceBlocks;
    }
}

ScriptIR.CompilerError = CompilerError;

module.exports = ScriptIR;
