const test = require('tap').test;
const Runtime = require('../../src/engine/runtime');
const Sequencer = require('../../src/engine/sequencer');
const Thread = require('../../src/engine/thread');
const RenderedTarget = require('../../src/sprites/rendered-target');
const Sprite = require('../../src/sprites/sprite');
const TempVars = require('../../src/extensions/scratch3_tempvars');

const makeRuntime = () => {
    const handlers = Object.create(null);
    return {
        handlers,
        on: (event, handler) => {
            handlers[event] = handler;
        }
    };
};

const makeThread = (blocks, stack) => {
    const thread = new Thread(stack[0]);
    thread.target = {
        blocks: {
            getBlock: id => blocks[id]
        }
    };
    for (const blockId of stack) {
        thread.pushStack(blockId);
    }
    return thread;
};

const makeBlocks = () => new TempVars(makeRuntime());

const set = (blocks, util, scope, name, value) => blocks.setVariable({
    SCOPE: scope, VARIABLE: name, VALUE: value
}, util);

const get = (blocks, util, scope, name) => blocks.getVariable({
    SCOPE: scope, VARIABLE: name
}, util);

const changed = (blocks, util, scope, name, value) => blocks.changeVariable({
    SCOPE: scope, VARIABLE: name, VALUE: value
}, util);

const exists = (blocks, util, scope, name) => blocks.variableExists({
    SCOPE: scope, VARIABLE: name
}, util);

const addBlock = (target, data) => target.blocks.createBlock(Object.assign({
    fields: {},
    inputs: {},
    next: null,
    parent: null,
    topLevel: false,
    shadow: false
}, data));

const addText = (target, id, value, parent) => addBlock(target, {
    id,
    opcode: 'text',
    parent,
    shadow: true,
    fields: {
        TEXT: {
            name: 'TEXT',
            value
        }
    }
});

const addProcedureBody = target => {
    addBlock(target, {
        id: 'definition',
        opcode: 'procedures_definition',
        topLevel: true,
        next: 'set',
        inputs: {
            custom_block: {
                name: 'custom_block',
                block: 'prototype'
            }
        }
    });
    addBlock(target, {
        id: 'prototype',
        opcode: 'procedures_prototype',
        parent: 'definition',
        shadow: true,
        mutation: {
            tagName: 'mutation',
            children: [],
            proccode: 'do',
            argumentids: '[]',
            argumentnames: '[]',
            argumentdefaults: '[]',
            warp: 'false'
        }
    });
    addBlock(target, {
        id: 'set',
        opcode: 'test_setVar',
        parent: 'definition',
        next: 'captureBody',
        inputs: {
            NAME: {name: 'NAME', block: 'setName'},
            VALUE: {name: 'VALUE', block: 'setValue'}
        }
    });
    addText(target, 'setName', 'x', 'set');
    addText(target, 'setValue', 'inner', 'set');
    addBlock(target, {
        id: 'captureBody',
        opcode: 'test_capture',
        parent: 'set',
        inputs: {
            VALUE: {name: 'VALUE', block: 'getBody'}
        }
    });
    addBlock(target, {
        id: 'getBody',
        opcode: 'test_getVar',
        parent: 'captureBody',
        inputs: {
            NAME: {name: 'NAME', block: 'getBodyName'}
        }
    });
    addText(target, 'getBodyName', 'x', 'getBody');
};

const addCaller = (target, returns) => {
    addBlock(target, {
        id: 'call',
        opcode: 'procedures_call',
        topLevel: true,
        next: 'captureCaller',
        mutation: {
            tagName: 'mutation',
            children: [],
            proccode: 'do',
            argumentids: '[]',
            warp: 'false',
            returns: returns ? 'true' : 'false'
        }
    });
    addBlock(target, {
        id: 'captureCaller',
        opcode: 'test_capture',
        parent: 'call',
        inputs: {
            VALUE: {name: 'VALUE', block: 'getCaller'}
        }
    });
    addBlock(target, {
        id: 'getCaller',
        opcode: 'test_getVar',
        parent: 'captureCaller',
        inputs: {
            NAME: {name: 'NAME', block: 'getCallerName'}
        }
    });
    addText(target, 'getCallerName', 'x', 'getCaller');
};

const makeTarget = runtime => {
    const target = new RenderedTarget(new Sprite(null, runtime), runtime);
    runtime.targets.push(target);
    return target;
};

const addTempVars = (runtime, target, captured) => {
    const blocks = new TempVars(runtime);
    runtime._primitives.test_capture = args => captured.push(args.VALUE);
    runtime._primitives.test_setVar = (args, util) => blocks.setVariable({
        SCOPE: 'function', VARIABLE: args.NAME, VALUE: args.VALUE
    }, util);
    runtime._primitives.test_getVar = (args, util) => blocks.getVariable({
        SCOPE: 'function', VARIABLE: args.NAME
    }, util);
};

const runToCompletion = async (runtime, sequencer) => {
    for (let i = 0; i < 50 && runtime.threads.length > 0; i++) {
        sequencer.stepThreads();
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setImmediate(resolve));
    }
};

const runProcedure = async returns => {
    const runtime = new Runtime();
    runtime.currentStepTime = Infinity;
    const sequencer = new Sequencer(runtime);
    const target = makeTarget(runtime);
    const captured = [];

    addTempVars(runtime, target, captured);
    addProcedureBody(target);
    addCaller(target, returns);

    runtime._pushThread('call', target);
    await runToCompletion(runtime, sequencer);

    return captured;
};

