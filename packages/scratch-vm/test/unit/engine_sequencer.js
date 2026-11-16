const test = require('tap').test;
const Sequencer = require('../../src/engine/sequencer');
const Runtime = require('../../src/engine/runtime');
const Thread = require('../../src/engine/thread');
const RenderedTarget = require('../../src/sprites/rendered-target');
const Sprite = require('../../src/sprites/sprite');

test('spec', t => {
    t.type(Sequencer, 'function');

    const r = new Runtime();
    const s = new Sequencer(r);

    t.type(s, 'object');
    t.ok(s instanceof Sequencer);

    t.type(s.stepThreads, 'function');
    t.type(s.stepThread, 'function');
    t.type(s.stepToBranch, 'function');
    t.type(s.stepToProcedure, 'function');
    t.type(s.retireThread, 'function');

    t.end();
});

const randomString = function () {
    const top = Math.random().toString(36);
    return top.substring(7);
};

const generateBlock = function (id) {
    const block = {fields: Object,
        id: id,
        inputs: {},
        STEPS: Object,
        block: 'fakeBlock',
        name: 'fakeName',
        next: null,
        opcode: 'procedures_definition',
        mutation: {proccode: 'fakeCode'},
        parent: null,
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    };
    return block;
};

const generateBlockInput = function (id, next, inp) {
    const block = {fields: Object,
        id: id,
        inputs: {SUBSTACK: {block: inp, name: 'SUBSTACK'}},
        STEPS: Object,
        block: 'fakeBlock',
        name: 'fakeName',
        next: next,
        opcode: 'procedures_definition',
        mutation: {proccode: 'fakeCode'},
        parent: null,
        shadow: false,
        topLevel: true,
        x: 0,
        y: 0
    };
    return block;
};

const generateThread = function (runtime) {
    const s = new Sprite(null, runtime);
    const rt = new RenderedTarget(s, runtime);
    const th = new Thread(randomString());

    let next = randomString();
    let inp = randomString();
    let name = th.topBlock;

    rt.blocks.createBlock(generateBlockInput(name, next, inp));
    th.pushStack(name);
    rt.blocks.createBlock(generateBlock(inp));

    for (let i = 0; i < 10; i++) {
        name = next;
        next = randomString();
        inp = randomString();

        rt.blocks.createBlock(generateBlockInput(name, next, inp));
        th.pushStack(name);
        rt.blocks.createBlock(generateBlock(inp));
    }
    rt.blocks.createBlock(generateBlock(next));
    th.pushStack(next);
    th.target = rt;
    th.blockContainer = rt.blocks;

    runtime.threads.push(th);

    return th;
};

test('stepThread', t => {
    const r = new Runtime();
    const s = new Sequencer(r);
    let th = generateThread(r);
    t.not(th.status, Thread.STATUS_DONE);
    s.stepThread(th);
    t.equal(th.status, Thread.STATUS_DONE);
    th = generateThread(r);
    th.status = Thread.STATUS_YIELD;
    s.stepThread(th);
    t.not(th.status, Thread.STATUS_DONE);
    th.status = Thread.STATUS_PROMISE_WAIT;
    s.stepThread(th);
    t.not(th.status, Thread.STATUS_DONE);

    t.end();
});

test('stepToBranch', t => {
    const r = new Runtime();
    const s = new Sequencer(r);
    const th = generateThread(r);
    s.stepToBranch(th, 2, false);
    t.equal(th.peekStack(), null);
    th.popStack();
    s.stepToBranch(th, 1, false);
    t.equal(th.peekStack(), null);
    th.popStack();
    th.popStack();
    s.stepToBranch(th, 1, false);
    t.not(th.peekStack(), null);

    t.end();
});

test('retireThread', t => {
    const r = new Runtime();
    const s = new Sequencer(r);
    const th = generateThread(r);
    t.equal(th.stack.length, 12);
    s.retireThread(th);
    t.equal(th.stack.length, 0);
    t.equal(th.status, Thread.STATUS_DONE);

    t.end();
});

