const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const Runtime = require('../../engine/runtime');
const formatMessage = require('format-message');

/**
 * Icon for the extension's category, encoded as a data URI.
 * @type {string}
 */
const iconURI = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
        '<g fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M17 6q-5 0-5 5v5.5q0 3.5-4 3.5 4 0 4 3.5V29q0 5 5 5"/>' +
            '<path d="M23 6q5 0 5 5v5.5q0 3.5 4 3.5-4 0-4 3.5V29q0 5-5 5"/>' +
        '</g>' +
    '</svg>'
)}`;

/**
 * Category menu icon: the same glyph on a bubble in the category color.
 * @type {string}
 */
const menuIconURI = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
        '<circle cx="20" cy="20" r="20" fill="#FF8C1A"/>' +
        '<g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
            ' transform="translate(7 7) scale(0.65)">' +
            '<path d="M17 6q-5 0-5 5v5.5q0 3.5-4 3.5 4 0 4 3.5V29q0 5 5 5"/>' +
            '<path d="M23 6q5 0 5 5v5.5q0 3.5 4 3.5-4 0-4 3.5V29q0 5-5 5"/>' +
        '</g>' +
    '</svg>'
)}`;

/**
 * Variables that live on the thread running the block.
 * @type {string}
 */
const SCOPE_THREAD = 'thread';

/**
 * Variables that live on the procedure body running the block.
 * @type {string}
 */
const SCOPE_FUNCTION = 'function';

/**
 * Variables that live on the runtime and are shared by every target.
 * @type {string}
 */
const SCOPE_RUNTIME = 'runtime';

/**
 * Block category for creating, reading, writing and deleting temporary
 * variables while a project runs.
 */
