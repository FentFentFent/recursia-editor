const test = require('tap').test;
const Blocks = require('../../src/engine/blocks');
const Collections = require('../../src/extensions/scratch3_collections');
const {ColorStyles} = require('../../src/extension-support/color_styles');

/**
 * Build a collections extension listening to a fake runtime.
 * @returns {object} the extension and the listeners it registered, by event name.
 */
const makeExtension = () => {
    const listeners = {};
    const runtime = {
        on: (event, listener) => {
            listeners[event] = listener;
        }
    };
    return {collections: new Collections(runtime), listeners};
};

/**
 * @returns {Blocks} a block container which does not report project changes.
 */
const makeBlocks = () => new Blocks({emitProjectChanged: () => {}});

/**
 * Add a block, filling in the properties every block has.
 * @param {Blocks} blocks - the container.
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
 * @param {string} value - the text.
 */
const addText = (blocks, id, parentId, value) => {
    add(blocks, {
        id: id,
        opcode: 'text',
        parent: parentId,
        shadow: true,
        fields: {TEXT: {name: 'TEXT', value: value}}
    });
};

/**
 * Add a procedure definition, so its parameters can be looked up.
 * @param {Blocks} blocks - the container.
 * @param {string} id - the id prefix of the blocks to add.
 * @param {string} procedureCode - the procedure's code.
 * @param {Array.<string>} argumentNames - the names of its parameters.
 */
