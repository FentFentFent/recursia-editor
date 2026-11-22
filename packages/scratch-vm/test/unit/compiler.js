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

test('a compiled extension block reports the value a procedure it starts returns', t => {
    const {runtime, target} = makeTarget();

    runtime._primitives.test_startingValue = (args, util) => util.startProcedureReturning('computeValue');

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'value'),
        makeBlock('value', 'test_startingValue', {parent: 'set'}),
        makeBlock('definition', 'procedures_definition', {
            topLevel: true,
            next: 'return',
            inputs: {custom_block: {name: 'custom_block', block: 'prototype'}}
        }),
        makeBlock('prototype', 'procedures_prototype', {
            parent: 'definition',
            shadow: true,
            mutation: {
                tagName: 'mutation',
                children: [],
                proccode: 'computeValue',
                argumentids: '[]',
                argumentnames: '[]',
                argumentdefaults: '[]',
                warp: 'false'
            }
        }),
        makeBlock('return', 'procedures_return', {
            parent: 'definition',
            inputs: {VALUE: {name: 'VALUE', block: 'seven', shadow: 'seven'}}
        }),
        number('seven', 7, 'return')
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');
    t.match(
        runtime.compiler.getFinishedWork(),
        /__startedReturningProcedure/,
        'the compiled script can run the procedure the block needs the value of'
    );

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, '7', 'the block reported the value of the procedure');
    t.equal(runtime.threads.length, 0, 'the thread finished');

    t.end();
});

test('compiled extension blocks get the mutation the interpreter gives them', t => {
    const {runtime, target} = makeTarget();
    let received = null;

    runtime._primitives.test_mutation = args => {
        received = args.mutation;
    };

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'mutation'}),
        makeBlock('mutation', 'test_mutation', {
            parent: 'hat',
            mutation: {
                tagName: 'mutation',
                children: [],
                blockInfo: {text: 'test [A]', arguments: {A: {type: 'string'}}}
            }
        })
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.ok(received, 'the primitive ran');
    t.equal(received.blockInfo.text, 'test [A]', 'the block mutation reached the primitive');

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

test('a running compiled script is recompiled when its blocks change', t => {
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
        number('times', 2, 'repeat'),
        makeBlock('change', 'data_changevariableby', {
            parent: 'repeat',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'ten', shadow: 'ten'}}
        }),
        number('ten', 10, 'change'),
        makeBlock('wait', 'control_wait', {
            parent: 'change',
            inputs: {DURATION: {name: 'DURATION', block: 'zero', shadow: 'zero'}}
        }),
        number('zero', 0, 'wait')
    ]);

    // The wait asks for a redraw, which ends the frame after one iteration.
    target.blocks.getBlock('change').next = 'wait';

    const thread = runtime._pushThread('hat', target);
    const firstScript = thread.script;

    t.ok(thread.isCompiled, 'thread runs compiled');

    runtime.redrawRequested = false;
    step(runtime);
    t.equal(target.lookupVariableById('variableId').value, 10, 'the script ran one iteration');

    target.blocks.blocklyListen({
        type: 'change',
        blockId: 'ten',
        element: 'field',
        name: 'NUM',
        newValue: '20'
    });

    t.not(thread.script, firstScript, 'the thread was given a new script');
    t.match(runtime.compiler.getFinishedWork(), /20/, 'the compiled source reflects the edit');

    // The replacement script starts the loop again with the edited number.
    runtime.redrawRequested = false;
    step(runtime);
    t.equal(target.lookupVariableById('variableId').value, 30, 'the edited block ran');

    runtime.redrawRequested = false;
    step(runtime);
    t.equal(target.lookupVariableById('variableId').value, 50, 'the replacement finished its loop');

    runtime.redrawRequested = false;
    step(runtime);
    t.equal(runtime.threads.length, 0, 'the replacement thread finished');

    t.end();
});

