const test = require('tap').test;
const dispatch = require('../../src/dispatch/central-dispatch');
const RenderedTarget = require('../../src/sprites/rendered-target');
const Sprite = require('../../src/sprites/sprite');
const Variable = require('../../src/engine/variable');
const VirtualMachine = require('../../src/index');

/**
 * Add a block, filling in the properties every block has.
 * @param {Blocks} blocks - the target's block container.
 * @param {object} data - the block's properties.
 */
const add = (blocks, data) => {
    blocks.createBlock(Object.assign({
        fields: {},
        inputs: {},
        next: null,
        parent: null,
        topLevel: false,
        shadow: false
    }, data));
};

/**
 * Add a text block, as Scratch does for a typed input.
 * @param {Blocks} blocks - the container.
 * @param {string} id - the new block's id.
 * @param {string} parentId - the block holding the input.
 * @param {string} value - the text the input holds.
 */
const addTextInput = (blocks, id, parentId, value) => {
    add(blocks, {
        id: id,
        opcode: 'text',
        parent: parentId,
        shadow: true,
        fields: {TEXT: {name: 'TEXT', value: value}}
    });
};

/**
 * Add a procedure whose body sets a variable to its first argument.
 * @param {Blocks} blocks - the container.
 * @param {string} id - the id prefix of the blocks to add.
 * @param {string} procedureCode - the procedure's code.
 * @param {string} variableId - the variable its body writes.
 */
const addProcedure = (blocks, id, procedureCode, variableId) => {
    add(blocks, {
        id: `${id}Definition`,
        opcode: 'procedures_definition',
        topLevel: true,
        next: `${id}Body`,
        inputs: {custom_block: {name: 'custom_block', block: `${id}Prototype`}}
    });
    add(blocks, {
        id: `${id}Prototype`,
        opcode: 'procedures_prototype',
        parent: `${id}Definition`,
        shadow: true,
        mutation: {
            tagName: 'mutation',
            children: [],
            proccode: procedureCode,
            argumentids: '["msgId"]',
            argumentnames: '["MSG"]',
            argumentdefaults: '[""]',
            warp: 'false'
        }
    });
    add(blocks, {
        id: `${id}Body`,
        opcode: 'data_setvariableto',
        parent: `${id}Definition`,
        inputs: {VALUE: {name: 'VALUE', block: `${id}Arg`}},
        fields: {VARIABLE: {name: 'VARIABLE', value: variableId, id: variableId}}
    });
    add(blocks, {
        id: `${id}Arg`,
        opcode: 'argument_reporter_string_number',
        parent: `${id}Body`,
        fields: {VALUE: {name: 'VALUE', value: 'MSG'}}
    });
};

/**
 * Add a call block for a procedure, to drop into a method or constructor slot.
 * @param {Blocks} blocks - the container.
 * @param {string} id - the new block's id.
 * @param {string} parentId - the declaration block holding it.
 * @param {string} procedureCode - the procedure's code.
 */
const addProcedureCall = (blocks, id, parentId, procedureCode) => {
    add(blocks, {
        id: id,
        opcode: 'procedures_call',
        parent: parentId,
        mutation: {
            tagName: 'mutation',
            children: [],
            proccode: procedureCode,
            argumentids: '[]',
            warp: 'false'
        }
    });
};

/**
 * Step the sequencer until every thread has finished.
 * @param {VirtualMachine} vm - the VM to step.
 * @param {number} [maxSteps] - how many steps to allow.
 */
const runToIdle = (vm, maxSteps = 30) => {
    for (let i = 0; i < maxSteps && vm.runtime.threads.length > 0; i++) {
        vm.runtime.sequencer.stepThreads();
    }
};

/**
 * Build a stage with a class block whose body declares a field, a method and a constructor.
 * @param {VirtualMachine} vm - the VM holding the runtime.
 * @returns {RenderedTarget} the stage.
 */
