const test = require('tap').test;
const Runtime = require('../../src/engine/runtime');
const RenderedTarget = require('../../src/sprites/rendered-target');
const Sprite = require('../../src/sprites/sprite');
const Thread = require('../../src/engine/thread');

const makeBlock = (id, opcode, overrides) => Object.assign({
    id,
    opcode,
    inputs: {},
    fields: {},
    next: null,
    parent: null,
    topLevel: false,
    shadow: false
}, overrides);

const makeTarget = () => {
    const runtime = new Runtime();
    const sprite = new Sprite(null, runtime);
    const target = new RenderedTarget(sprite, runtime);

    target.createVariable('variableId', 'x', '');
    runtime.targets.push(target);
    runtime.currentStepTime = Infinity;

    return {runtime, target};
};

const addBlocks = (target, blocks) => {
    for (const block of blocks) {
        target.blocks.createBlock(block);
    }
};

const number = (id, value, parent) => makeBlock(id, 'math_number', {
    parent,
    shadow: true,
    fields: {NUM: {name: 'NUM', value: String(value)}}
});

const setVariableBlock = (id, parent, valueId) => makeBlock(id, 'data_setvariableto', {
    parent,
    fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
    inputs: {VALUE: {name: 'VALUE', block: valueId, shadow: valueId}}
});

const step = (runtime, times = 1) => {
    for (let i = 0; i < times; i++) {
        runtime.sequencer.stepThreads();
    }
};

test('compiles a hat script into a compiled thread', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'add'),
        makeBlock('add', 'operator_add', {
            parent: 'set',
            inputs: {
                NUM1: {name: 'NUM1', block: 'one', shadow: 'one'},
                NUM2: {name: 'NUM2', block: 'two', shadow: 'two'}
            }
        }),
        number('one', 1, 'add'),
        number('two', 2, 'add')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');
    t.ok(thread instanceof Thread, 'compiled thread is a thread');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 3, 'the compiled script ran');
    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('core blocks compile to direct target calls', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'move'}),
        makeBlock('move', 'motion_changexby', {
            parent: 'hat',
            inputs: {DX: {name: 'DX', block: 'five', shadow: 'five'}}
        }),
        number('five', 5, 'move')
    ]);

    const thread = runtime._pushThread('hat', target);
    const source = runtime.compiler.getFinishedWork();

    t.ok(thread.isCompiled, 'thread runs compiled');
    t.ok(runtime.isCoreOpcode('motion_changexby'), 'the block is a core block');
    t.match(source, /target\.setXY\(/, 'the block runs its own target calls');
    t.notMatch(source, /__primitive/, 'the block does not call its primitive');
    t.notMatch(source, /util\.enterBlock/, 'the block does not use the compatibility utility');

    step(runtime);

    t.equal(target.x, 5, 'the core block ran');
    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('extension blocks compile through the compatibility utility', t => {
    const {runtime, target} = makeTarget();

    runtime._primitives.test_nothing = () => {};

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'nothing'}),
        makeBlock('nothing', 'test_nothing', {parent: 'hat'})
    ]);

    const thread = runtime._pushThread('hat', target);
    const source = runtime.compiler.getFinishedWork();

    t.ok(thread.isCompiled, 'thread runs compiled');
    t.notOk(runtime.isCoreOpcode('test_nothing'), 'the block is not a core block');
    t.match(source, /util\.enterBlock\("nothing"\)/, 'the block is called with a stack frame');

    step(runtime);

    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('compiled source is a generator', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: null})
    ]);

    runtime._pushThread('hat', target);

    const source = runtime.compiler.getFinishedWork();

    t.match(source, /return function\* \(\)/, 'script body is a generator');
    t.match(source, /event_whenflagclicked|requestScriptGlowInFrame/, 'script emitted its hat');

    t.end();
});

test('compiled loops run their iterations in the frame', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'repeat'}),
        makeBlock('repeat', 'control_repeat', {
            parent: 'hat',
            inputs: {
                TIMES: {name: 'TIMES', block: 'times', shadow: 'times'},
                SUBSTACK: {name: 'SUBSTACK', block: 'change'}
            }
        }),
        number('times', 3, 'repeat'),
        makeBlock('change', 'data_changevariableby', {
            parent: 'repeat',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 3, 'every iteration ran');
    t.equal(runtime.threads.length, 0, 'loop finished');

    t.end();
});