test('compiled scripts inline variables that no block writes', t => {
    const {runtime, target} = makeTarget();

    target.createVariable('constantId', 'y', '');
    target.variables.constantId.value = 42;

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'read'),
        makeBlock('read', 'data_variable', {
            parent: 'set',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'constantId', value: 'y'}}
        })
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');
    t.notMatch(runtime.compiler.getFinishedWork(), /constantId/, 'the variable is not looked up');
    t.match(runtime.compiler.getFinishedWork(), /42/, 'the value is inlined');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 42, 'the inlined value was used');

    t.end();
});

test('compiled scripts read variables that a block writes', t => {
    const {runtime, target} = makeTarget();

    target.createVariable('writtenId', 'y', '');
    target.variables.writtenId.value = 42;

    addBlocks(target, [
        makeBlock('writer', 'data_setvariableto', {
            topLevel: true,
            fields: {VARIABLE: {name: 'VARIABLE', id: 'writtenId', value: 'y'}},
            inputs: {VALUE: {name: 'VALUE', block: 'five', shadow: 'five'}}
        }),
        number('five', 5, 'writer'),
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'read'),
        makeBlock('read', 'data_variable', {
            parent: 'set',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'writtenId', value: 'y'}}
        })
    ]);

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');
    t.match(runtime.compiler.getFinishedWork(), /writtenId/, 'the variable is still looked up');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 42, 'the variable value was read');

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

test('a warp loop ends its turn within a few iterations of the warp time', t => {
    const Timer = require('../../src/util/timer');
    const realTimeElapsed = Timer.prototype.timeElapsed;

    // Report the warp budget as used up so the loop yields at its next check.
    Timer.prototype.timeElapsed = () => 1000;

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
                TIMES: {name: 'TIMES', block: 'many', shadow: 'many'},
                SUBSTACK: {name: 'SUBSTACK', block: 'change'}
            }
        }),
        number('many', 100000, 'repeat'),
        makeBlock('change', 'data_changevariableby', {
            parent: 'repeat',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change')
    ]);

    const thread = runtime._pushThread('hat', target);

    step(runtime);

    const iterations = target.lookupVariableById('variableId').value;
    t.ok(iterations > 0, 'the loop made progress');
    t.ok(iterations <= 16, `the loop yielded within a few iterations, not ${iterations}`);
    t.not(thread.status, Thread.STATUS_DONE, 'the thread is still running');

    Timer.prototype.timeElapsed = realTimeElapsed;

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

test('math operators compile to one Math call, folded when the input is constant', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'sin'),
        makeBlock('sin', 'operator_mathop', {
            parent: 'set',
            fields: {OPERATOR: {name: 'OPERATOR', value: 'sin'}},
            inputs: {NUM: {name: 'NUM', block: 'read', shadow: 'read'}}
        }),
        makeBlock('read', 'data_variable', {
            parent: 'sin',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}}
        })
    ]);
    target.lookupVariableById('variableId').value = 30;

    runtime._pushThread('hat', target);

    const source = runtime.compiler.getFinishedWork();

    t.match(source, /Math\.sin\(/, 'the operator compiles to its Math call');
    t.notMatch(source, /__mathop/, 'the operator does not go through a runtime switch');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 0.5, 'sin of 30 is 0.5');

    t.end();
});

test('arithmetic on literals is computed at compile time', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'product'),
        makeBlock('product', 'operator_multiply', {
            parent: 'set',
            inputs: {
                NUM1: {name: 'NUM1', block: 'sum', shadow: 'sum'},
                NUM2: {name: 'NUM2', block: 'four', shadow: 'four'}
            }
        }),
        makeBlock('sum', 'operator_add', {
            parent: 'product',
            inputs: {
                NUM1: {name: 'NUM1', block: 'two', shadow: 'two'},
                NUM2: {name: 'NUM2', block: 'three', shadow: 'three'}
            }
        }),
        number('two', 2, 'sum'),
        number('three', 3, 'sum'),
        number('four', 4, 'product')
    ]);

    runtime._pushThread('hat', target);

    t.match(runtime.compiler.getFinishedWork(), /__variable\d+\.value = 20;/, 'the whole expression is one number');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 20, '(2 + 3) * 4 is 20');

    t.end();
});

