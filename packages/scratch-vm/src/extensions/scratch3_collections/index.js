const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const log = require('../../util/log');

/**
 * Glyph shared by the block icon and the category menu icon.
 * @type {string}
 */
const iconPaths =
    '<g fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 7l13 6.5L20 20 7 13.5z"/>' +
        '<path d="M7 20.5l13 6.5 13-6.5"/>' +
        '<path d="M7 27l13 6.5L33 27"/>' +
    '</g>';

/**
 * Icon to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
const blockIconURI = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${iconPaths}</svg>`
)}`;

/**
 * Category menu icon: the same glyph on a bubble in the category color.
 * @type {string}
 */
const menuIconURI = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
        '<circle cx="20" cy="20" r="20" fill="#475569"/>' +
        `<g transform="translate(7 7) scale(0.65)">${iconPaths}</g>` +
    '</svg>'
)}`;

/**
 * A class declared by a class block. Classes do not copy their parents' members: lookups walk the
 * parent graph, so a class behaves like a prototype which can have more than one parent.
 */
class ClassDefinition {
    /**
     * @param {string} name - the name of the class.
     */
    constructor (name) {
        /**
         * The name this class is looked up by.
         * @type {string}
         */
        this.name = name;

        /**
         * Names of the classes this class extends, in the order they were listed.
         * @type {Array.<string>}
         */
        this.parentNames = [];

        /**
         * Properties defined on the class itself, shared by all of its instances.
         * @type {Map.<string, *>}
         */
        this.members = new Map();

        /**
         * Methods of this class, mapping each method's name to the procedure it runs.
         * @type {Map.<string, string>}
         */
        this.methods = new Map();

        /**
         * Name of the constructor's procedure, if the class has a constructor.
         * @type {?string}
         */
        this.constructorCode = null;
    }
}

/**
 * Block category for objects: classes with multiple inheritance, their instances, and the plain
 * collection types (maps, arrays) with JSON conversion.
 */
class Scratch3CollectionsBlocks {
    /**
     * @param {Runtime} runtime - the VM runtime, used to run procedures for methods and constructors.
     */
    constructor (runtime) {
        /**
         * The VM runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        this._onProjectLoaded = this._onProjectLoaded.bind(this);
        this._reset();
        if (this.runtime && this.runtime.on) {
            // Objects outlive a run, so that pressing the green flag does not throw away maps, arrays
            // and instances a project built. Loading another project starts from a clean slate.
            this.runtime.on('PROJECT_LOADED', this._onProjectLoaded);
        }
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'collections',
            colorStyle: 'collections',
            name: formatMessage({
                id: 'collections.categoryName',
                default: 'Collections',
                description: 'Name of the extension that adds classes and objects'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    // The class definition is a meta block: it describes the class instead of doing
                    // something when a script runs, and the runtime reads it when the project starts.
                    opcode: 'defineClass',
                    blockType: BlockType.META,
                    branchCount: 1,
                    text: formatMessage({
                        id: 'collections.defineClass',
                        default: 'define class [NAME] extends [PARENTS]',
                        description: 'Declare a class; the parents are a comma-separated list of class names'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Thing'
                        },
                        PARENTS: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                '---',
                {
                    // Declarations are read from the class body; running one on its own does nothing.
                    opcode: 'declareField',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.declareField',
                        default: 'field [NAME] = [VALUE]',
                        description: 'Declare a field of the class this block is inside'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: 'name'
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'declareMethod',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.declareMethod',
                        default: 'method [NAME] with [PROCEDURE]',
                        description: 'Bind a procedure to the class as a method; the procedure gets the instance first'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        PROCEDURE: {
                            type: ArgumentType.SINGLE_BLOCK
                        }
                    }
                },
                {
                    opcode: 'declareConstructor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.declareConstructor',
                        default: 'constructor [NAME] with [PROCEDURE]',
                        description: 'Bind a procedure to the class as its constructor; it gets the instance first'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        PROCEDURE: {
                            type: ArgumentType.SINGLE_BLOCK
                        }
                    }
                },
                '---',
                {
                    opcode: 'newInstance',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.newInstance',
                        default: 'new instance of class [CLASS]',
                        description: 'Create an instance of a class'
                    }),
                    arguments: {
                        CLASS: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Thing'
                        }
                    }
                },
                {
                    opcode: 'callMethod',
                    blockType: BlockType.COMMAND,
                    // The argument inputs are added by the block's mutator, so they are not part of the text.
                    text: formatMessage({
                        id: 'collections.callMethod',
                        default: 'call method [METHOD] of instance [INSTANCE]',
                        description: 'Run a method of an instance with the arguments added to the block'
                    }),
                    mutator: true,
                    arguments: {
                        METHOD: {
                            type: ArgumentType.STRING,
                            defaultValue: 'greet'
                        },
                        INSTANCE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'callMethodResult',
                    blockType: BlockType.REPORTER,
                    // The argument inputs are added by the block's mutator, so they are not part of the text.
                    text: formatMessage({
                        id: 'collections.callMethodResult',
                        default: 'result of call method [METHOD] of instance [INSTANCE]',
                        description: 'Run a method of an instance and report the value it returns'
                    }),
                    mutator: true,
                    // A method can do anything, so reading this block must not run the method every frame.
                    disableMonitor: true,
                    arguments: {
                        METHOD: {
                            type: ArgumentType.STRING,
                            defaultValue: 'greet'
                        },
                        INSTANCE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'classNameOf',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.classNameOf',
                        default: 'class of instance [INSTANCE]',
                        description: 'Get the class an instance was created from'
                    }),
                    arguments: {
                        INSTANCE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'isA',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'collections.isA',
                        default: 'instance [INSTANCE] is a [CLASS]?',
                        description: 'Check whether an instance belongs to a class, directly or through a parent'
                    }),
                    arguments: {
                        INSTANCE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        CLASS: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Thing'
                        }
                    }
                },
                '---',
                {
                    opcode: 'getProperty',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.getProperty',
                        default: 'property [PROPERTY] of instance [INSTANCE]',
                        description: 'Read a property of an instance, including ones inherited from its classes'
                    }),
                    arguments: {
                        PROPERTY: {
                            type: ArgumentType.STRING,
                            defaultValue: 'name'
                        },
                        INSTANCE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'setProperty',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.setProperty',
                        default: 'set property [PROPERTY] of instance [INSTANCE] to [VALUE]',
                        description: 'Set a property on one instance'
                    }),
                    arguments: {
                        PROPERTY: {
                            type: ArgumentType.STRING,
                            defaultValue: 'name'
                        },
                        INSTANCE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'setSharedProperty',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.setSharedProperty',
                        default: 'set shared property [PROPERTY] of class [CLASS] to [VALUE]',
                        description: 'Set a property on a class, which every instance without its own copy uses'
                    }),
                    arguments: {
                        PROPERTY: {
                            type: ArgumentType.STRING,
                            defaultValue: 'name'
                        },
                        CLASS: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Thing'
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                '---',
                {
                    opcode: 'newMap',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'collections.newMap',
                        default: 'new map',
                        description: 'Create an empty map, an object which does not belong to a class'
                    })
                },
                {
                    opcode: 'setMapKey',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.setMapKey',
                        default: 'set key [KEY] of map [MAP] to [VALUE]',
                        description: 'Set a value in a map'
                    }),
                    arguments: {
                        KEY: {
                            type: ArgumentType.STRING,
                            defaultValue: 'key'
                        },
                        MAP: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'getMapKey',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.getMapKey',
                        default: 'key [KEY] of map [MAP]',
                        description: 'Read a value from a map'
                    }),
                    arguments: {
                        KEY: {
                            type: ArgumentType.STRING,
                            defaultValue: 'key'
                        },
                        MAP: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'mapHasKey',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'collections.mapHasKey',
                        default: 'map [MAP] has key [KEY]?',
                        description: 'Check whether a map has a key'
                    }),
                    arguments: {
                        MAP: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        KEY: {
                            type: ArgumentType.STRING,
                            defaultValue: 'key'
                        }
                    }
                },
                {
                    opcode: 'deleteMapKey',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.deleteMapKey',
                        default: 'delete key [KEY] of map [MAP]',
                        description: 'Remove a key from a map'
                    }),
                    arguments: {
                        KEY: {
                            type: ArgumentType.STRING,
                            defaultValue: 'key'
                        },
                        MAP: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'mapKeys',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.mapKeys',
                        default: 'keys of map [MAP]',
                        description: 'List the keys of a map, separated by commas'
                    }),
                    arguments: {
                        MAP: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                '---',
                {
                    opcode: 'newArray',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'collections.newArray',
                        default: 'new array',
                        description: 'Create an empty array'
                    })
                },
                {
                    opcode: 'arrayPush',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.arrayPush',
                        default: 'add [VALUE] to array [ARRAY]',
                        description: 'Add a value to the end of an array'
                    }),
                    arguments: {
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        ARRAY: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'arrayGet',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.arrayGet',
                        default: 'item [INDEX] of array [ARRAY]',
                        description: 'Read an item of an array; the first item is 1'
                    }),
                    arguments: {
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        ARRAY: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'arraySet',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'collections.arraySet',
                        default: 'set item [INDEX] of array [ARRAY] to [VALUE]',
                        description: 'Replace an item of an array'
                    }),
                    arguments: {
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        ARRAY: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'arrayLength',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.arrayLength',
                        default: 'length of array [ARRAY]',
                        description: 'Count the items of an array'
                    }),
                    arguments: {
                        ARRAY: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                '---',
                {
                    opcode: 'toJSON',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.toJSON',
                        default: 'json of [VALUE]',
                        description: 'Convert a map, array or instance into JSON text'
                    }),
                    arguments: {
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'parseJSON',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'collections.parseJSON',
                        default: 'parse json [TEXT]',
                        description: 'Turn JSON text into maps and arrays'
                    }),
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: '{}'
                        }
                    }
                }
            ]
        };
    }

    /**
     * Forget every object, so a project which loads starts from a clean slate.
     * @private
     */
    _onProjectLoaded () {
        this._reset();
    }

    /**
     * @private
     */
    _reset () {
        /**
         * Every class the project declared, by name.
         * @type {Map.<string, ClassDefinition>}
         * @private
         */
        this._classes = new Map();

        /**
         * Instances which scripts can still refer to, by the handle the create block reported.
         * @type {Map.<string, object>}
         * @private
         */
        this._instances = new Map();

        /**
         * Maps, by handle.
         * @type {Map.<string, Map.<string, *>>}
         * @private
         */
        this._maps = new Map();

        /**
         * Arrays, by handle.
         * @type {Map.<string, Array.<*>>}
         * @private
         */
        this._arrays = new Map();

        /**
         * Number used to build the handle of the next object.
         * @type {number}
         * @private
         */
        this._nextObjectNumber = 1;
    }

    /**
     * Names of every class the project declared, in declaration order.
     * @returns {Array.<string>} the class names.
     */
    getClassNames () {
        return Array.from(this._classes.keys());
    }

    defineClass (args, util) {
        const name = Cast.toString(args.NAME).trim();
        if (!name) return '';
        const classDef = this._classes.get(name) || new ClassDefinition(name);
        classDef.parentNames = this._parseParentNames(args.PARENTS);
        classDef.methods = new Map();
        classDef.constructorCode = null;
        if (util && util.target && util.blockId) {
            this._readClassBody(util.target, util.blockId, classDef);
        }
        this._classes.set(name, classDef);
        return name;
    }

    declareField (args, util) {
        this._warnMisplacedDeclaration('field', util);
    }

    declareMethod (args, util) {
        this._warnMisplacedDeclaration('method', util);
    }

    declareConstructor (args, util) {
        this._warnMisplacedDeclaration('constructor', util);
    }

    newInstance (args, util) {
        const classDef = this._classes.get(Cast.toString(args.CLASS).trim());
        if (!classDef) return '';
        const handle = `#${this._nextObjectNumber++}`;
        const instance = {
            classDef: classDef,
            handle: handle,
            members: new Map()
        };
        this._instances.set(handle, instance);
        this._runConstructor(classDef, instance, util);
        return handle;
    }

    callMethod (args, util) {
        const instance = this._getInstance(args.INSTANCE);
        if (!instance) return;
        const procedureCode = this._lookupMethod(
            instance.classDef,
            Cast.toString(args.METHOD).trim(),
            new Set()
        );
        if (!procedureCode || !util.target) return;
        const procedureInfo = util.getProcedureParamNamesIdsAndDefaults(procedureCode);
        if (!procedureInfo) return;

        // Returning from the method runs this block again, so start the procedure only once.
        if (util.stackFrame.callStarted) return;
        util.stackFrame.callStarted = true;

        const values = args.ARGS === undefined ?
            this._argumentValuesFromBlock(args, util) :
            this._argumentValues(args.ARGS);
        this._pushProcedureParams(util, procedureInfo, instance, values);
        util.startProcedure(procedureCode);
    }

    /**
     * Run a method of an instance and report the value it returns.
     * @param {object} args - the block's arguments.
     * @param {BlockUtility} util - the block utility for the calling block.
     * @returns {?(object|string)} the value the method returns, or an empty value.
     */
    callMethodResult (args, util) {
        const instance = this._getInstance(args.INSTANCE);
        if (!instance) return '';
        const procedureCode = this._lookupMethod(
            instance.classDef,
            Cast.toString(args.METHOD).trim(),
            new Set()
        );
        if (!procedureCode || !util.target) return '';
        const procedureInfo = util.getProcedureParamNamesIdsAndDefaults(procedureCode);
        if (!procedureInfo) return '';

        const values = args.ARGS === undefined ?
            this._argumentValuesFromBlock(args, util) :
            this._argumentValues(args.ARGS);
        this._pushProcedureParams(util, procedureInfo, instance, values);
        // The method starts on its own thread, and this block waits for the value its return
        // block reports instead of continuing with the rest of the script.
        const returned = util.startProcedureReturning(procedureCode);
        return returned === null ? '' : returned;
    }

    classNameOf (args) {
        const instance = this._getInstance(args.INSTANCE);
        return instance ? instance.classDef.name : '';
    }

    isA (args) {
        const instance = this._getInstance(args.INSTANCE);
        if (!instance) return false;
        return this._classMatches(instance.classDef, Cast.toString(args.CLASS).trim(), new Set());
    }

    getProperty (args) {
        const instance = this._getInstance(args.INSTANCE);
        if (!instance) return '';
        const value = this._lookupProperty(instance, Cast.toString(args.PROPERTY).trim());
        return value === undefined ? '' : value;
    }

    setProperty (args) {
        const instance = this._getInstance(args.INSTANCE);
        if (!instance) return;
        instance.members.set(Cast.toString(args.PROPERTY).trim(), args.VALUE);
    }

    setSharedProperty (args) {
        const classDef = this._classes.get(Cast.toString(args.CLASS).trim());
        if (!classDef) return;
        classDef.members.set(Cast.toString(args.PROPERTY).trim(), args.VALUE);
    }

    newMap () {
        const handle = `{${this._nextObjectNumber++}}`;
        this._maps.set(handle, new Map());
        return handle;
    }

    setMapKey (args) {
        const map = this._getMap(args.MAP);
        if (!map) return;
        map.set(this._mapKey(args.KEY), args.VALUE);
    }

    getMapKey (args) {
        const map = this._getMap(args.MAP);
        if (!map) return '';
        const value = map.get(this._mapKey(args.KEY));
        return value === undefined ? '' : value;
    }

    mapHasKey (args) {
        const map = this._getMap(args.MAP);
        return map ? map.has(this._mapKey(args.KEY)) : false;
    }

    deleteMapKey (args) {
        const map = this._getMap(args.MAP);
        if (!map) return;
        map.delete(this._mapKey(args.KEY));
    }

    mapKeys (args) {
        const map = this._getMap(args.MAP);
        return map ? Array.from(map.keys()).join(', ') : '';
    }

    newArray () {
        const handle = `[${this._nextObjectNumber++}]`;
        this._arrays.set(handle, []);
        return handle;
    }

    arrayPush (args) {
        const array = this._getArray(args.ARRAY);
        if (!array) return;
        array.push(args.VALUE);
    }

    arrayGet (args) {
        const array = this._getArray(args.ARRAY);
        if (!array) return '';
        const index = this._arrayIndex(args.INDEX);
        return index >= 0 && index < array.length ? array[index] : '';
    }

    arraySet (args) {
        const array = this._getArray(args.ARRAY);
        if (!array) return;
        const index = this._arrayIndex(args.INDEX);
        if (index >= 0 && index < array.length) array[index] = args.VALUE;
    }

    arrayLength (args) {
        const array = this._getArray(args.ARRAY);
        return array ? array.length : 0;
    }

    toJSON (args) {
        return JSON.stringify(this._toPlain(args.VALUE));
    }

    parseJSON (args) {
        const text = Cast.toString(args.TEXT);
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            log.warn(`collections: parse json could not read ${JSON.stringify(text)}: ${e.message}`);
            return '';
        }
        return this._fromPlain(data);
    }

    /**
     * Read the declarations from the body of a class block.
     * @param {Target} target - the target holding the class block.
     * @param {string} blockId - the id of the class block.
     * @param {ClassDefinition} classDef - the class to fill.
     * @private
     */
    _readClassBody (target, blockId, classDef) {
        const blocks = target.blocks;
        const classBlock = blocks.getBlock(blockId);
        if (!classBlock) return;
        const substack = classBlock.inputs ? classBlock.inputs.SUBSTACK : null;
        let childId = substack ? substack.block : null;
        while (childId) {
            const child = blocks.getBlock(childId);
            if (!child) break;
            switch (child.opcode) {
            case 'collections_declareField': {
                const fieldName = Cast.toString(this._readLiteralInput(blocks, child, 'NAME')).trim();
                if (fieldName) {
                    classDef.members.set(fieldName, this._readLiteralInput(blocks, child, 'VALUE'));
                }
                break;
            }
            case 'collections_declareMethod': {
                const method = this._readProcedureDeclaration(blocks, child, 'method');
                if (method) classDef.methods.set(method.name, method.procedureCode);
                break;
            }
            case 'collections_declareConstructor': {
                const constructor = this._readProcedureDeclaration(blocks, child, 'constructor');
                if (constructor) classDef.constructorCode = constructor.procedureCode;
                break;
            }
            }
            childId = child.next;
        }
    }

    /**
     * Read a method or constructor declaration: its name, and the procedure block in its slot.
     * @param {Blocks} blocks - the target's block container.
     * @param {object} block - the declaration block.
     * @param {string} kind - 'method' or 'constructor', for messages.
     * @returns {?object} the declaration's name and procedure code, or null when it has no procedure.
     * @private
     */
    _readProcedureDeclaration (blocks, block, kind) {
        const procedureCode = this._readProcedureCode(blocks, block, 'PROCEDURE');
        if (!procedureCode) {
            log.warn(`collections: the ${kind} declared at block ${block.id} has no procedure in its slot, ` +
                'so it was ignored; drag a call block for the procedure into it');
            return null;
        }
        const name = Cast.toString(this._readLiteralInput(blocks, block, 'NAME')).trim() ||
            this._procedureName(procedureCode);
        return {name: name, procedureCode: procedureCode};
    }

    /**
     * Find the procedure code of the procedure block sitting in a declaration's input.
     * @param {Blocks} blocks - the target's block container.
     * @param {object} block - the declaration block.
     * @param {string} inputName - the input holding the procedure block.
     * @returns {?string} the procedure code, or null when the input holds no procedure.
     * @private
     */
    _readProcedureCode (blocks, block, inputName) {
        const input = block.inputs ? block.inputs[inputName] : null;
        const inputBlock = input && input.block ? blocks.getBlock(input.block) : null;
        if (!inputBlock) return null;
        if (inputBlock.opcode === 'procedures_call') {
            return inputBlock.mutation ? inputBlock.mutation.proccode : null;
        }
        if (inputBlock.opcode === 'procedures_definition') {
            const customBlock = inputBlock.inputs ? inputBlock.inputs.custom_block : null;
            const prototype = customBlock && customBlock.block ? blocks.getBlock(customBlock.block) : null;
            return prototype && prototype.mutation ? prototype.mutation.proccode : null;
        }
        return null;
    }

    /**
     * @param {string} procedureCode - a procedure code such as `greet %s`.
     * @returns {string} the procedure's name, `greet`.
     * @private
     */
    _procedureName (procedureCode) {
        return Cast.toString(procedureCode).split(' ')[0];
    }

    /**
     * Read the literal value filling one input of a declaration block. Declarations are read rather
     * than run, so a reporter dropped into an input is not evaluated.
     * @param {Blocks} blocks - the target's block container.
     * @param {object} block - the declaration block.
     * @param {string} inputName - the input to read.
     * @returns {*} the value of the literal in the input, or an empty string.
     * @private
     */
    _readLiteralInput (blocks, block, inputName) {
        const input = block.inputs ? block.inputs[inputName] : null;
        const inputBlock = input && input.block ? blocks.getBlock(input.block) : null;
        if (!inputBlock) return '';
        const fields = inputBlock.fields || {};
        switch (inputBlock.opcode) {
        case 'text':
            return fields.TEXT ? fields.TEXT.value : '';
        case 'math_number':
        case 'math_positive_number':
        case 'math_whole_number':
        case 'math_integer':
        case 'math_angle':
            return fields.NUM ? Number(fields.NUM.value) : 0;
        case 'colour_picker':
            return fields.COLOUR ? fields.COLOUR.value : '';
        default:
            return '';
        }
    }

    /**
     * Warn that a declaration block only means something inside a class block.
     * @param {string} kind - which declaration was run.
     * @param {object} util - the block utility, for context.
     * @private
     */
    _warnMisplacedDeclaration (kind, util) {
        const targetId = util && util.target ? util.target.id : 'unknown target';
        log.warn(`collections: a ${kind} block was run outside a class block on target ${targetId}, ` +
            'so it did nothing; declarations are read from the body of a class block');
    }

    /**
     * Run a class's constructor for a newly created instance. The constructor starts on the thread
     * which created the instance, so it runs before that script continues with its next block.
     * @param {ClassDefinition} classDef - the class being instantiated.
     * @param {object} instance - the new instance.
     * @param {object} util - the block utility of the block which created the instance.
     * @private
     */
    _runConstructor (classDef, instance, util) {
        const procedureCode = this._lookupConstructor(classDef, new Set());
        if (!procedureCode || !util || !util.target) return;
        const procedureInfo = util.getProcedureParamNamesIdsAndDefaults(procedureCode);
        if (!procedureInfo) return;
        this._pushProcedureParams(util, procedureInfo, instance, []);
        util.startProcedure(procedureCode);
    }

    /**
     * Store a procedure's parameters, with the instance's handle as the first one.
     * @param {BlockUtility} util - utility for the thread which will run the procedure.
     * @param {Array.<Array>} procedureInfo - names, ids and defaults of the parameters.
     * @param {object} instance - the instance the method or constructor belongs to.
     * @param {Array.<*>} extraArgs - values for the parameters after the instance.
     * @private
     */
    _pushProcedureParams (util, procedureInfo, instance, extraArgs) {
        const [paramNames, paramIds, paramDefaults] = procedureInfo;
        util.initParams();
        paramNames.forEach((paramName, index) => {
            let value = paramDefaults[index];
            if (index === 0) {
                value = instance.handle;
            } else if (index - 1 < extraArgs.length) {
                value = extraArgs[index - 1];
            }
            util.pushParam(paramName, value);
        });
    }

    /**
     * Read a property from an instance or, failing that, from its classes.
     * @param {object} instance - the instance to read from.
     * @param {string} propertyName - the name of the property.
     * @returns {*} the value, or undefined when nothing in the instance's classes has it.
     * @private
     */
    _lookupProperty (instance, propertyName) {
        if (instance.members.has(propertyName)) {
            return instance.members.get(propertyName);
        }
        return this._lookupClassMember(instance.classDef, propertyName, new Set());
    }

    /**
     * Walk a class's parents for a property, visiting each class once so that diamond-shaped
     * inheritance works. The first class in depth-first, parent-order wins, so a class's own
     * properties override its parents' and earlier parents override later ones.
     * @param {?ClassDefinition} classDef - the class to search.
     * @param {string} propertyName - the name of the property.
     * @param {Set.<string>} visited - class names already searched.
     * @returns {*} the value, or undefined when no class in the graph has it.
     * @private
     */
    _lookupClassMember (classDef, propertyName, visited) {
        if (!classDef || visited.has(classDef.name)) return undefined;
        visited.add(classDef.name);
        if (classDef.members.has(propertyName)) {
            return classDef.members.get(propertyName);
        }
        for (const parentName of classDef.parentNames) {
            const value = this._lookupClassMember(this._classes.get(parentName), propertyName, visited);
            if (value !== undefined) return value;
        }
        return undefined;
    }

    /**
     * Find the procedure a class gives for a method, including one inherited from a parent.
     * @param {?ClassDefinition} classDef - the class to search.
     * @param {string} methodName - the method name.
     * @param {Set.<string>} visited - class names already searched.
     * @returns {?string} the procedure code, or null when no class in the graph has the method.
     * @private
     */
    _lookupMethod (classDef, methodName, visited) {
        if (!classDef || visited.has(classDef.name)) return null;
        if (classDef.methods.has(methodName)) return classDef.methods.get(methodName);
        visited.add(classDef.name);
        for (const parentName of classDef.parentNames) {
            const procedureCode = this._lookupMethod(this._classes.get(parentName), methodName, visited);
            if (procedureCode) return procedureCode;
        }
        return null;
    }

    /**
     * Find the constructor a class uses, including one inherited from a parent.
     * @param {?ClassDefinition} classDef - the class to check.
     * @param {Set.<string>} visited - class names already checked.
     * @returns {?string} the constructor's procedure code, or null.
     * @private
     */
    _lookupConstructor (classDef, visited) {
        if (!classDef || visited.has(classDef.name)) return null;
        if (classDef.constructorCode) return classDef.constructorCode;
        visited.add(classDef.name);
        for (const parentName of classDef.parentNames) {
            const procedureCode = this._lookupConstructor(this._classes.get(parentName), visited);
            if (procedureCode) return procedureCode;
        }
        return null;
    }

    /**
     * Whether a class is, or inherits from, the named class.
     * @param {?ClassDefinition} classDef - the class to check.
     * @param {string} className - the name to look for.
     * @param {Set.<string>} visited - class names already checked.
     * @returns {boolean} true when the class matches or has a matching ancestor.
     * @private
     */
    _classMatches (classDef, className, visited) {
        if (!classDef || visited.has(classDef.name)) return false;
        if (classDef.name === className) return true;
        visited.add(classDef.name);
        return classDef.parentNames.some(
            parentName => this._classMatches(this._classes.get(parentName), className, visited)
        );
    }

    /**
     * Convert a Scratch value into plain data, so it can be written as JSON.
     * @param {*} value - the value to convert.
     * @returns {*} plain data.
     * @private
     */
    _toPlain (value) {
        const instance = this._instances.get(Cast.toString(value));
        if (instance) {
            const properties = {};
            this._collectMembers(instance.classDef, properties, new Set());
            for (const [key, member] of instance.members) {
                properties[key] = this._toPlain(member);
            }
            return properties;
        }
        const map = this._maps.get(Cast.toString(value));
        if (map) {
            const result = {};
            for (const [key, entry] of map) {
                result[key] = this._toPlain(entry);
            }
            return result;
        }
        const array = this._arrays.get(Cast.toString(value));
        if (array) {
            return array.map(entry => this._toPlain(entry));
        }
        return value;
    }

    /**
     * Collect the properties a class gives its instances, with nearer classes winning.
     * @param {?ClassDefinition} classDef - the class to read.
     * @param {object} properties - the properties collected so far.
     * @param {Set.<string>} visited - class names already read.
     * @private
     */
    _collectMembers (classDef, properties, visited) {
        if (!classDef || visited.has(classDef.name)) return;
        visited.add(classDef.name);
        for (const [key, member] of classDef.members) {
            if (!Object.prototype.hasOwnProperty.call(properties, key)) {
                properties[key] = this._toPlain(member);
            }
        }
        for (const parentName of classDef.parentNames) {
            this._collectMembers(this._classes.get(parentName), properties, visited);
        }
    }

    /**
     * Turn parsed JSON into maps, arrays and plain values.
     * @param {*} data - parsed JSON.
     * @returns {*} a handle for an object or array, otherwise the value itself.
     * @private
     */
    _fromPlain (data) {
        if (Array.isArray(data)) {
            const handle = this.newArray();
            const array = this._arrays.get(handle);
            for (const entry of data) {
                array.push(this._fromPlain(entry));
            }
            return handle;
        }
        if (data && typeof data === 'object') {
            const handle = this.newMap();
            const map = this._maps.get(handle);
            for (const key of Object.keys(data)) {
                map.set(key, this._fromPlain(data[key]));
            }
            return handle;
        }
        if (data === null || typeof data === 'undefined') return '';
        return data;
    }

    /**
     * @param {*} handle - an instance handle reported by the create block.
     * @returns {?object} the instance, if it still exists.
     * @private
     */
    _getInstance (handle) {
        return this._instances.get(Cast.toString(handle).trim()) || null;
    }

    /**
     * @param {*} handle - a map handle reported by the new map block.
     * @returns {?Map} the map, if it still exists.
     * @private
     */
    _getMap (handle) {
        return this._maps.get(Cast.toString(handle).trim()) || null;
    }

    /**
     * @param {*} handle - an array handle reported by the new array block.
     * @returns {?Array} the array, if it still exists.
     * @private
     */
    _getArray (handle) {
        return this._arrays.get(Cast.toString(handle).trim()) || null;
    }

    /**
     * @param {*} key - a map key.
     * @returns {string} the key as text, which is how maps identify their entries.
     * @private
     */
    _mapKey (key) {
        return Cast.toString(key);
    }

    /**
     * @param {*} index - a one-based array index.
     * @returns {number} the matching zero-based index.
     * @private
     */
    _arrayIndex (index) {
        return Math.round(Cast.toNumber(index)) - 1;
    }

    /**
     * Split the comma-separated parents of a class.
     * @param {*} value - the parents argument of the class block.
     * @returns {Array.<string>} the parent class names.
     * @private
     */
    _parseParentNames (value) {
        return Cast.toString(value)
            .split(/[,;]/)
            .map(name => name.trim())
            .filter(name => name.length > 0);
    }

    /**
     * Read the arguments a call block got from its mutator: the values of its ARG1, ARG2... inputs, in
     * the order the inputs appear on the block.
     * @param {object} args - the block's arguments.
     * @param {object} util - the block utility, used to find the call block's own inputs.
     * @returns {Array.<*>} the argument values, after the instance.
     * @private
     */
    _argumentValuesFromBlock (args, util) {
        const block = util && util.blockId && util.target ?
            util.target.blocks.getBlock(util.blockId) : null;
        const names = Object.keys(block ? block.inputs : args)
            .filter(name => /^ARG\d+$/.test(name));
        if (names.length === 0) return [];
        // An input the project left empty is not among the block's inputs, so neighbouring inputs would
        // otherwise slide into its place: read every position up to the last input instead.
        const count = Math.max(...names.map(name => Number(name.slice(3))));
        return Array.from({length: count}, (unused, index) => {
            const value = args[`ARG${index + 1}`];
            return value === undefined ? '' : value;
        });
    }

    /**
     * Read the arguments of a method call: either an array, or a comma-separated list of values.
     * @param {*} value - the arguments argument of the call block.
     * @returns {Array.<*>} the argument values, after the instance.
     * @private
     */
    _argumentValues (value) {
        const text = Cast.toString(value);
        const array = this._arrays.get(text.trim());
        if (array) return array.slice();
        if (!text.trim()) return [];
        return text.split(',').map(argument => argument.trim());
    }
}

module.exports = Scratch3CollectionsBlocks;