const addProcedure = (blocks, id, procedureCode, argumentNames) => {
    add(blocks, {
        id: `${id}Definition`,
        opcode: 'procedures_definition',
        topLevel: true,
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
            argumentids: JSON.stringify(argumentNames.map((name, index) => `arg${index}`)),
            argumentnames: JSON.stringify(argumentNames),
            argumentdefaults: JSON.stringify(argumentNames.map(() => '')),
            warp: 'false'
        }
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
 * Build a workspace with a class block whose body declares a field, a method and a constructor, plus
 * the procedures those declarations refer to.
 * @param {string} [procedureCode] - the method's procedure code.
 * @param {Array.<string>} [argumentNames] - the method procedure's parameter names.
 * @returns {Blocks} the workspace.
 */
const makeClassWorkspace = (procedureCode = 'greet %s', argumentNames = ['MSG']) => {
    const blocks = makeBlocks();

    addProcedure(blocks, 'greet', procedureCode, argumentNames);
    addProcedure(blocks, 'init', 'init %s', ['MSG']);

    add(blocks, {
        id: 'classBlock',
        opcode: 'collections_defineClass',
        topLevel: true,
        inputs: {
            NAME: {name: 'NAME', block: 'className'},
            PARENTS: {name: 'PARENTS', block: 'classParents'},
            SUBSTACK: {name: 'SUBSTACK', block: 'fieldBlock'}
        }
    });
    addText(blocks, 'className', 'classBlock', 'Dog');
    addText(blocks, 'classParents', 'classBlock', 'Animal');

    add(blocks, {
        id: 'fieldBlock',
        opcode: 'collections_declareField',
        parent: 'classBlock',
        next: 'methodBlock',
        inputs: {
            NAME: {name: 'NAME', block: 'fieldName'},
            VALUE: {name: 'VALUE', block: 'fieldValue'}
        }
    });
    addText(blocks, 'fieldName', 'fieldBlock', 'legs');
    addText(blocks, 'fieldValue', 'fieldBlock', '4');

    add(blocks, {
        id: 'methodBlock',
        opcode: 'collections_declareMethod',
        parent: 'fieldBlock',
        next: 'constructorBlock',
        inputs: {
            NAME: {name: 'NAME', block: 'methodName'},
            PROCEDURE: {name: 'PROCEDURE', block: 'methodCall'}
        }
    });
    addText(blocks, 'methodName', 'methodBlock', '');
    addProcedureCall(blocks, 'methodCall', 'methodBlock', procedureCode);

    add(blocks, {
        id: 'constructorBlock',
        opcode: 'collections_declareConstructor',
        parent: 'methodBlock',
        inputs: {
            NAME: {name: 'NAME', block: 'constructorName'},
            PROCEDURE: {name: 'PROCEDURE', block: 'constructorCall'}
        }
    });
    addText(blocks, 'constructorName', 'constructorBlock', '');
    addProcedureCall(blocks, 'constructorCall', 'constructorBlock', 'init %s');

    return blocks;
};

/**
 * @param {object} target - the target methods are looked up on.
 * @returns {object} a block utility which records what a method call does.
 */
const makeUtil = target => ({
    target: target,
    stackFrame: {},
    params: [],
    startedProcedure: null,
    returnedProcedure: null,
    returnedValue: undefined,
    initParams () {
        this.params = [];
    },
    pushParam (name, value) {
        this.params.push([name, value]);
    },
    startProcedure (procedureCode) {
        this.startedProcedure = procedureCode;
    },
    startProcedureReturning (procedureCode) {
        this.returnedProcedure = procedureCode;
        return this.returnedValue === undefined ? '' : this.returnedValue;
    },
    getProcedureParamNamesIdsAndDefaults (procedureCode) {
        return this.target.blocks.getProcedureParamNamesIdsAndDefaults(procedureCode);
    }
});

test('getInfo declares a class meta block and the collection blocks', t => {
    const {collections} = makeExtension();
    const info = collections.getInfo();
    t.equal(info.id, 'collections');
    t.equal(info.colorStyle, 'collections');
    t.ok(ColorStyles[info.colorStyle], 'the color style it names exists');

    const blocks = info.blocks.filter(entry => typeof entry === 'object');
    t.equal(blocks[0].opcode, 'defineClass');
    t.equal(blocks[0].blockType, 'meta');
    t.equal(blocks[0].branchCount, 1, 'the class block has a body branch');
    t.same(
        blocks.map(block => block.opcode),
        [
            'defineClass',
            'declareField',
            'declareMethod',
            'declareConstructor',
            'newInstance',
            'callMethod',
            'callMethodResult',
            'classNameOf',
            'isA',
            'getProperty',
            'setProperty',
            'setSharedProperty',
            'newMap',
            'setMapKey',
            'getMapKey',
            'mapHasKey',
            'deleteMapKey',
            'mapKeys',
            'newArray',
            'arrayPush',
            'arrayGet',
            'arraySet',
            'arrayLength',
            'toJSON',
            'parseJSON'
        ]
    );

    const method = blocks.find(block => block.opcode === 'declareMethod');
    const constructor = blocks.find(block => block.opcode === 'declareConstructor');
    t.equal(method.arguments.PROCEDURE.type, 'single_block', 'methods take a single block');
    t.equal(constructor.arguments.PROCEDURE.type, 'single_block', 'constructors take a single block');
    t.equal(blocks.find(block => block.opcode === 'newMap').disableMonitor, true);
    t.equal(blocks.find(block => block.opcode === 'newArray').disableMonitor, true);
    t.equal(blocks.find(block => block.opcode === 'callMethod').mutator, true,
        'the call block lets the project add its argument inputs');
    t.equal(blocks.find(block => block.opcode === 'callMethodResult').mutator, true,
        'the reporting call block has the same argument inputs');
    t.end();
});

test('classes inherit from every parent they list', t => {
    const {collections} = makeExtension();
    collections.defineClass({NAME: 'Named', PARENTS: ''});
    collections.setSharedProperty({CLASS: 'Named', PROPERTY: 'name', VALUE: 'creature'});
    collections.defineClass({NAME: 'Animal', PARENTS: 'Named'});
    collections.setSharedProperty({CLASS: 'Animal', PROPERTY: 'legs', VALUE: '4'});
    collections.defineClass({NAME: 'Pet', PARENTS: ''});
    collections.setSharedProperty({CLASS: 'Pet', PROPERTY: 'home', VALUE: 'house'});
    collections.defineClass({NAME: 'Dog', PARENTS: 'Animal, Pet'});

    const dog = collections.newInstance({CLASS: 'Dog'});
    t.ok(dog, 'an instance reports a handle');
    t.equal(collections.classNameOf({INSTANCE: dog}), 'Dog');
    t.equal(collections.getProperty({INSTANCE: dog, PROPERTY: 'legs'}), '4', 'from the first parent');
    t.equal(collections.getProperty({INSTANCE: dog, PROPERTY: 'home'}), 'house', 'from the second parent');
    t.equal(collections.getProperty({INSTANCE: dog, PROPERTY: 'name'}), 'creature', 'through a grandparent');

    t.equal(collections.isA({INSTANCE: dog, CLASS: 'Dog'}), true);
    t.equal(collections.isA({INSTANCE: dog, CLASS: 'Animal'}), true);
    t.equal(collections.isA({INSTANCE: dog, CLASS: 'Pet'}), true);
    t.equal(collections.isA({INSTANCE: dog, CLASS: 'Named'}), true);
    t.equal(collections.isA({INSTANCE: dog, CLASS: 'Cat'}), false);
    t.end();
});

test('the class body declares fields and binds procedures to the class', t => {
    const {collections} = makeExtension();
    const target = {blocks: makeClassWorkspace()};

    collections.defineClass({NAME: 'Dog', PARENTS: ''}, {target: target, blockId: 'classBlock'});
    const dog = collections.newInstance({CLASS: 'Dog'});
    t.equal(collections.getProperty({INSTANCE: dog, PROPERTY: 'legs'}), '4', 'the field comes from the body');

    const util = makeUtil(target);
    collections.callMethod({METHOD: 'greet', INSTANCE: dog, ARGS: ''}, util);
    t.equal(util.startedProcedure, 'greet %s', 'the method name comes from the procedure block');
    t.same(util.params, [['MSG', dog]], 'the first parameter is the instance');

    // The same class body on a workspace whose procedure takes one more parameter.
    const twoArgTarget = {blocks: makeClassWorkspace('greet %s %s', ['MSG', 'OTHER'])};
    collections.defineClass({NAME: 'Dog', PARENTS: ''}, {target: twoArgTarget, blockId: 'classBlock'});
    const withArgs = makeUtil(twoArgTarget);
    collections.callMethod({METHOD: 'greet', INSTANCE: dog, ARGS: 'hello'}, withArgs);
    t.same(withArgs.params, [['MSG', dog], ['OTHER', 'hello']], 'extra arguments fill later parameters');

    const array = collections.newArray();
    collections.arrayPush({ARRAY: array, VALUE: 'from'});
    collections.arrayPush({ARRAY: array, VALUE: 'an array'});
    const fromArray = makeUtil(twoArgTarget);
    collections.callMethod({METHOD: 'greet', INSTANCE: dog, ARGS: array}, fromArray);
    t.same(fromArray.params, [['MSG', dog], ['OTHER', 'from']],
        'an array in the arguments input is used as the argument list');
    t.end();
});

test('a call block passes the arguments its mutator added, in order', t => {
    const {collections} = makeExtension();
    const target = {blocks: makeClassWorkspace('greet %s %s %s', ['MSG', 'FIRST', 'SECOND'])};
    collections.defineClass({NAME: 'Dog', PARENTS: ''}, {target: target, blockId: 'classBlock'});
    const dog = collections.newInstance({CLASS: 'Dog'});

    // The mutator gives the call block ARG1, ARG2... inputs, in the order they were added.
    target.blocks.createBlock({
        id: 'callBlock',
        opcode: 'collections_callMethod',
        inputs: {
            INSTANCE: {name: 'INSTANCE', block: null},
            ARG1: {name: 'ARG1', block: 'argOne'},
            ARG2: {name: 'ARG2', block: 'argTwo'}
        },
        fields: {},
        next: null,
        parent: null,
        topLevel: false,
        shadow: false
    });
    const util = makeUtil(target);
    util.blockId = 'callBlock';

    collections.callMethod({METHOD: 'greet', INSTANCE: dog, ARG1: 'added', ARG2: 'later'}, util);
    t.same(util.params, [['MSG', dog], ['FIRST', 'added'], ['SECOND', 'later']],
        'the added inputs become the arguments after the instance, in order');

    // An input the project left empty is absent from the block, but still holds its place in the list.
    target.blocks.getBlock('callBlock').inputs.ARG1.block = null;
    const second = makeUtil(target);
    second.blockId = 'callBlock';
    collections.callMethod({METHOD: 'greet', INSTANCE: dog, ARG2: 'later'}, second);
    t.same(second.params, [['MSG', dog], ['FIRST', ''], ['SECOND', 'later']],
        'an empty input does not let the next argument slide into its place');
    t.end();
});

test('methods are inherited, and calling an unknown one does nothing', t => {
    const {collections} = makeExtension();
    const target = {blocks: makeClassWorkspace()};
    collections.defineClass({NAME: 'Dog', PARENTS: ''}, {target: target, blockId: 'classBlock'});
    collections.defineClass({NAME: 'Puppy', PARENTS: 'Dog'});

    const puppy = collections.newInstance({CLASS: 'Puppy'});
    const util = makeUtil(target);
    collections.callMethod({METHOD: 'greet', INSTANCE: puppy, ARGS: ''}, util);
    t.equal(util.startedProcedure, 'greet %s', 'the inherited method runs');
    t.same(util.params, [['MSG', puppy]], 'and gets the child instance');

    const unknown = makeUtil(target);
    collections.callMethod({METHOD: 'bark', INSTANCE: puppy, ARGS: ''}, unknown);
    t.equal(unknown.startedProcedure, null, 'an undeclared method does nothing');
    t.end();
});

test('the reporting call block reports the value a method returns', t => {
    const {collections} = makeExtension();
    const target = {blocks: makeClassWorkspace()};
    collections.defineClass({NAME: 'Dog', PARENTS: ''}, {target: target, blockId: 'classBlock'});
    const dog = collections.newInstance({CLASS: 'Dog'});

    const util = makeUtil(target);
    util.returnedValue = 'hello back';
    t.equal(collections.callMethodResult({METHOD: 'greet', INSTANCE: dog, ARGS: ''}, util), 'hello back',
        'the block reports the value the method returns');
    t.equal(util.returnedProcedure, 'greet %s', 'the method runs, waiting for its value');
    t.same(util.params, [['MSG', dog]], 'the method gets the instance as its first parameter');

    const unknown = makeUtil(target);
    t.equal(collections.callMethodResult({METHOD: 'bark', INSTANCE: dog, ARGS: ''}, unknown), '',
        'an undeclared method reports an empty value');
    t.equal(unknown.returnedProcedure, null, 'and runs no procedure');

    const missing = makeUtil(target);
    t.equal(collections.callMethodResult({METHOD: 'greet', INSTANCE: '#none'}, missing), '',
        'an instance which does not exist reports an empty value');
    t.equal(missing.returnedProcedure, null, 'and runs no procedure');
    t.end();
});

test('a declared method with no procedure in its slot is ignored', t => {
    const {collections} = makeExtension();
    const blocks = makeClassWorkspace();
    // Empty the procedure slot of the method declaration.
    delete blocks.getBlock('methodBlock').inputs.PROCEDURE;

    const target = {blocks: blocks};
    collections.defineClass({NAME: 'Dog', PARENTS: ''}, {target: target, blockId: 'classBlock'});
    const dog = collections.newInstance({CLASS: 'Dog'});
    const util = makeUtil(target);
    collections.callMethod({METHOD: 'greet', INSTANCE: dog, ARGS: ''}, util);
    t.equal(util.startedProcedure, null, 'a method with no procedure does nothing');
    t.end();
});

test('a class\'s own properties win, then earlier parents', t => {
    const {collections} = makeExtension();
    collections.defineClass({NAME: 'First', PARENTS: ''});
    collections.setSharedProperty({CLASS: 'First', PROPERTY: 'colour', VALUE: 'red'});
    collections.defineClass({NAME: 'Second', PARENTS: ''});
    collections.setSharedProperty({CLASS: 'Second', PROPERTY: 'colour', VALUE: 'blue'});
    collections.defineClass({NAME: 'Both', PARENTS: 'First, Second'});

    const handle = collections.newInstance({CLASS: 'Both'});
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'colour'}), 'red',
        'the earlier parent wins over the later one');

    collections.setSharedProperty({CLASS: 'Both', PROPERTY: 'colour', VALUE: 'green'});
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'colour'}), 'green',
        'the class itself wins over its parents');

    collections.setProperty({INSTANCE: handle, PROPERTY: 'colour', VALUE: 'pink'});
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'colour'}), 'pink',
        'an instance property wins over every class');

    const other = collections.newInstance({CLASS: 'Both'});
    t.equal(collections.getProperty({INSTANCE: other, PROPERTY: 'colour'}), 'green',
        'another instance keeps using the class\'s property');
    t.end();
});