test('a variable is looked up once per script', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'set'}),
        setVariableBlock('set', 'hat', 'sum'),
        makeBlock('sum', 'operator_add', {
            parent: 'set',
            inputs: {
                NUM1: {name: 'NUM1', block: 'read1', shadow: 'read1'},
                NUM2: {name: 'NUM2', block: 'read2', shadow: 'read2'}
            }
        }),
        makeBlock('read1', 'data_variable', {
            parent: 'sum',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}}
        }),
        makeBlock('read2', 'data_variable', {
            parent: 'sum',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}}
        })
    ]);

    runtime._pushThread('hat', target);

    const lookups = runtime.compiler.getFinishedWork().match(/lookupOrCreateVariable/g) || [];

    t.equal(lookups.length, 1, 'the variable is resolved once, not once per block');

    t.end();
});

test('type analysis replaces a constant variable read and removes its cast', t => {
    const {runtime, target} = makeTarget();
    target.createVariable('yId', 'y', '');

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'setx'}),
        setVariableBlock('setx', 'hat', 'five'),
        number('five', 5, 'setx'),
        makeBlock('sety', 'data_setvariableto', {
            parent: 'setx',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'yId', value: 'y'}},
            inputs: {VALUE: {name: 'VALUE', block: 'double', shadow: 'double'}}
        }),
        makeBlock('double', 'operator_multiply', {
            parent: 'sety',
            inputs: {
                NUM1: {name: 'NUM1', block: 'read', shadow: 'read'},
                NUM2: {name: 'NUM2', block: 'two', shadow: 'two'}
            }
        }),
        makeBlock('read', 'data_variable', {
            parent: 'double',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}}
        }),
        number('two', 2, 'double')
    ]);
    target.blocks.getBlock('setx').next = 'sety';

    runtime._pushThread('hat', target);

    const source = runtime.compiler.getFinishedWork();

    t.match(source, /__variable\d+\.value = 10;/, 'the read was replaced and the arithmetic folded');
    t.notMatch(source, /Cast\.toNumber\(__variable/, 'the value needed no number conversion');

    step(runtime);

    t.equal(target.lookupVariableById('yId').value, 10, 'y is 5 * 2');

    t.end();
});

test('equality with a non-numeric literal compares strings without parsing numbers', t => {
    const {runtime, target} = makeTarget();
    target.createVariable('zId', 'z', '');
    target.lookupVariableById('zId').value = 'hello';

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'setx'}),
        setVariableBlock('setx', 'hat', 'hello'),
        makeBlock('hello', 'text', {
            parent: 'setx',
            shadow: true,
            fields: {TEXT: {name: 'TEXT', value: 'Hello'}}
        }),
        makeBlock('if', 'control_if', {
            parent: 'setx',
            inputs: {
                CONDITION: {name: 'CONDITION', block: 'equals', shadow: 'equals'},
                SUBSTACK: {name: 'SUBSTACK', block: 'matched'}
            }
        }),
        makeBlock('equals', 'operator_equals', {
            parent: 'if',
            inputs: {
                OPERAND1: {name: 'OPERAND1', block: 'hello', shadow: 'hello'},
                OPERAND2: {name: 'OPERAND2', block: 'read', shadow: 'read'}
            }
        }),
        		makeBlock('read', 'data_variable', {
            parent: 'equals',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'zId', value: 'z'}}
        }),
        makeBlock('matched', 'data_setvariableto', {
            parent: 'if',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'same', shadow: 'same'}}
        }),
        makeBlock('same', 'text', {
            parent: 'matched',
            shadow: true,
            fields: {TEXT: {name: 'TEXT', value: 'matched'}}
        })
    ]);
    target.blocks.getBlock('setx').next = 'if';

    runtime._pushThread('hat', target);

    const source = runtime.compiler.getFinishedWork();

    	t.match(source, /toLowerCase\(\)/, 'the comparison is done on lower-case strings');
    t.notMatch(source, /Cast\.compare/, 'the comparison does not parse the strings as numbers');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, 'matched', 'the strings are equal case-insensitively');

    t.end();
});

