const test = require('tap').test;
const Blocks = require('../../src/engine/blocks');
const TargetPreprocesser = require('../../src/engine/target-preprocessor');

const makeBlock = (id, opcode, overrides) => Object.assign({
    id,
    opcode,
    inputs: {},
    fields: {},
    next: null,
    topLevel: false,
    parent: null,
    shadow: false
}, overrides);

const makeRuntime = () => ({targets: [], emitProjectChanged: () => {}});

const makeTarget = blockList => {
    const blocks = new Blocks(makeRuntime());
    for (const block of blockList) {
        blocks.createBlock(block);
    }
    return {id: 'sprite1', blocks};
};

const makePreprocessor = () => new TargetPreprocesser(makeRuntime());

test('getExports returns null when a target exports nothing', t => {
    const target = makeTarget([
        makeBlock('move', 'motion_movesteps', {topLevel: true})
    ]);

    t.equal(makePreprocessor().getExports(target), null);
    t.end();
});

test('getExports returns null when a module block exports an empty stack', t => {
    const target = makeTarget([
        makeBlock('hat', 'modules_export', {topLevel: true})
    ]);

    t.equal(makePreprocessor().getExports(target), null);
    t.end();
});

test('getExports separates the exported stack by next connections', t => {
    const target = makeTarget([
        makeBlock('hat', 'modules_export', {
            topLevel: true,
            inputs: {
                EXPORT: {name: 'EXPORT', block: 'move', shadow: null}
            }
        }),
        makeBlock('move', 'motion_movesteps', {
            parent: 'hat',
            next: 'say',
            inputs: {
                STEPS: {name: 'STEPS', block: 'steps', shadow: 'steps'}
            }
        }),
        makeBlock('steps', 'math_number', {
            parent: 'move',
            shadow: true,
            fields: {NUM: {name: 'NUM', value: '10'}}
        }),
        makeBlock('say', 'looks_say', {
            parent: 'move',
            inputs: {
                MESSAGE: {name: 'MESSAGE', block: 'hello', shadow: 'hello'}
            }
        }),
        makeBlock('hello', 'text', {
            parent: 'say',
            shadow: true,
            fields: {TEXT: {name: 'TEXT', value: 'hi'}}
        })
    ]);

    const exports = makePreprocessor().getExports(target);
    t.ok(exports, 'exports were collected');
    t.same(exports.getScripts(), ['move', 'say'], 'each block in the exported stack is its own export');

    const firstExport = exports.blockToXML('move');
    t.match(firstExport, /<shadow[\s\S]*?type="math_number"/, 'inputs and shadows stay with the exported block');
    t.notMatch(firstExport, /<next>/, 'the next block is not part of the exported block');

    const secondExport = exports.blockToXML('say');
    t.match(secondExport, /<shadow[\s\S]*?type="text"/, 'later exports keep their own inputs');
    t.notMatch(exports.toXML(), /undefined/, 'no missing blocks are serialized');
    t.end();
});

test('getExports keeps blocks nested inside an exported block attached to it', t => {
    const target = makeTarget([
        makeBlock('hat', 'modules_single_export', {
            topLevel: true,
            inputs: {
                EXPORT: {name: 'EXPORT', block: 'if', shadow: null}
            }
        }),
        makeBlock('if', 'control_if', {
            parent: 'hat',
            inputs: {
                CONDITION: {name: 'CONDITION', block: 'equals', shadow: null},
                SUBSTACK: {name: 'SUBSTACK', block: 'say', shadow: null}
            }
        }),
        makeBlock('equals', 'operator_equals', {parent: 'if'}),
        makeBlock('say', 'looks_say', {
            parent: 'if',
            next: 'move',
            inputs: {
                MESSAGE: {name: 'MESSAGE', block: 'hello', shadow: 'hello'}
            }
        }),
        makeBlock('hello', 'text', {
            parent: 'say',
            shadow: true,
            fields: {TEXT: {name: 'TEXT', value: 'hi'}}
        }),
        makeBlock('move', 'motion_movesteps', {parent: 'say'})
    ]);

    const exports = makePreprocessor().getExports(target);
    t.ok(exports, 'exports were collected');
    t.same(exports.getScripts(), ['if'], 'a single exported block is one export');

    const xml = exports.toXML();
    t.match(xml, /type="operator_equals"/, 'value input blocks are serialized');
    t.match(xml, /type="text"/, 'shadows in nested inputs are serialized');
    t.match(xml, /<next>[\s\S]*?type="motion_movesteps"/, 'stacks nested inside the export are not split');
    t.notMatch(xml, /undefined/, 'no missing blocks are serialized');
    t.end();
});

test('getExports collects exports from every module block in a target', t => {
    const target = makeTarget([
        makeBlock('hat', 'modules_single_export', {
            topLevel: true,
            inputs: {
                EXPORT: {name: 'EXPORT', block: 'move', shadow: null}
            }
        }),
        makeBlock('move', 'motion_movesteps', {parent: 'hat'}),
        makeBlock('otherHat', 'modules_export', {
            topLevel: true,
            inputs: {
                EXPORT: {name: 'EXPORT', block: 'say', shadow: null}
            }
        }),
        makeBlock('say', 'looks_say', {
            parent: 'otherHat',
            next: 'think'
        }),
        makeBlock('think', 'looks_think', {parent: 'say'})
    ]);

    t.same(makePreprocessor().getExports(target).getScripts(), ['move', 'say', 'think']);
    t.end();
});