test('compiled loops run once per frame when the loop redraws', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'repeat'}),
        makeBlock('repeat', 'control_repeat', {
            parent: 'hat',
            inputs: {
                TIMES: {name: 'TIMES', block: 'times', shadow: 'times'},
                SUBSTACK: {name: 'SUBSTACK', block: 'change'}
            }
        }),
        number('times', 3, 'repeat'),
        makeBlock('change', 'data_changevariableby', {
            parent: 'repeat',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change'),
        makeBlock('wait', 'control_wait', {
            parent: 'change',
            next: null,
            inputs: {DURATION: {name: 'DURATION', block: 'zero', shadow: 'zero'}}
        }),
        number('zero', 0, 'wait')
    ]);

    // The wait asks for a redraw, which ends the frame after one iteration.
    target.blocks.getBlock('change').next = 'wait';

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    for (let iteration = 1; iteration <= 3; iteration++) {
        runtime.redrawRequested = false;
        step(runtime);
        t.equal(target.lookupVariableById('variableId').value, iteration, `frame ${iteration} ran one iteration`);
    }

    runtime.redrawRequested = false;
    step(runtime);
    t.equal(runtime.threads.length, 0, 'loop finished');

    t.end();
});

test('compiled conditionals branch on reporter values', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'if'}),
        makeBlock('if', 'control_if', {
            parent: 'hat',
            inputs: {
                CONDITION: {name: 'CONDITION', block: 'gt', shadow: 'gt'},
                SUBSTACK: {name: 'SUBSTACK', block: 'set'}
            }
        }),
        makeBlock('gt', 'operator_gt', {
            parent: 'if',
            inputs: {
                OPERAND1: {name: 'OPERAND1', block: 'two', shadow: 'two'},
                OPERAND2: {name: 'OPERAND2', block: 'one', shadow: 'one'}
            }
        }),
        number('two', 2, 'gt'),
        number('one', 1, 'gt'),
        setVariableBlock('set', 'if', 'seven'),
        number('seven', 7, 'set')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, '7', 'the branch ran');
    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('compiled procedures take arguments and report values', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'call'),
        makeBlock('call', 'procedures_call', {
            parent: 'set',
            mutation: {proccode: 'double %s', argumentids: '["argumentId"]', warp: 'false'},
            inputs: {argumentId: {name: 'argumentId', block: 'five', shadow: 'five'}}
        }),
        number('five', 5, 'call'),
        makeBlock('definition', 'procedures_definition', {
            topLevel: true,
            next: 'return',
            inputs: {custom_block: {name: 'custom_block', block: 'prototype', shadow: 'prototype'}}
        }),
        makeBlock('prototype', 'procedures_prototype', {
            parent: 'definition',
            shadow: true,
            mutation: {
                proccode: 'double %s',
                argumentids: '["argumentId"]',
                argumentnames: '["n"]',
                argumentdefaults: '[""]',
                warp: 'false'
            }
        }),
        makeBlock('return', 'procedures_return', {
            parent: 'definition',
            inputs: {VALUE: {name: 'VALUE', block: 'multiply', shadow: 'multiply'}}
        }),
        makeBlock('multiply', 'operator_multiply', {
            parent: 'return',
            inputs: {
                NUM1: {name: 'NUM1', block: 'argument', shadow: 'argument'},
                NUM2: {name: 'NUM2', block: 'two', shadow: 'two'}
            }
        }),
        makeBlock('argument', 'argument_reporter_string_number', {
            parent: 'multiply',
            fields: {VALUE: {name: 'VALUE', value: 'n'}}
        }),
        number('two', 2, 'multiply')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');
    t.match(runtime.compiler.getFinishedWork(), /function\* __procedure/, 'the procedure was compiled');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 10, 'the procedure returned its value');
    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('compiled extension blocks run the branches they ask for', t => {
    const {runtime, target} = makeTarget();

    runtime._primitives.test_repeat = (args, util) => {
        util.stackFrame.index = (util.stackFrame.index || 0) + 1;

        if (util.stackFrame.index > Number(args.TIMES)) return;

        util.startBranch(1, true);
    };

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'loop'}),
        makeBlock('loop', 'test_repeat', {
            parent: 'hat',
            inputs: {
                TIMES: {name: 'TIMES', block: 'times', shadow: 'times'},
                SUBSTACK: {name: 'SUBSTACK', block: 'change'}
            }
        }),
        number('times', 3, 'loop'),
        makeBlock('change', 'data_changevariableby', {
            parent: 'loop',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime, 3);

    t.equal(target.lookupVariableById('variableId').value, 3, 'the loop branch ran three times');

    step(runtime);
    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('compiled loops in a warp procedure run without waiting for frames', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'call'}),
        makeBlock('call', 'procedures_call', {
            parent: 'hat',
            mutation: {proccode: 'spin', argumentids: '[]', warp: 'true'}
        }),
        makeBlock('definition', 'procedures_definition', {
            topLevel: true,
            next: 'repeat',
            inputs: {custom_block: {name: 'custom_block', block: 'prototype', shadow: 'prototype'}}
        }),
        makeBlock('prototype', 'procedures_prototype', {
            parent: 'definition',
            shadow: true,
            mutation: {
                proccode: 'spin',
                argumentids: '[]',
                argumentnames: '[]',
                argumentdefaults: '[]',
                warp: 'true'
            }
        }),
        makeBlock('repeat', 'control_repeat', {
            parent: 'definition',
            inputs: {
                TIMES: {name: 'TIMES', block: 'times', shadow: 'times'},
                SUBSTACK: {name: 'SUBSTACK', block: 'change'}
            }
        }),
        number('times', 5, 'repeat'),
        makeBlock('change', 'data_changevariableby', {
            parent: 'repeat',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 5, 'the warp loop ran to completion in one frame');
    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('compiled extension blocks run the blocks passed to them', t => {
    const {runtime, target} = makeTarget();

    runtime._primitives.test_run_block = (args, util) => {
        util.stackFrame.ran = (util.stackFrame.ran || 0) + 1;

        if (util.stackFrame.ran === 1) util.startBlockInput(args.BLOCK);
    };
    runtime._blockArguments.test_run_block = {BLOCK: {type: 'single_block'}};

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'run'}),
        makeBlock('run', 'test_run_block', {
            parent: 'hat',
            inputs: {BLOCK: {name: 'BLOCK', block: 'change'}}
        }),
        makeBlock('change', 'data_changevariableby', {
            parent: 'run',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 1, 'the block input ran once');
    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('compiled async reporters wait on their promise', t => {
    const {runtime, target} = makeTarget();

    runtime._primitives.test_async_reporter = () => new Promise(resolve => {
        setTimeout(() => resolve(42), 0);
    });

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'async'),
        makeBlock('async', 'test_async_reporter', {parent: 'set'})
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(thread.status, Thread.STATUS_PROMISE_WAIT, 'the thread waits on the promise');

    setTimeout(() => {
        step(runtime);

        t.equal(target.lookupVariableById('variableId').value, 42, 'the reported value was used');
        t.equal(runtime.threads.length, 0, 'the thread finished');

        t.end();
    }, 20);
});

test('scripts with unknown procedures keep running interpreted', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'call'}),
        makeBlock('call', 'procedures_call', {
            parent: 'hat',
            mutation: {proccode: 'do something', argumentids: '[]', warp: 'false'}
        })
    ]);

    const thread = runtime._pushThread('hat', target);

    t.notOk(thread.isCompiled, 'thread keeps running interpreted');
    t.ok(thread instanceof Thread, 'interpreted thread is a thread');

    step(runtime);

    t.equal(runtime.threads.length, 0, 'the interpreted script finished');

    t.end();
});