test('compiled comparisons agree with Cast.compare on edge values', t => {
    const Cast = require('../../src/util/cast');
    const {runtime, target} = makeTarget();
    target.createVariable('leftId', 'left', '');
    target.createVariable('rightId', 'right', '');
    target.createVariable('eqId', 'eq', '');
    target.createVariable('gtId', 'gt', '');
    target.createVariable('ltId', 'lt', '');

    const reader = (id, variable, parent) => makeBlock(id, 'data_variable', {
        parent,
        fields: {VARIABLE: {name: 'VARIABLE', id: variable, value: variable}}
    });
    const comparison = (id, opcode, parent) => makeBlock(id, opcode, {
        parent,
        inputs: {
            OPERAND1: {name: 'OPERAND1', block: `${id}Left`, shadow: `${id}Left`},
            OPERAND2: {name: 'OPERAND2', block: `${id}Right`, shadow: `${id}Right`}
        }
    });
    const result = (id, variable, parent, value, next) => makeBlock(id, 'data_setvariableto', {
        parent,
        next,
        fields: {VARIABLE: {name: 'VARIABLE', id: variable, value: variable}},
        inputs: {VALUE: {name: 'VALUE', block: value, shadow: value}}
    });

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'setEq'}),
        result('setEq', 'eqId', 'hat', 'equals', 'setGt'),
        comparison('equals', 'operator_equals', 'setEq'),
        reader('equalsLeft', 'leftId', 'equals'),
        reader('equalsRight', 'rightId', 'equals'),
        result('setGt', 'gtId', 'setEq', 'greater', 'setLt'),
        comparison('greater', 'operator_gt', 'setGt'),
        reader('greaterLeft', 'leftId', 'greater'),
        reader('greaterRight', 'rightId', 'greater'),
        result('setLt', 'ltId', 'setGt', 'less'),
        comparison('less', 'operator_lt', 'setLt'),
        reader('lessLeft', 'leftId', 'less'),
        reader('lessRight', 'rightId', 'less'),
        // A block that writes each compared variable keeps the compiler from treating them as constants.
        makeBlock('writeHat', 'event_whenkeypressed', {
            topLevel: true,
            next: 'writeLeft',
            fields: {KEY_OPTION: {name: 'KEY_OPTION', value: 'a'}}
        }),
        result('writeLeft', 'leftId', 'writeHat', 'zero', 'writeRight'),
        number('zero', 0, 'writeLeft'),
        result('writeRight', 'rightId', 'writeLeft', 'zeroToo'),
        number('zeroToo', 0, 'writeRight')
    ]);

    const values = [NaN, Infinity, -Infinity, 0, -0, 1, 2.5, '5', ' 5 ', ' ', '', 'abc', 'ABC', true];
    const left = target.lookupVariableById('leftId');
    const right = target.lookupVariableById('rightId');

    runtime._pushThread('hat', target);
    step(runtime);

    for (const a of values) {
        for (const b of values) {
            left.value = a;
            right.value = b;
            runtime._pushThread('hat', target);
            step(runtime);

            t.equal(target.lookupVariableById('eqId').value, Cast.compare(a, b) === 0,
                `(${String(a)} = ${String(b)})`);
            t.equal(target.lookupVariableById('gtId').value, Cast.compare(a, b) > 0,
                `(${String(a)} > ${String(b)})`);
            t.equal(target.lookupVariableById('ltId').value, Cast.compare(a, b) < 0,
                `(${String(a)} < ${String(b)})`);
        }
    }

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

