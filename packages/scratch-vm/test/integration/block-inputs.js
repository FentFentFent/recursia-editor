const test = require('tap').test;

const ArgumentType = require('../../src/extension-support/argument-type');
const BlockType = require('../../src/extension-support/block-type');
const VirtualMachine = require('../../src/index');

const Runtime = require('../../src/engine/runtime');
const Sprite = require('../../src/sprites/sprite');
const RenderedTarget = require('../../src/sprites/rendered-target');

// Recorded by the test extension as its blocks run, so each test can check
// which blocks ran and in what order.
let calls;
let capturedArgs;
let capturedSingleBlock;

class BlockInputTestExtension {
    getInfo () {
        return {
            id: 'blockInputTestExtension',
            name: 'Block Input Test Extension',
            blocks: [
                {
                    opcode: 'runInputs',
                    blockType: BlockType.COMMAND,
                    text: 'run inputs [INLINESTACK] [SINGLEBLOCK]',
                    arguments: {
                        INLINESTACK: {type: ArgumentType.INLINE_STACK},
                        SINGLEBLOCK: {type: ArgumentType.SINGLE_BLOCK}
                    }
                },
                {
                    opcode: 'recordInlineStackBlock',
                    blockType: BlockType.COMMAND,
                    text: 'record inline stack block'
                },
                {
                    opcode: 'recordSingleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'record single block'
                },
                {
                    opcode: 'recordAfter',
                    blockType: BlockType.COMMAND,
                    text: 'record after'
                }
            ]
        };
    }

    runInputs (args, util) {
        capturedArgs = {
            inlineStack: Object.assign({}, args.INLINESTACK),
            singleBlock: Object.assign({}, args.SINGLEBLOCK)
        };
        capturedSingleBlock = util.resolveBlockInputToBlock(args.SINGLEBLOCK);
        calls.push('runInputs');
        util.startBlockInput(args.INLINESTACK);
    }

    recordInlineStackBlock () {
        calls.push('inlineStack');
    }

    recordSingleBlock () {
        calls.push('singleBlock');
    }

    recordAfter () {
        calls.push('after');
    }
}

const makeBlock = (id, opcode, next, parent) => ({
    id,
    opcode,
    next: next || null,
    parent: parent || null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: !parent,
    x: 0,
    y: 0
});

const buildVm = () => {
    const vm = new VirtualMachine();
    vm.extensionManager._registerInternalExtension(new BlockInputTestExtension());

    const sprite = new Sprite(null, vm.runtime);
    const target = new RenderedTarget(sprite, vm.runtime);
    vm.runtime.targets = [target];

    return {vm, target};
};

const script = 'blockInputTestExtension_';

const createScript = (target, inputs) => {
    const provider = makeBlock('provider', `${script}runInputs`, 'after');
    provider.inputs = inputs;

    target.blocks.createBlock(provider);
    target.blocks.createBlock(makeBlock('inline1', `${script}recordInlineStackBlock`, 'inline2', 'provider'));
    target.blocks.createBlock(makeBlock('inline2', `${script}recordInlineStackBlock`, null, 'inline1'));
    target.blocks.createBlock(makeBlock('single', `${script}recordSingleBlock`, null, 'provider'));
    target.blocks.createBlock(makeBlock('after', `${script}recordAfter`, null, 'provider'));
};

const runToCompletion = (vm, target) => {
    // The sequencer needs a step time to know how long it may run for.
    vm.runtime.currentStepTime = Runtime.THREAD_STEP_INTERVAL;
    vm.runtime._pushThread('provider', target);
    for (let i = 0; i < 10 && vm.runtime.threads.length > 0; i++) {
        vm.runtime.sequencer.stepThreads();
    }
};

test('blocks connected to a stack input are passed to the implementation', t => {
    calls = [];
    const {vm, target} = buildVm();
    createScript(target, {
        INLINESTACK: {name: 'INLINESTACK', block: 'inline1', shadow: null},
        SINGLEBLOCK: {name: 'SINGLEBLOCK', block: 'single', shadow: null}
    });

    runToCompletion(vm, target);

    t.same(capturedArgs, {
        inlineStack: {blockId: 'inline1', type: 'InlineStack'},
        singleBlock: {blockId: 'single', type: 'SingleBlock'}
    }, 'the implementation receives the connected blocks');
    t.equal(capturedSingleBlock.opcode, `${script}recordSingleBlock`,
        'resolveBlockInputToBlock returns the connected block');
    t.same(calls, ['runInputs', 'inlineStack', 'inlineStack', 'after'],
        'startBlockInput runs the inline stack, then the script continues');

    t.end();
});

test('empty stack inputs report no block', t => {
    calls = [];
    const {vm, target} = buildVm();
    createScript(target, {
        SINGLEBLOCK: {name: 'SINGLEBLOCK', block: 'single', shadow: null}
    });

    runToCompletion(vm, target);

    t.same(capturedArgs, {
        inlineStack: {blockId: null, type: 'InlineStack'},
        singleBlock: {blockId: 'single', type: 'SingleBlock'}
    }, 'an empty input reports a null block id');
    t.same(calls, ['runInputs', 'after'],
        'the blocks connected to the other input do not run on their own');

    t.end();
});