test('class properties are shared with instances created earlier', t => {
    const {collections} = makeExtension();
    collections.defineClass({NAME: 'Thing', PARENTS: ''});
    const handle = collections.newInstance({CLASS: 'Thing'});
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'size'}), '',
        'nothing is there before the class gets the property');

    collections.setSharedProperty({CLASS: 'Thing', PROPERTY: 'size', VALUE: '3'});
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'size'}), '3',
        'existing instances see the property, like a prototype');
    t.end();
});

test('diamond inheritance visits each class once', t => {
    const {collections} = makeExtension();
    collections.defineClass({NAME: 'Base', PARENTS: ''});
    collections.setSharedProperty({CLASS: 'Base', PROPERTY: 'root', VALUE: 'yes'});
    collections.defineClass({NAME: 'Left', PARENTS: 'Base'});
    collections.defineClass({NAME: 'Right', PARENTS: 'Base'});
    collections.defineClass({NAME: 'Diamond', PARENTS: 'Left, Right'});

    const handle = collections.newInstance({CLASS: 'Diamond'});
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'root'}), 'yes');
    t.equal(collections.isA({INSTANCE: handle, CLASS: 'Base'}), true);
    t.end();
});

test('unknown classes and instances report blank', t => {
    const {collections} = makeExtension();
    t.equal(collections.newInstance({CLASS: 'Nope'}), '');
    t.equal(collections.getProperty({INSTANCE: '#99', PROPERTY: 'anything'}), '');
    t.equal(collections.classNameOf({INSTANCE: ''}), '');
    t.equal(collections.isA({INSTANCE: '', CLASS: 'Thing'}), false);

    collections.defineClass({NAME: 'Thing', PARENTS: ''});
    const handle = collections.newInstance({CLASS: 'Thing'});
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'missing'}), '');
    t.end();
});