test('a value set in one branch is not assumed after the branch', t => {
    const {runtime, target} = makeTarget();

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'setx'}),
        setVariableBlock('setx', 'hat', 'five'),
        number('five', 5, 'setx'),
        makeBlock('call', 'procedures_call', {
            parent: 'setx',
            mutation: {proccode: 'noop', argumentids: '[]', warp: 'false'}
        }),
        makeBlock('definition', 'procedures_definition', {
            topLevel: true,
            inputs: {custom_block: {name: 'custom_block', block: 'prototype', shadow: 'prototype'}}
        }),
        makeBlock('prototype', 'procedures_prototype', {
            parent: 'definition',
            shadow: true,
            mutation: {
                proccode: 'noop',
                argumentids: '[]',
                argumentnames: '[]',
                argumentdefaults: '[]',
                warp: 'false'
            }
        }),
        makeBlock('if', 'control_if', {
            parent: 'call',
            inputs: {
                CONDITION: {name: 'CONDITION', block: 'test', shadow: 'test'},
                SUBSTACK: {name: 'SUBSTACK', block: 'settwo'}
            }
        }),
        makeBlock('test', 'operator_gt', {
            parent: 'if',
            inputs: {
                OPERAND1: {name: 'OPERAND1', block: 'timer', shadow: 'timer'},
                OPERAND2: {name: 'OPERAND2', block: 'hundred', shadow: 'hundred'}
            }
        }),
        makeBlock('timer', 'sensing_timer', {parent: 'test'}),
        number('hundred', 100, 'test'),
        setVariableBlock('settwo', 'if', 'two'),
        number('two', 2, 'settwo'),
        makeBlock('change', 'data_changevariableby', {
            parent: 'if',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change')
    ]);
    target.blocks.getBlock('setx').next = 'call';
    target.blocks.getBlock('call').next = 'if';
    target.blocks.getBlock('if').next = 'change';

    runtime._pushThread('hat', target);

    t.notMatch(runtime.compiler.getFinishedWork(), /__variable\d+\.value = 3;/, 'the read is not folded to the branch');

    step(runtime, 5);

    t.equal(target.lookupVariableById('variableId').value, 6, 'the branch did not run, so x is 5 + 1');

    t.end();
});

test('a value set in a loop body is not assumed after the loop', t => {
    const {runtime, target} = makeTarget();
    target.createVariable('countId', 'count', '');
    target.lookupVariableById('countId').value = 0;

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'setx'}),
        setVariableBlock('setx', 'hat', 'five'),
        number('five', 5, 'setx'),
        makeBlock('call', 'procedures_call', {
            parent: 'setx',
            mutation: {proccode: 'noop', argumentids: '[]', warp: 'false'}
        }),
        makeBlock('definition', 'procedures_definition', {
            topLevel: true,
            inputs: {custom_block: {name: 'custom_block', block: 'prototype', shadow: 'prototype'}}
        }),
        makeBlock('prototype', 'procedures_prototype', {
            parent: 'definition',
            shadow: true,
            mutation: {
                proccode: 'noop',
                argumentids: '[]',
                argumentnames: '[]',
                argumentdefaults: '[]',
                warp: 'false'
            }
        }),
        makeBlock('loop', 'control_repeat', {
            parent: 'call',
            inputs: {
                TIMES: {name: 'TIMES', block: 'count', shadow: 'count'},
                SUBSTACK: {name: 'SUBSTACK', block: 'settwo'}
            }
        }),
        makeBlock('count', 'data_variable', {
            parent: 'loop',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'countId', value: 'count'}}
        }),
        setVariableBlock('settwo', 'loop', 'two'),
        number('two', 2, 'settwo'),
        makeBlock('change', 'data_changevariableby', {
            parent: 'loop',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'variableId', value: 'x'}},
            inputs: {VALUE: {name: 'VALUE', block: 'one', shadow: 'one'}}
        }),
        number('one', 1, 'change')
    ]);
    target.blocks.getBlock('setx').next = 'call';
    target.blocks.getBlock('call').next = 'loop';
    target.blocks.getBlock('loop').next = 'change';

    runtime._pushThread('hat', target);

    t.notMatch(runtime.compiler.getFinishedWork(), /__variable\d+\.value = 3;/, 'the read is not folded to the loop body');

    step(runtime, 5);

    t.equal(target.lookupVariableById('variableId').value, 6, 'the loop ran no times, so x is 5 + 1');

    t.end();
});

