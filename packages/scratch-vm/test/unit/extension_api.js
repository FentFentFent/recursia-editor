const test = require('tap').test;

const ExtensionManager = require('../../src/extension-support/extension-manager');
const {newApi} = require('../../src/extension-support/extension-api/api.js');

const makeManager = () => new ExtensionManager({runtime: {}});

test('getScratchBlocks resolves pending waiters when ScratchBlocks is provided', t => {
    const manager = makeManager();
    const ScratchBlocks = {Blocks: {}};

    const pending = manager.getScratchBlocks();
    manager.setScratchBlocks(ScratchBlocks);

    return pending.then(blocks => {
        t.equal(blocks, ScratchBlocks, 'pending promise resolves with ScratchBlocks');
        return manager.getScratchBlocks();
    }).then(blocks => {
        t.equal(blocks, ScratchBlocks, 'later calls resolve immediately');
    });
});

test('Scratch.getBlockly resolves to ScratchBlocks once the host provides it', t => {
    const manager = makeManager();
    const vm = {runtime: {}, extensionManager: manager};
    const api = newApi(vm, () => manager.getScratchBlocks());
    const ScratchBlocks = {Blocks: {}};

    const pending = api.getBlockly();
    t.ok(pending instanceof Promise, 'getBlockly returns a promise');
    manager.setScratchBlocks(ScratchBlocks);

    return pending.then(blocks => {
        t.equal(blocks, ScratchBlocks, 'promise resolves with ScratchBlocks');
        return api.getBlockly();
    }).then(blocks => {
        t.equal(blocks, ScratchBlocks, 'subsequent calls resolve immediately');
    });
});