test('names are trimmed and parents are split on commas', t => {
    const {collections} = makeExtension();
    collections.defineClass({NAME: 'First', PARENTS: ''});
    collections.setSharedProperty({CLASS: 'First', PROPERTY: 'a', VALUE: '1'});
    collections.defineClass({NAME: '  Spaced  ', PARENTS: ' First ,Second '});
    t.same(collections.getClassNames(), ['First', 'Spaced']);

    const handle = collections.newInstance({CLASS: ' Spaced '});
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'a'}), '1');
    t.end();
});

test('maps hold keyed values and belong to no class', t => {
    const {collections} = makeExtension();
    const map = collections.newMap();
    t.ok(map, 'a map reports a handle');
    t.equal(collections.classNameOf({INSTANCE: map}), '', 'a map is not an instance');
    t.equal(collections.getMapKey({MAP: map, KEY: 'name'}), '');
    t.equal(collections.mapHasKey({MAP: map, KEY: 'name'}), false);

    collections.setMapKey({MAP: map, KEY: 'name', VALUE: 'Rex'});
    collections.setMapKey({MAP: map, KEY: 'legs', VALUE: 4});
    t.equal(collections.getMapKey({MAP: map, KEY: 'name'}), 'Rex');
    t.equal(collections.getMapKey({MAP: map, KEY: 'legs'}), 4);
    t.equal(collections.mapHasKey({MAP: map, KEY: 'legs'}), true);
    t.equal(collections.mapKeys({MAP: map}), 'name, legs');

    collections.deleteMapKey({MAP: map, KEY: 'legs'});
    t.equal(collections.mapHasKey({MAP: map, KEY: 'legs'}), false);
    t.equal(collections.mapKeys({MAP: map}), 'name');
    t.end();
});