test('getInfo exposes the three scopes and their blocks', t => {
    const info = makeBlocks().getInfo();
    t.equal(info.id, 'tempvars');
    t.same(info.menus.scope.items.map(item => item.value), ['thread', 'function', 'runtime']);
    t.same(
        info.blocks.filter(block => typeof block === 'object').map(block => block.opcode),
        [
            'setVariable',
            'changeVariable',
            'getVariable',
            'variableExists',
            'createVariable',
            'deleteVariable',
            'deleteAllVariables'
        ]
    );
    t.end();
});

test('runtime variables are read, written, deleted and cleared', t => {
    const runtime = makeRuntime();
    const blocks = new TempVars(runtime);
    const util = {thread: makeThread({}, [])};

    set(blocks, util, 'runtime', 'score', 1);
    t.equal(get(blocks, util, 'runtime', 'score'), 1, 'reports the value it was set to');
    changed(blocks, util, 'runtime', 'score', '2');
    t.equal(get(blocks, util, 'runtime', 'score'), 3, 'changes numerically');
    t.ok(exists(blocks, util, 'runtime', 'score'), 'exists while set');
    t.equal(get(blocks, util, 'runtime', 'missing'), 0, 'missing variables report zero');

    blocks.createVariable({SCOPE: 'runtime', VARIABLE: 'score'}, util);
    t.equal(get(blocks, util, 'runtime', 'score'), 3, 'create keeps an existing value');
    blocks.createVariable({SCOPE: 'runtime', VARIABLE: 'other'}, util);
    t.ok(exists(blocks, util, 'runtime', 'other'), 'create makes a new variable');

    blocks.deleteVariable({SCOPE: 'runtime', VARIABLE: 'score'}, util);
    t.notOk(exists(blocks, util, 'runtime', 'score'), 'delete removes the variable');

    blocks.deleteAllVariables({SCOPE: 'runtime'}, util);
    t.notOk(exists(blocks, util, 'runtime', 'other'), 'delete all removes every variable');

    set(blocks, util, 'runtime', 'score', 1);
    runtime.handlers[Runtime.PROJECT_START]();
    t.equal(get(blocks, util, 'runtime', 'score'), 0, 'project start clears runtime variables');

    set(blocks, util, 'runtime', 'score', 1);
    runtime.handlers[Runtime.PROJECT_STOP_ALL]();
    t.equal(get(blocks, util, 'runtime', 'score'), 0, 'project stop clears runtime variables');
    t.end();
});

test('thread variables live on the thread', t => {
    const blocks = makeBlocks();
    const thread = makeThread({}, []);
    const otherThread = makeThread({}, []);
    const util = {thread};

    set(blocks, util, 'thread', 'local', 'value');
    t.equal(get(blocks, util, 'thread', 'local'), 'value');
    t.equal(get(blocks, {thread: otherThread}, 'thread', 'local'), 0, 'other threads do not see it');
    t.ok(thread.tempVars, 'variables are stored on util.thread');

    blocks.deleteAllVariables({SCOPE: 'thread'}, util);
    t.notOk(exists(blocks, util, 'thread', 'local'), 'delete all clears the thread scope');
    t.end();
});

test('function variables belong to the innermost procedure body', t => {
    const blocks = makeBlocks();
    const definition = {opcode: 'procedures_definition'};
    const blocksById = {
        outerDefinition: definition,
        innerDefinition: definition,
        body: {opcode: 'control_wait'},
        call: {opcode: 'procedures_call'}
    };
    const thread = makeThread(blocksById, ['outerDefinition']);
    const util = {thread};

    // Entering a procedure replaces the definition block with the first body
    // block at the same level, keeping the frame and its scope.
    thread.startFunctionScope();
    thread.reuseStackForNextBlock('body');

    set(blocks, util, 'function', 'local', 'outer');
    t.equal(get(blocks, util, 'function', 'local'), 'outer');

    thread.pushStack('call');
    thread.pushStack('innerDefinition');
    thread.startFunctionScope();
    thread.reuseStackForNextBlock('body');
    t.equal(get(blocks, util, 'function', 'local'), 0, 'outer function variables are not visible inside a nested function');
    set(blocks, util, 'function', 'local', 'inner');
    t.equal(get(blocks, util, 'function', 'local'), 'inner');

    thread.popStack();
    thread.popStack();
    t.equal(get(blocks, util, 'function', 'local'), 'outer', 'the outer function keeps its own variable');

    thread.popStack();
    thread.pushStack('outerDefinition');
    t.equal(thread.peekStackFrame().functionVariables, null, 'the next invocation starts without a scope');
    t.equal(get(blocks, util, 'function', 'local'), 0, 'function variables are cleared when the function stops');
    t.notOk(exists(blocks, util, 'function', 'local'));
    t.end();
});

test('function variables live on the procedure body that is running', async t => {
    t.same(await runProcedure(false), ['inner', 0],
        'a command call sees its variable in the body only');
    t.same(await runProcedure(true), ['inner', 0],
        'a returning call sees its variable in the body only');
    t.end();
});

test('a procedure definition run directly gets its own scope', async t => {
    const runtime = new Runtime();
    runtime.currentStepTime = Infinity;
    const sequencer = new Sequencer(runtime);
    const target = makeTarget(runtime);
    const captured = [];

    addTempVars(runtime, target, captured);
    addProcedureBody(target);

    runtime._pushThread('definition', target);
    await runToCompletion(runtime, sequencer);

    t.same(captured, ['inner'], 'the body reads the variable it set');
    t.end();
});

test('function variables are unavailable outside a function', t => {
    const blocks = makeBlocks();
    const util = {thread: makeThread({}, [])};

    t.doesNotThrow(() => set(blocks, util, 'function', 'local', 1));
    t.equal(get(blocks, util, 'function', 'local'), 0);
    t.notOk(exists(blocks, util, 'function', 'local'));
    t.doesNotThrow(() => blocks.deleteAllVariables({SCOPE: 'function'}, util));
    t.end();
});