test('a script that cannot be compiled is not retried', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'call'}),
        makeBlock('call', 'procedures_call', {
            parent: 'hat',
            mutation: {proccode: 'do something', argumentids: '[]', warp: 'false'}
        })
    ]);

    runtime._pushThread('hat', target);
    const scripts = runtime.compiler.cache.get(target.blocks);

    t.ok(scripts.has('hat'), 'the failed compilation was cached');
    t.equal(scripts.get('hat'), null, 'nothing was compiled');

    t.end();
});

test('extensions can compile their own blocks', t => {
    const {runtime, target} = makeTarget();
    let calls = 0;

    runtime._registerExtensionPrimitives({
        id: 'compiled',
        name: 'Compiled',
        blocks: [{
            opcode: 'jump',
            blockType: 'command',
            text: 'jump [DISTANCE]',
            arguments: {DISTANCE: {type: 'number', defaultValue: 10}},
            func: () => {
                calls++;
            },
            compile: context =>
                `target.setXY(target.x + Cast.toNumber(${context.argument('DISTANCE')}), target.y);`
        }]
    });

    t.type(runtime.getCompileFunction('compiled_jump'), 'function', 'the compile function was registered');

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'jump'}),
        makeBlock('jump', 'compiled_jump', {
            parent: 'hat',
            inputs: {DISTANCE: {name: 'DISTANCE', block: 'ten', shadow: 'ten'}}
        }),
        number('ten', 10, 'jump')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(target.x, 10, 'the registered code ran');
    t.equal(calls, 0, 'the primitive did not run');
    t.match(
        runtime.compiler.getFinishedWork(),
        /target\.setXY\(target\.x \+ Cast\.toNumber\("10"\), target\.y\)/,
        'the code is in the script'
    );

    t.end();
});