test('stepToProcedure', t => {
    const r = new Runtime();
    const s = new Sequencer(r);
    const th = generateThread(r);
    let expectedBlock = th.peekStack();
    s.stepToProcedure(th, '');
    t.equal(th.peekStack(), expectedBlock);
    s.stepToProcedure(th, 'faceCode');
    t.equal(th.peekStack(), expectedBlock);

    th.target.blocks.createBlock({
        id: 'internalId',
        opcode: 'procedures_prototype',
        mutation: {
            proccode: 'othercode'
        }
    });
    expectedBlock = th.stack[th.stack.length - 4];
    th.target.blocks.getBlock(expectedBlock).inputs.custom_block = {
        type: 'custom_block',
        block: 'internalId'
    };
    s.stepToProcedure(th, 'othercode');
    t.equal(th.peekStack(), expectedBlock);


    t.end();
});

test('stepThreads', t => {
    const r = new Runtime();
    r.currentStepTime = Infinity;
    const s = new Sequencer(r);
    t.equal(s.stepThreads().length, 0);
    generateThread(r);
    t.equal(r.threads.length, 1);
    // Threads should be marked DONE and removed in the same step they finish.
    t.equal(s.stepThreads().length, 1);

    t.end();
});

const makeCrossBoundaryTargets = runtime => {
    const calleeSprite = new Sprite(null, runtime);
    const callee = new RenderedTarget(calleeSprite, runtime);
    callee.blocks.createBlock({
        id: 'definition',
        opcode: 'procedures_definition',
        inputs: {custom_block: {name: 'custom_block', block: 'prototype', shadow: 'prototype'}},
        fields: {},
        next: 'say',
        topLevel: true,
        parent: null,
        shadow: false,
        x: 0,
        y: 0
    });
    callee.blocks.createBlock({
        id: 'prototype',
        opcode: 'procedures_prototype',
        inputs: {},
        fields: {},
        next: null,
        topLevel: false,
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
    callee.blocks.createBlock({
        id: 'say',
        opcode: 'looks_say',
        inputs: {MESSAGE: {name: 'MESSAGE', block: 'reporter', shadow: 'reporter'}},
        fields: {},
        next: null,
        topLevel: false,
        parent: 'definition',
        shadow: false
    });
    callee.blocks.createBlock({
        id: 'reporter',
        opcode: 'argument_reporter_string_number',
        inputs: {},
        fields: {VALUE: {name: 'VALUE', value: 'MSG'}},
        next: null,
        topLevel: false,
        parent: 'say',
        shadow: false
    });

    const callerSprite = new Sprite(null, runtime);
    const caller = new RenderedTarget(callerSprite, runtime);
    caller.addDependency(callee);

    runtime.targets.push(callee, caller);

    return {caller, callee};
};

test('stepToProcedureCrossBoundary moves the call params to the callee thread', t => {
    const r = new Runtime();
    const s = new Sequencer(r);
    const {caller, callee} = makeCrossBoundaryTargets(r);

    const callerThread = new Thread('call');
    callerThread.target = caller;
    callerThread.blockContainer = caller.blocks;
    callerThread.pushStack('call');
    callerThread.initParams();
    callerThread.pushParam('MSG', 'hello');
    r.threads.push(callerThread);

    t.ok(s.stepToProcedureCrossBoundary(callerThread, 'do %s'), 'the procedure was started');

    const calleeThread = r.threads.find(thread => thread !== callerThread);
    t.equal(calleeThread.target, callee, 'the procedure runs on the dependency target');
    t.equal(calleeThread.getParam('MSG'), 'hello', 'the callee sees the params of the call');
    t.equal(callerThread.peekStackFrame().params, null, 'the caller no longer holds the params');
    t.equal(callerThread.status, Thread.STATUS_PROMISE_WAIT, 'the caller waits for the callee');
    t.end();
});

test('stepToProcedureCrossBoundary passes the params into the running body', t => {
    const r = new Runtime();
    const s = new Sequencer(r);
    const said = [];
    r._primitives.looks_say = args => {
        said.push(args.MESSAGE);
    };
    const {caller} = makeCrossBoundaryTargets(r);

    const callerThread = new Thread('call');
    callerThread.target = caller;
    callerThread.blockContainer = caller.blocks;
    callerThread.pushStack('call');
    callerThread.initParams();
    callerThread.pushParam('MSG', 'hello');
    r.threads.push(callerThread);

    t.ok(s.stepToProcedureCrossBoundary(callerThread, 'do %s'), 'the procedure was started');

    const calleeThread = r.threads.find(thread => thread !== callerThread);
    s.stepThread(calleeThread);

    t.same(said, ['hello'], 'the procedure body receives the argument value');
    t.end();
});