test('arrays hold ordered values', t => {
    const {collections} = makeExtension();
    const array = collections.newArray();
    t.ok(array, 'an array reports a handle');
    t.equal(collections.arrayLength({ARRAY: array}), 0);

    collections.arrayPush({ARRAY: array, VALUE: 'a'});
    collections.arrayPush({ARRAY: array, VALUE: 'b'});
    t.equal(collections.arrayLength({ARRAY: array}), 2);
    t.equal(collections.arrayGet({ARRAY: array, INDEX: 1}), 'a', 'the first item is 1');
    t.equal(collections.arrayGet({ARRAY: array, INDEX: 3}), '', 'past the end is blank');

    collections.arraySet({ARRAY: array, INDEX: 2, VALUE: 'c'});
    t.equal(collections.arrayGet({ARRAY: array, INDEX: 2}), 'c');
    t.equal(collections.arraySet({ARRAY: array, INDEX: 5, VALUE: 'e'}),
        undefined, 'setting past the end does nothing');
    t.equal(collections.arrayLength({ARRAY: array}), 2);
    t.end();
});

test('json converts collections to text and back', t => {
    const {collections} = makeExtension();
    const map = collections.newMap();
    const array = collections.newArray();
    collections.arrayPush({ARRAY: array, VALUE: 1});
    collections.arrayPush({ARRAY: array, VALUE: 2});
    collections.setMapKey({MAP: map, KEY: 'name', VALUE: 'Rex'});
    collections.setMapKey({MAP: map, KEY: 'items', VALUE: array});

    t.same(JSON.parse(collections.toJSON({VALUE: map})), {name: 'Rex', items: [1, 2]});

    const parsed = collections.parseJSON({TEXT: '{"n": 1, "list": [3, 4], "flag": null}'});
    t.equal(collections.getMapKey({MAP: parsed, KEY: 'n'}), 1);
    t.equal(collections.getMapKey({MAP: parsed, KEY: 'flag'}), '', 'null becomes blank');
    const list = collections.getMapKey({MAP: parsed, KEY: 'list'});
    t.equal(collections.arrayLength({ARRAY: list}), 2);
    t.equal(collections.arrayGet({ARRAY: list, INDEX: 2}), 4);

    t.equal(collections.parseJSON({TEXT: '5'}), 5, 'a bare number stays a number');
    t.equal(collections.parseJSON({TEXT: 'not json'}), '', 'text which is not JSON reports blank');
    t.equal(collections.toJSON({VALUE: 'hi'}), '"hi"');
    t.end();
});

