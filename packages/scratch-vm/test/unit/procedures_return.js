const test = require('tap').test;
const Sequencer = require('../../src/engine/sequencer');
const Runtime = require('../../src/engine/runtime');
const RenderedTarget = require('../../src/sprites/rendered-target');
const Sprite = require('../../src/sprites/sprite');

const makeRuntime = () => {
    const runtime = new Runtime();
    // Finish blocks in one step instead of yielding for screen refresh.
    runtime.currentStepTime = Infinity;
    return runtime;
};

/**
 * Add a block to a target, filling in the properties a block always has.
 * @param {Target} target Target to add the block to.
 * @param {object} data Block data.
 * @returns {object} The block that was added.
 */
const addBlock = (target, data) => target.blocks.createBlock(Object.assign({
    fields: {},
    inputs: {},
    next: null,
    parent: null,
    topLevel: false,
    shadow: false
}, data));

const makeTarget = runtime => {
    const target = new RenderedTarget(new Sprite(null, runtime), runtime);
    runtime.targets.push(target);
    return target;
};

/**
 * Add a "do %s" procedure definition to a target.
 * @param {Target} target Target to define the procedure on.
 * @param {?string} bodyFirst Id of the first block of the body, if any.
 * @returns {undefined}
 */
const addProcedureDefinition = (target, bodyFirst) => {
    addBlock(target, {
        id: 'definition',
        opcode: 'procedures_definition',
        topLevel: true,
        next: bodyFirst,
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
            proccode: 'do %s',
            argumentids: '["msgId"]',
            argumentnames: '["MSG"]',
            argumentdefaults: '[""]',
            warp: 'false'
        }
    });
};

/**
 * Add a procedures_return block reporting the given text.
 * @param {Target} target Target to add the block to.
 * @param {string} value Text the block returns.
 * @param {?string} next Id of the block following the return, if any.
 * @returns {undefined}
 */
const addReturn = (target, value, next = null) => {
    addBlock(target, {
        id: 'return',
        opcode: 'procedures_return',
        parent: 'definition',
        next,
        inputs: {
            VALUE: {
                name: 'VALUE',
                block: 'returnValue'
            }
        }
    });
    addBlock(target, {
        id: 'returnValue',
        opcode: 'text',
        parent: 'return',
        shadow: true,
        fields: {
            TEXT: {
                name: 'TEXT',
                value
            }
        }
    });
};

/**
 * Add a procedures_call block calling "do %s" with "hello".
 * @param {Target} target Target to add the block to.
 * @param {object} opts Options for the call.
 * @param {boolean} opts.returns Whether the call reports the value returned.
 * @param {?string} opts.parent Id of the block containing the call, if any.
 * @param {?string} opts.next Id of the block following the call, if any.
 * @returns {undefined}
 */
const addCall = (target, {returns, parent = null, next = null}) => {
    addBlock(target, {
        id: 'call',
        opcode: 'procedures_call',
        parent,
        next,
        topLevel: parent === null,
        inputs: {
            msgId: {
                name: 'msgId',
                block: 'argument'
            }
        },
        mutation: {
            tagName: 'mutation',
            children: [],
            proccode: 'do %s',
            argumentids: '["msgId"]',
            warp: 'false',
            returns: returns ? 'true' : 'false'
        }
    });
    addBlock(target, {
        id: 'argument',
        opcode: 'text',
        parent: 'call',
        shadow: true,
        fields: {
            TEXT: {
                name: 'TEXT',
                value: 'hello'
            }
        }
    });
};

/**
 * Add a block saying its input.
 * @param {Target} target Target to add the block to.
 * @param {string} inputId Id of the block reporting the message.
 * @returns {undefined}
 */
const addSay = (target, inputId) => {
    addBlock(target, {
        id: 'say',
        opcode: 'looks_say',
        topLevel: true,
        inputs: {
            MESSAGE: {
                name: 'MESSAGE',
                block: inputId
            }
        }
    });
};

/**
 * Step the sequencer until every thread has finished.
 * @param {Runtime} runtime Runtime to step.
 * @param {Sequencer} sequencer Sequencer stepping the runtime.
 * @param {number} maxSteps Maximum number of sequencer steps to run.
 * @returns {Promise<void>} Resolves when the runtime is idle or out of steps.
 */
const runToCompletion = async (runtime, sequencer, maxSteps = 50) => {
    for (let i = 0; i < maxSteps && runtime.threads.length > 0; i++) {
        sequencer.stepThreads();
        // Let the promise carrying a returned value settle.
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setImmediate(resolve));
    }
};

test('a returning call reports the value of the procedure', async t => {
    const r = makeRuntime();
    const s = new Sequencer(r);
    const target = makeTarget(r);

    const said = [];
    r._primitives.looks_say = args => said.push(args.MESSAGE);

    addSay(target, 'call');
    addCall(target, {returns: true, parent: 'say'});
    addProcedureDefinition(target, 'return');
    addReturn(target, 'returned', 'afterReturn');
    // A return block ends the procedure, so the block after it must not run.
    addBlock(target, {
        id: 'afterReturn',
        opcode: 'test_after_return',
        parent: 'return'
    });
    r._primitives.test_after_return = () => t.fail('a block after the return block ran');

    r._pushThread('say', target);

    await runToCompletion(r, s);

    t.same(said, ['returned'], 'the call block reported what the procedure returned');
    t.equal(r.threads.length, 0, 'no thread was left waiting for a value');
    t.end();
});