const makeStage = vm => {
    const stage = new RenderedTarget(new Sprite(null, vm.runtime), vm.runtime);
    stage.isStage = true;
    vm.runtime.targets = [stage];
    stage.variables.varInit = new Variable('varInit', 'initResult', '');
    stage.variables.varGreet = new Variable('varGreet', 'greetResult', '');
    stage.variables.varNext = new Variable('varNext', 'nextResult', '');
    addProcedure(stage.blocks, 'init', 'init %s', 'varInit');
    addProcedure(stage.blocks, 'greet', 'greet %s', 'varGreet');

    add(stage.blocks, {
        id: 'classBlock',
        opcode: 'collections_defineClass',
        topLevel: true,
        inputs: {
            NAME: {name: 'NAME', block: 'className'},
            PARENTS: {name: 'PARENTS', block: 'classParents'},
            SUBSTACK: {name: 'SUBSTACK', block: 'fieldBlock'}
        }
    });
    addTextInput(stage.blocks, 'className', 'classBlock', 'Dog');
    addTextInput(stage.blocks, 'classParents', 'classBlock', 'Animal');

    add(stage.blocks, {
        id: 'fieldBlock',
        opcode: 'collections_declareField',
        parent: 'classBlock',
        next: 'methodBlock',
        inputs: {
            NAME: {name: 'NAME', block: 'fieldName'},
            VALUE: {name: 'VALUE', block: 'fieldValue'}
        }
    });
    addTextInput(stage.blocks, 'fieldName', 'fieldBlock', 'legs');
    addTextInput(stage.blocks, 'fieldValue', 'fieldBlock', '4');

    add(stage.blocks, {
        id: 'methodBlock',
        opcode: 'collections_declareMethod',
        parent: 'fieldBlock',
        next: 'constructorBlock',
        inputs: {
            NAME: {name: 'NAME', block: 'methodName'},
            PROCEDURE: {name: 'PROCEDURE', block: 'methodCall'}
        }
    });
    addTextInput(stage.blocks, 'methodName', 'methodBlock', '');
    addProcedureCall(stage.blocks, 'methodCall', 'methodBlock', 'greet %s');

    add(stage.blocks, {
        id: 'constructorBlock',
        opcode: 'collections_declareConstructor',
        parent: 'methodBlock',
        inputs: {
            NAME: {name: 'NAME', block: 'constructorName'},
            PROCEDURE: {name: 'PROCEDURE', block: 'constructorCall'}
        }
    });
    addTextInput(stage.blocks, 'constructorName', 'constructorBlock', '');
    addProcedureCall(stage.blocks, 'constructorCall', 'constructorBlock', 'init %s');

    return stage;
};