test('json includes the properties an instance gets from its classes', t => {
    const {collections} = makeExtension();
    collections.defineClass({NAME: 'Animal', PARENTS: ''});
    collections.setSharedProperty({CLASS: 'Animal', PROPERTY: 'legs', VALUE: 4});
    collections.defineClass({NAME: 'Dog', PARENTS: 'Animal'});
    const dog = collections.newInstance({CLASS: 'Dog'});
    collections.setProperty({INSTANCE: dog, PROPERTY: 'name', VALUE: 'Rex'});

    t.same(JSON.parse(collections.toJSON({VALUE: dog})), {legs: 4, name: 'Rex'});
    t.end();
});

test('loading a project clears classes, instances, maps and arrays', t => {
    const {collections, listeners} = makeExtension();
    t.ok(listeners.PROJECT_LOADED, 'the extension listens for a project loading');

    collections.defineClass({NAME: 'Thing', PARENTS: ''});
    collections.setSharedProperty({CLASS: 'Thing', PROPERTY: 'size', VALUE: '3'});
    const handle = collections.newInstance({CLASS: 'Thing'});
    const map = collections.newMap();
    collections.setMapKey({MAP: map, KEY: 'a', VALUE: '1'});
    const array = collections.newArray();
    collections.arrayPush({ARRAY: array, VALUE: 'a'});

    listeners.PROJECT_LOADED();

    t.same(collections.getClassNames(), [], 'classes are gone');
    t.equal(collections.getProperty({INSTANCE: handle, PROPERTY: 'size'}), '', 'instances are gone');
    t.equal(collections.newInstance({CLASS: 'Thing'}), '', 'the old class cannot be instantiated');
    t.equal(collections.getMapKey({MAP: map, KEY: 'a'}), '', 'maps are gone');
    t.equal(collections.arrayLength({ARRAY: array}), 0, 'arrays are gone');
    t.end();
});
