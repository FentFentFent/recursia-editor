const test = require('tap').test;
const ir = require('../../src/compiler/ir/index');
const transpile = require('../../src/compiler/ir/transpile');
const constantVariables = require('../../src/compiler/optimization/stages/constant-variables');
const deadCodeElimination = require('../../src/compiler/optimization/stages/dead-code-elimination');
const typeAnalysis = require('../../src/compiler/optimization/stages/type-analysis');
const optimize = require('../../src/compiler/optimization/index').optimize;

test('transpiles statements, expressions and procedures', t => {
    const source = transpile({
        header: ['const helper = 1;'],
        body: [
            ir.declaration('const', 'x', ir.literal(1)),
            ir.ifThen(
                ir.source(['x > 0']),
                [ir.statement('target.setXY(', ir.source('x'), ', 0)')],
                [ir.returnStatement()]
            )
        ],
        procedures: [{
            name: '__procedure0',
            parameters: ['argument0'],
            body: [ir.returnStatement(ir.source('argument0'))]
        }]
    });

    t.match(source, /"use strict";/, 'the source is strict');
    t.match(source, /const helper = 1;/, 'the script header is emitted');
    t.match(source, /function\* __procedure0\(argument0, __callerWarp\)/, 'the procedure is emitted');
    t.match(source, /if \(x > 0\) \{/, 'the conditional is emitted');
    t.match(source, /target\.setXY\(x, 0\);/, 'the expression is emitted');
    t.match(source, /return function\* \(\) \{/, 'the body is a generator');

    t.end();
});

test('constant variables replace reads of variables that never change', t => {
    const constants = new Map([['constantId', {value: 7}]]);
    const body = [
        ir.statement('target.setXY(', ir.variableValue('constantId', 'x'), ', ', ir.variableValue('otherId', 'y'), ')')
    ];

    const optimized = constantVariables.optimize(body, {constants});
    const lines = transpile.renderStatements(optimized);

    t.equal(lines.join('\n'), 'target.setXY(7, target.lookupOrCreateVariable("otherId", "y").value);',
        'only the constant variable is inlined');

    t.end();
});

test('dead code elimination drops statements after a return', t => {
    const body = [
        ir.statement('before()'),
        ir.returnStatement(ir.literal(1)),
        ir.statement('after()')
    ];

    const optimized = deadCodeElimination.optimize(body);

    t.equal(transpile.renderStatements(optimized).join('\n'), 'before();\nreturn 1;',
        'the unreachable statement was removed');

    t.end();
});

test('dead code elimination keeps only the branch a literal test runs', t => {
    const body = [
        ir.ifThen(ir.literal(false), [ir.statement('never()')], [ir.statement('always()')]),
        ir.statement('after()')
    ];

    const optimized = deadCodeElimination.optimize(body);

    t.equal(transpile.renderStatements(optimized).join('\n'), '{\n\talways();\n}\nafter();',
        'the branch that runs was kept');

    t.end();
});

test('type analysis replaces a variable read with the value it was assigned', t => {
    const body = [
        ir.assignment(
            ir.source([ir.variable('valueId', 'value', '__value'), '.value']),
            ir.literal(5),
            'valueId'
        ),
        ir.assignment(
            ir.source([ir.variable('valueId', 'value', '__value'), '.value']),
            ir.source(['(', ir.cast('number', ir.variableValue('valueId', 'value', '__value')), ' * 2)']),
            'valueId'
        )
    ];

    const source = transpile.renderStatements(typeAnalysis.optimize(body)).join('\n');

    t.match(source, /\(5 \* 2\)/, 'the read was replaced with the constant');
    t.notMatch(source, /Cast\.toNumber/, 'the value needed no conversion');

    t.end();
});

test('type analysis keeps a variable a branch can assign differently', t => {
    const read = ir.cast('number', ir.variableValue('valueId', 'value', '__value'));
    const body = [
        ir.ifThen(
            ir.source('condition'),
            [ir.assignment(ir.source([ir.variable('valueId', 'value', '__value'), '.value']), ir.literal(1), 'valueId')],
            [ir.assignment(ir.source([ir.variable('valueId', 'value', '__value'), '.value']), ir.literal(2), 'valueId')]
        ),
        ir.statement('use(', read, ')')
    ];

    const source = transpile.renderStatements(typeAnalysis.optimize(body)).join('\n');

    t.match(source, /__value\.value/, 'the read stays a read when the branch decides its value');
    t.notMatch(source, /use\((1|2)\)/, 'neither branch value was assumed');
    t.match(source, /Cast\.toNumber/, 'the value keeps the conversion every branch needs');

    t.end();
});

test('type analysis forgets variables when the script can be paused', t => {
    const read = ir.cast('number', ir.variableValue('valueId', 'value', '__value'));
    const body = [
        ir.assignment(
            ir.source([ir.variable('valueId', 'value', '__value'), '.value']),
            ir.literal(5),
            'valueId'
        ),
        ir.yieldStatement(ir.source('Signals.YIELD')),
        ir.statement('use(', read, ')')
    ];

    const source = transpile.renderStatements(typeAnalysis.optimize(body)).join('\n');

    t.match(source, /Cast\.toNumber\(__value\.value\)/, 'another script can change the variable while this one is paused');

    t.end();
});

test('type analysis forgets variables after a suspending statement', t => {
    const read = ir.cast('number', ir.variableValue('valueId', 'value', '__value'));
    const body = [
        ir.assignment(
            ir.source([ir.variable('valueId', 'value', '__value'), '.value']),
            ir.literal(5),
            'valueId'
        ),
        ir.suspending('yield* __procedure()'),
        ir.statement('use(', read, ')')
    ];

    const source = transpile.renderStatements(typeAnalysis.optimize(body)).join('\n');

    t.match(source, /Cast\.toNumber\(__value\.value\)/, 'the procedure can change the variable');

    t.end();
});

test('type analysis removes a boolean conversion of a boolean', t => {
    const body = [
        ir.ifThen(ir.cast('boolean', ir.literal(true)), [ir.statement('kept()')])
    ];

    const source = transpile.renderStatements(typeAnalysis.optimize(body)).join('\n');

    t.match(source, /if \(true\)/, 'the conversion is gone');
    t.notMatch(source, /Cast\.toBoolean/, 'no cast remains');

    t.end();
});

test('the optimization pipeline runs the stages in order', t => {
    const constants = new Map([['conditionId', {value: true}]]);
    const body = [
        ir.ifThen(
            ir.variableValue('conditionId', 'flag'),
            [ir.statement('kept()')],
            [ir.statement('dropped()')]
        ),
        ir.statement('after()')
    ];

    const optimized = optimize(body, {constants});
    const source = transpile.renderStatements(optimized).join('\n');

    t.match(source, /kept\(\);/, 'the constant test kept its branch');
    t.notMatch(source, /dropped\(\);/, 'the dead branch was removed');
    t.match(source, /after\(\);/, 'the following statement was kept');

    t.end();
});