class Scratch3TempVarsBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * Variables shared by every target for the duration of a run.
         * @type {object}
         * @private
         */
        this._runtimeVariables = Object.create(null);

        this._clearRuntimeVariables = this._clearRuntimeVariables.bind(this);
        runtime.on(Runtime.PROJECT_START, this._clearRuntimeVariables);
        runtime.on(Runtime.PROJECT_STOP_ALL, this._clearRuntimeVariables);
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'tempvars',
            colorStyle: 'tempvars',
            name: formatMessage({
                id: 'tempvars.categoryName',
                default: 'Temporary Variables',
                description: 'Name of the extension that adds temporary variable blocks'
            }),
            blockIconURI: iconURI,
            menuIconURI: menuIconURI,
            color1: '#FF8C1A',
            color2: '#FF8000',
            color3: '#DB6E00',
            blocks: [
                {
                    opcode: 'setVariable',
                    text: formatMessage({
                        id: 'tempvars.setVariable',
                        default: 'set [SCOPE] variable [VARIABLE] to [VALUE]',
                        description: 'Set a temporary variable to a value'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        SCOPE: {
                            type: ArgumentType.STRING,
                            menu: 'scope',
                            defaultValue: SCOPE_THREAD
                        },
                        VARIABLE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'variable'
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: '0'
                        }
                    }
                },
                {
                    opcode: 'changeVariable',
                    text: formatMessage({
                        id: 'tempvars.changeVariable',
                        default: 'change [SCOPE] variable [VARIABLE] by [VALUE]',
                        description: 'Change a temporary variable by a value'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        SCOPE: {
                            type: ArgumentType.STRING,
                            menu: 'scope',
                            defaultValue: SCOPE_THREAD
                        },
                        VARIABLE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'variable'
                        },
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'getVariable',
                    text: formatMessage({
                        id: 'tempvars.getVariable',
                        default: '[SCOPE] variable [VARIABLE]',
                        description: 'Read a temporary variable'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        SCOPE: {
                            type: ArgumentType.STRING,
                            menu: 'scope',
                            defaultValue: SCOPE_THREAD
                        },
                        VARIABLE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'variable'
                        }
                    }
                },
                {
                    opcode: 'variableExists',
                    text: formatMessage({
                        id: 'tempvars.variableExists',
                        default: '[SCOPE] variable [VARIABLE] exists?',
                        description: 'Check whether a temporary variable exists'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        SCOPE: {
                            type: ArgumentType.STRING,
                            menu: 'scope',
                            defaultValue: SCOPE_THREAD
                        },
                        VARIABLE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'variable'
                        }
                    }
                },
                '---',
                {
                    opcode: 'createVariable',
                    text: formatMessage({
                        id: 'tempvars.createVariable',
                        default: 'create [SCOPE] variable [VARIABLE]',
                        description: 'Create a temporary variable without overwriting it'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        SCOPE: {
                            type: ArgumentType.STRING,
                            menu: 'scope',
                            defaultValue: SCOPE_THREAD
                        },
                        VARIABLE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'variable'
                        }
                    }
                },
                {
                    opcode: 'deleteVariable',
                    text: formatMessage({
                        id: 'tempvars.deleteVariable',
                        default: 'delete [SCOPE] variable [VARIABLE]',
                        description: 'Delete a temporary variable'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        SCOPE: {
                            type: ArgumentType.STRING,
                            menu: 'scope',
                            defaultValue: SCOPE_THREAD
                        },
                        VARIABLE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'variable'
                        }
                    }
                },
                {
                    opcode: 'deleteAllVariables',
                    text: formatMessage({
                        id: 'tempvars.deleteAllVariables',
                        default: 'delete all [SCOPE] variables',
                        description: 'Delete every temporary variable in a scope'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        SCOPE: {
                            type: ArgumentType.STRING,
                            menu: 'scope',
                            defaultValue: SCOPE_THREAD
                        }
                    }
                }
            ],
            menus: {
                scope: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'tempvars.scope.thread',
                                default: 'thread-local',
                                description: 'Menu item for variables that belong to the current thread'
                            }),
                            value: SCOPE_THREAD
                        },
                        {
                            text: formatMessage({
                                id: 'tempvars.scope.function',
                                default: 'function-local',
                                description: 'Menu item for variables that belong to the current function body'
                            }),
                            value: SCOPE_FUNCTION
                        },
                        {
                            text: formatMessage({
                                id: 'tempvars.scope.runtime',
                                default: 'runtime-local',
                                description: 'Menu item for variables that are shared by the whole runtime'
                            }),
                            value: SCOPE_RUNTIME
                        }
                    ]
                }
            }
        };
    }

    /**
     * Set a temporary variable, creating it if it does not exist yet.
     * @param {object} args - the block arguments.
     * @param {BlockUtility} util - the block utility.
     */
    setVariable (args, util) {
        const variables = this._getVariables(args.SCOPE, util.thread);
        if (!variables) return;
        variables[this._getVariableName(args)] = args.VALUE;
    }

    /**
     * Change a temporary variable by a number, creating it if it does not exist
     * yet. A missing variable counts as zero.
     * @param {object} args - the block arguments.
     * @param {BlockUtility} util - the block utility.
     */
    changeVariable (args, util) {
        const variables = this._getVariables(args.SCOPE, util.thread);
        if (!variables) return;
        const name = this._getVariableName(args);
        variables[name] = Cast.toNumber(variables[name]) + Cast.toNumber(args.VALUE);
    }

    /**
     * Read a temporary variable. A missing variable reports zero.
     * @param {object} args - the block arguments.
     * @param {BlockUtility} util - the block utility.
     * @returns {*} the variable's value.
     */
    getVariable (args, util) {
        const variables = this._getVariables(args.SCOPE, util.thread);
        if (!variables) return 0;
        const name = this._getVariableName(args);
        return Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : 0;
    }

    /**
     * Check whether a temporary variable exists without creating it.
     * @param {object} args - the block arguments.
     * @param {BlockUtility} util - the block utility.
     * @returns {boolean} true if the variable exists in the scope.
     */
    variableExists (args, util) {
        const variables = this._getVariables(args.SCOPE, util.thread);
        if (!variables) return false;
        return Object.prototype.hasOwnProperty.call(variables, this._getVariableName(args));
    }

    /**
     * Create a temporary variable. An existing variable keeps its value.
     * @param {object} args - the block arguments.
     * @param {BlockUtility} util - the block utility.
     */
    createVariable (args, util) {
        const variables = this._getVariables(args.SCOPE, util.thread);
        if (!variables) return;
        const name = this._getVariableName(args);
        if (!Object.prototype.hasOwnProperty.call(variables, name)) {
            variables[name] = '';
        }
    }

    /**
     * Delete a temporary variable.
     * @param {object} args - the block arguments.
     * @param {BlockUtility} util - the block utility.
     */
    deleteVariable (args, util) {
        const variables = this._getVariables(args.SCOPE, util.thread);
        if (!variables) return;
        delete variables[this._getVariableName(args)];
    }

    /**
     * Delete every temporary variable in a scope. Function and thread scopes
     * clear the scope the block is running in.
     * @param {object} args - the block arguments.
     * @param {BlockUtility} util - the block utility.
     */
    deleteAllVariables (args, util) {
        const variables = this._getVariables(args.SCOPE, util.thread);
        if (!variables) return;
        for (const name of Object.keys(variables)) {
            delete variables[name];
        }
    }

    /**
     * Get the name a block argument refers to.
     * @param {object} args - the block arguments.
     * @returns {string} the variable name.
     * @private
     */
    _getVariableName (args) {
        return Cast.toString(args.VARIABLE);
    }

    /**
     * Find the variables belonging to a scope. Function-local blocks read the
     * scope of the innermost procedure body the calling block runs in, and
     * report null when they are used outside a procedure.
     * @param {string} scope - the scope chosen by the block.
     * @param {Thread} thread - the thread running the block.
     * @returns {?object} the scope's variables, or null if there are none.
     * @private
     */
    _getVariables (scope, thread) {
        switch (scope) {
        case SCOPE_THREAD:
            return this._getThreadVariables(thread);
        case SCOPE_FUNCTION:
            return this._getFunctionVariables(thread);
        case SCOPE_RUNTIME:
            return this._runtimeVariables;
        default:
            return null;
        }
    }

    /**
     * Variables on the thread are dropped with the thread when its script stops.
     * @param {Thread} thread - the thread running the block.
     * @returns {object} the thread's variables.
     * @private
     */
    _getThreadVariables (thread) {
        if (!thread.tempVars) {
            thread.tempVars = Object.create(null);
        }
        return thread.tempVars;
    }

    /**
     * Variables on a procedure body live on the stack frame the definition
     * started on, so they are dropped by the VM when that frame is popped.
     * @param {Thread} thread - the thread running the block.
     * @returns {?object} the innermost function's variables, or null outside a
     *     procedure.
     * @private
     */
    _getFunctionVariables (thread) {
        const {stackFrames} = thread;
        for (let i = stackFrames.length - 1; i >= 0; i--) {
            const frame = stackFrames[i];
            if (frame.functionVariables) {
                return frame.functionVariables;
            }
        }
        return null;
    }

    /**
     * Drop every runtime variable when a run starts or stops.
     * @private
     */
    _clearRuntimeVariables () {
        for (const name of Object.keys(this._runtimeVariables)) {
            delete this._runtimeVariables[name];
        }
    }
}

module.exports = Scratch3TempVarsBlocks;