test('a meta block can have a branch, and starting a project creates its classes', t => {
    const vm = new VirtualMachine();
    vm.runtime.currentStepTime = Infinity;
    vm.extensionManager.loadExtensionIdSync('collections');

    // Extension registration runs through the dispatcher, so it lands on a later tick.
    setTimeout(() => {
        const categoryInfo = vm.runtime._blockInfo.find(info => info.id === 'collections');
        const convertedBlock = categoryInfo.blocks.find(
            block => block.json && block.json.type === 'collections_defineClass'
        );
        t.ok(convertedBlock, 'the class block is registered like any other extension block');
        t.equal(convertedBlock.info.blockType, 'meta');
        t.equal(convertedBlock.json.previousStatement, undefined, 'it has no previous connection');
        t.equal(convertedBlock.json.nextStatement, undefined, 'it has no next connection');
        t.equal(convertedBlock.json.output, undefined, 'it is not a reporter');
        const hasBranch = Object.keys(convertedBlock.json)
            .filter(key => key.startsWith('args'))
            .some(key => convertedBlock.json[key].some(
                argument => argument.type === 'input_statement' && argument.name === 'SUBSTACK'
            ));
        t.ok(hasBranch, 'it has a branch for the class body');

        const methodBlock = categoryInfo.blocks.find(
            block => block.json && block.json.type === 'collections_declareMethod'
        );
        const procedureInput = Object.keys(methodBlock.json)
            .filter(key => key.startsWith('args'))
            .map(key => methodBlock.json[key])
            .flat()
            .find(argument => argument.name === 'PROCEDURE');
        t.equal(procedureInput.type, 'input_block_single', 'the procedure slot holds a single block');

        const callBlock = categoryInfo.blocks.find(
            block => block.json && block.json.type === 'collections_callMethod'
        );
        t.equal(callBlock.info.isDynamic, true, 'a mutator block takes its layout from its mutation');
        t.ok(/<mutation blockInfo="/.test(callBlock.xml), 'its layout travels in the mutation');

        const stage = makeStage(vm);
        t.equal(vm.runtime.getMetaBlocks().length, 1, 'the runtime finds the meta block');

        const serviceName = vm.extensionManager._loadedExtensions.get('collections');
        const collections = dispatch.services[serviceName];

        vm.runtime.greenFlag();
        t.same(collections.getClassNames(), ['Dog'], 'starting the project created the class');
        t.equal(collections.getProperty({INSTANCE: collections.newInstance({CLASS: 'Dog'}), PROPERTY: 'legs'}),
            '4', 'the field declared in the class body belongs to instances');

        vm.quit();
        t.end();
    }, 500);
});

test('constructors and methods receive the instance as their first argument', t => {
    const vm = new VirtualMachine();
    vm.runtime.currentStepTime = Infinity;
    vm.extensionManager.loadExtensionIdSync('collections');

    setTimeout(() => {
        const stage = makeStage(vm);
        vm.runtime.greenFlag();

        const serviceName = vm.extensionManager._loadedExtensions.get('collections');
        const collections = dispatch.services[serviceName];

        // Creating an instance runs its constructor before the script continues.
        stage.variables.varHandle = new Variable('varHandle', 'instanceHandle', '');
        add(stage.blocks, {
            id: 'createScript',
            opcode: 'data_setvariableto',
            topLevel: true,
            next: 'afterCreate',
            inputs: {VALUE: {name: 'VALUE', block: 'newInstanceBlock'}},
            fields: {VARIABLE: {name: 'VARIABLE', value: 'varHandle', id: 'varHandle'}}
        });
        add(stage.blocks, {
            id: 'newInstanceBlock',
            opcode: 'collections_newInstance',
            parent: 'createScript',
            inputs: {CLASS: {name: 'CLASS', block: 'newInstanceClass'}}
        });
        addTextInput(stage.blocks, 'newInstanceClass', 'newInstanceBlock', 'Dog');
        add(stage.blocks, {
            id: 'afterCreate',
            opcode: 'data_setvariableto',
            parent: 'createScript',
            inputs: {VALUE: {name: 'VALUE', block: 'afterCreateText'}},
            fields: {VARIABLE: {name: 'VARIABLE', value: 'varNext', id: 'varNext'}}
        });
        addTextInput(stage.blocks, 'afterCreateText', 'afterCreate', 'after the constructor');

        vm.runtime._pushThread('createScript', stage);
        runToIdle(vm);
        const handle = stage.variables.varHandle.value;
        t.ok(handle, 'an instance was created');
        t.equal(stage.variables.varInit.value, handle,
            'the constructor ran with the instance as its first argument, before the next block');

        // Calling a method runs the procedure with the instance as its first argument.
        add(stage.blocks, {
            id: 'callBlock',
            opcode: 'collections_callMethod',
            topLevel: true,
            inputs: {
                METHOD: {name: 'METHOD', block: 'callMethodName'},
                INSTANCE: {name: 'INSTANCE', block: 'callInstance'},
                ARGS: {name: 'ARGS', block: 'callArgs'}
            }
        });
        addTextInput(stage.blocks, 'callMethodName', 'callBlock', 'greet');
        addTextInput(stage.blocks, 'callInstance', 'callBlock', handle);
        addTextInput(stage.blocks, 'callArgs', 'callBlock', '');

        vm.runtime._pushThread('callBlock', stage);
        runToIdle(vm);
        t.equal(stage.variables.varGreet.value, handle,
            'the method ran with the instance as its first argument');

        vm.quit();
        t.end();
    }, 500);
});

test('a compiled script runs the constructors and methods it calls', t => {
    const vm = new VirtualMachine();
    vm.runtime.currentStepTime = Infinity;
    vm.extensionManager.loadExtensionIdSync('collections');

    setTimeout(() => {
        const stage = makeStage(vm);
        stage.variables.varHandle = new Variable('varHandle', 'instanceHandle', '');
        vm.runtime.greenFlag();

        add(stage.blocks, {
            id: 'runHat',
            opcode: 'event_whenflagclicked',
            topLevel: true,
            next: 'runScript'
        });
        add(stage.blocks, {
            id: 'runScript',
            opcode: 'data_setvariableto',
            parent: 'runHat',
            next: 'callMethod',
            inputs: {VALUE: {name: 'VALUE', block: 'newInstanceBlock'}},
            fields: {VARIABLE: {name: 'VARIABLE', value: 'varHandle', id: 'varHandle'}}
        });
        add(stage.blocks, {
            id: 'newInstanceBlock',
            opcode: 'collections_newInstance',
            parent: 'runScript',
            inputs: {CLASS: {name: 'CLASS', block: 'newInstanceClass'}}
        });
        addTextInput(stage.blocks, 'newInstanceClass', 'newInstanceBlock', 'Dog');

        add(stage.blocks, {
            id: 'callMethod',
            opcode: 'collections_callMethod',
            parent: 'runScript',
            inputs: {
                METHOD: {name: 'METHOD', block: 'calledMethodName'},
                INSTANCE: {name: 'INSTANCE', block: 'instanceVariable'},
                ARG1: {name: 'ARG1', block: 'calledMethodArgument'}
            }
        });
        addTextInput(stage.blocks, 'calledMethodName', 'callMethod', 'greet');
        add(stage.blocks, {
            id: 'instanceVariable',
            opcode: 'data_variable',
            parent: 'callMethod',
            fields: {VARIABLE: {name: 'VARIABLE', value: 'varHandle', id: 'varHandle'}}
        });
        addTextInput(stage.blocks, 'calledMethodArgument', 'callMethod', 'compiled');

        const thread = vm.runtime._pushThread('runHat', stage);
        t.ok(thread.isCompiled, 'the script compiles');
        runToIdle(vm);

        const handle = stage.variables.varHandle.value;
        t.ok(handle, 'the instance was created');
        t.equal(stage.variables.varInit.value, handle, 'the constructor ran');
        t.equal(stage.variables.varGreet.value, handle, 'the method ran');

        vm.quit();
        t.end();
    }, 500);
});