test('a returning call can call a procedure on a dependency', async t => {
    const r = makeRuntime();
    const s = new Sequencer(r);
    const caller = makeTarget(r);
    const callee = makeTarget(r);
    caller.addDependency(callee);

    const said = [];
    r._primitives.looks_say = args => said.push(args.MESSAGE);

    addSay(caller, 'call');
    addCall(caller, {returns: true, parent: 'say'});

    // The procedure returns the value of its argument.
    addProcedureDefinition(callee, 'return');
    addBlock(callee, {
        id: 'return',
        opcode: 'procedures_return',
        parent: 'definition',
        inputs: {
            VALUE: {
                name: 'VALUE',
                block: 'message'
            }
        }
    });
    addBlock(callee, {
        id: 'message',
        opcode: 'argument_reporter_string_number',
        parent: 'return',
        shadow: true,
        fields: {
            VALUE: {
                name: 'VALUE',
                value: 'MSG'
            }
        }
    });

    r._pushThread('say', caller);

    await runToCompletion(r, s);

    t.same(said, ['hello'], 'the call reported the value returned from the dependency');
    t.equal(r.threads.length, 0, 'no thread was left waiting for a value');
    t.end();
});

test('a procedure that ends without returning reports an empty value', async t => {
    const r = makeRuntime();
    const s = new Sequencer(r);
    const target = makeTarget(r);

    const said = [];
    r._primitives.looks_say = args => said.push(args.MESSAGE);

    addSay(target, 'call');
    addCall(target, {returns: true, parent: 'say'});
    addProcedureDefinition(target, null);

    r._pushThread('say', target);

    await runToCompletion(r, s);

    t.same(said, [''], 'the call reported an empty value instead of waiting forever');
    t.equal(r.threads.length, 0, 'no thread was left waiting for a value');
    t.end();
});

test('a return in a procedure called as a command resumes the caller after the call', async t => {
    const r = makeRuntime();
    const s = new Sequencer(r);
    const target = makeTarget(r);

    const ran = [];
    r._primitives.test_after_call = () => ran.push('afterCall');
    r._primitives.test_after_return = () => ran.push('afterReturn');

    addCall(target, {returns: false, next: 'afterCall'});
    addBlock(target, {
        id: 'afterCall',
        opcode: 'test_after_call',
        parent: 'call'
    });

    addProcedureDefinition(target, 'return');
    addReturn(target, 'returned', 'afterReturn');
    addBlock(target, {
        id: 'afterReturn',
        opcode: 'test_after_return',
        parent: 'return'
    });

    r._pushThread('call', target);

    await runToCompletion(r, s);

    t.same(ran, ['afterCall'], 'the caller continued after the call and the procedure stopped');
    t.equal(r.threads.length, 0, 'no thread was left running');
    t.end();
});

test('a procedure that returns without yielding resumes its caller in the same step', t => {
    const r = makeRuntime();
    const s = new Sequencer(r);
    const target = makeTarget(r);

    const said = [];
    r._primitives.looks_say = args => said.push(args.MESSAGE);

    addSay(target, 'call');
    addCall(target, {returns: true, parent: 'say'});
    addProcedureDefinition(target, 'return');
    addReturn(target, 'returned');

    r._pushThread('say', target);

    // A procedure that never waits must not cost its caller a frame.
    s.stepThreads();

    t.same(said, ['returned'], 'the caller got the value within the same sequencer step');
    t.equal(r.threads.length, 0, 'no thread was left running');
    t.end();
});

test('a returning procedure that waits still reports its value to the call', async t => {
    const r = makeRuntime();
    const s = new Sequencer(r);
    const target = makeTarget(r);

    const said = [];
    r._primitives.looks_say = args => said.push(args.MESSAGE);
    // The procedure waits for one tick before returning, so the value arrives
    // on a later step than the call.
    let waited = false;
    r._primitives.test_yield = (args, util) => {
        if (!waited) {
            waited = true;
            util.yieldTick();
        }
    };

    addSay(target, 'call');
    addCall(target, {returns: true, parent: 'say'});

    // The procedure yields once before returning.
    addBlock(target, {
        id: 'definition',
        opcode: 'procedures_definition',
        topLevel: true,
        next: 'wait',
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
            proccode: 'do %s',
            argumentids: '["msgId"]',
            argumentnames: '["MSG"]',
            argumentdefaults: '[""]',
            warp: 'false'
        }
    });
    addBlock(target, {id: 'wait', opcode: 'test_yield', parent: 'definition', next: 'return'});
    addBlock(target, {
        id: 'return',
        opcode: 'procedures_return',
        parent: 'wait',
        inputs: {
            VALUE: {
                name: 'VALUE',
                block: 'returnValue'
            }
        }
    });
    addBlock(target, {
        id: 'returnValue',
        opcode: 'text',
        parent: 'return',
        shadow: true,
        fields: {
            TEXT: {
                name: 'TEXT',
                value: 'returned'
            }
        }
    });

    r._pushThread('say', target);

    await runToCompletion(r, s);

    t.same(said, ['returned'], 'the call reported the value returned after the wait');
    t.equal(r.threads.length, 0, 'no thread was left waiting for a value');
    t.end();
});