test('not compiles to a negation of its input', t => {
    const {runtime, target} = makeTarget();
    target.createVariable('textId', 'text', '');
    target.lookupOrCreateList('listId', 'items');

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'settext'}),
        makeBlock('settext', 'data_setvariableto', {
            parent: 'hat',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'textId', value: 'text'}},
            inputs: {VALUE: {name: 'VALUE', block: 'length', shadow: 'length'}}
        }),
        makeBlock('length', 'data_lengthoflist', {
            parent: 'settext',
            fields: {LIST: {name: 'LIST', id: 'listId', value: 'items'}}
        }),
        setVariableBlock('set', 'settext', 'not'),
        makeBlock('not', 'operator_not', {
            parent: 'set',
            inputs: {OPERAND: {name: 'OPERAND', block: 'read', shadow: 'read'}}
        }),
        makeBlock('read', 'data_variable', {
            parent: 'not',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'textId', value: 'text'}}
        })
    ]);
    target.blocks.getBlock('settext').next = 'set';

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, true, 'an empty list is zero, so not is true');

    t.end();
});

test('contains compiles to a lower-case substring test', t => {
    const {runtime, target} = makeTarget();
    target.createVariable('textId', 'text', '');

    addBlocks(target, [
        makeBlock('hat', 'event_whenflagclicked', {topLevel: true, next: 'settext'}),
        makeBlock('settext', 'data_setvariableto', {
            parent: 'hat',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'textId', value: 'text'}},
            inputs: {VALUE: {name: 'VALUE', block: 'timer', shadow: 'timer'}}
        }),
        makeBlock('timer', 'sensing_timer', {parent: 'settext'}),
        setVariableBlock('set', 'settext', 'contains'),
        makeBlock('contains', 'operator_contains', {
            parent: 'set',
            inputs: {
                STRING1: {name: 'STRING1', block: 'join', shadow: 'join'},
                STRING2: {name: 'STRING2', block: 'needle', shadow: 'needle'}
            }
        }),
        makeBlock('join', 'operator_join', {
            parent: 'contains',
            inputs: {
                STRING1: {name: 'STRING1', block: 'hello', shadow: 'hello'},
                STRING2: {name: 'STRING2', block: 'read', shadow: 'read'}
            }
        }),
        makeBlock('hello', 'text', {
            parent: 'join',
            shadow: true,
            fields: {TEXT: {name: 'TEXT', value: 'Hello '}}
        }),
        makeBlock('read', 'data_variable', {
            parent: 'join',
            fields: {VARIABLE: {name: 'VARIABLE', id: 'textId', value: 'text'}}
        }),
        makeBlock('needle', 'text', {
            parent: 'contains',
            shadow: true,
            fields: {TEXT: {name: 'TEXT', value: 'HELLO'}}
        })
    ]);
    target.blocks.getBlock('settext').next = 'set';

    const thread = runtime._pushThread('hat', target);

    t.ok(thread.isCompiled, 'thread runs compiled');
    t.match(runtime.compiler.getFinishedWork(), /toLowerCase\(\)\.includes/, 'both strings are lower-cased');

    step(runtime);

    t.equal(target.lookupVariableById('variableId').value, true, 'the text contains the word regardless of case');

    t.end();
});