test('extension reporters compile to expressions', t => {
    const {runtime, target} = makeTarget();
    let calls = 0;

    runtime._registerExtensionPrimitives({
        id: 'compiled',
        name: 'Compiled',
        blocks: [{
            opcode: 'double',
            blockType: 'reporter',
            text: 'double [VALUE]',
            arguments: {VALUE: {type: 'number', defaultValue: 1}},
            func: () => {
                calls++;

                return 0;
            },
            compile: context => `Cast.toNumber(${context.argument('VALUE')}) * 2`
        }]
    });

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'double'),
        makeBlock('double', 'compiled_double', {
            parent: 'set',
            inputs: {VALUE: {name: 'VALUE', block: 'four', shadow: 'four'}}
        }),
        number('four', 4, 'double')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 8, 'the reporter value was used');
    t.equal(calls, 0, 'the primitive did not run');

    t.end();
});

test('extension blocks compile their substacks and loops', t => {
    const {runtime, target} = makeTarget();

    runtime._registerExtensionPrimitives({
        id: 'compiled',
        name: 'Compiled',
        blocks: [{
            opcode: 'thrice',
            blockType: 'command',
            text: 'do this three times',
            arguments: {},
            func: () => {},
            compile: context => {
                const index = context.local('index');

                return {
                    lines: [
                        `for (let ${index} = 0; ${index} < 3; ${index}++) {`,
                        ...context.indent(context.substack(), 1),
                        ...context.indent(context.loopYield(), 1),
                        '}'
                    ]
                };
            }
        }]
    });

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'thrice'}),
        makeBlock('thrice', 'compiled_thrice', {
            parent: 'hat',
            inputs: {SUBSTACK: {name: 'SUBSTACK', block: 'change'}}
        }),
        makeBlock('change', 'data_changevariableby', {
            parent: 'thrice',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 3, 'the substack ran three times');
    t.equal(runtime.threads.length, 0, 'the loop finished');

    t.end();
});

test('a failing extension compilation keeps the script interpreted', t => {
    const {runtime, target} = makeTarget();
    let calls = 0;

    runtime._registerExtensionPrimitives({
        id: 'compiled',
        name: 'Compiled',
        blocks: [{
            opcode: 'broken',
            blockType: 'command',
            text: 'broken',
            arguments: {},
            func: () => {
                calls++;
            },
            compile: () => {
                throw new Error('no code for this block');
            }
        }]
    });

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'broken'}),
        makeBlock('broken', 'compiled_broken', {parent: 'hat'})
    ]);

    const thread = runtime._pushThread('hat', target);

    t.notOk(thread.isCompiled, 'thread keeps running interpreted');

    step(runtime);

    t.equal(calls, 1, 'the primitive ran instead');
    t.equal(runtime.threads.length, 0, 'the interpreted script finished');

    t.end();
});
