const ir = require('../ir/index');

/**
 * Compilation functions for the control blocks.
 *
 * Loops yield once per iteration unless they run in warp mode, matching the
 * frame-by-frame behavior of the interpreted loop blocks. In warp mode a loop
 * only yields when its warp time is used up.
 */

/**
 * Emit a loop that runs a body until a condition stops it.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @param {object} block Loop block.
 * @param {boolean} whileTrue Whether the body runs while the condition is true.
 * @returns {{statements: Array.<object>}} Loop source.
 */
const conditionalLoop = (emit, block, whileTrue) => {
	const condition = emit.input(block, 'CONDITION');
	const body = emit.stack(emit.branch(block, 'SUBSTACK'));
	const test = emit.boolean(condition.source);
	const check = whileTrue
		? ir.ifThen(ir.source(['!', test]), [ir.statement('break')])
		: ir.ifThen(test, [ir.statement('break')]);

	return {
		statements: [
			ir.whileLoop(ir.literal(true), [
				...condition.statements,
				check,
				...body,
				...emit.loopYield()
			])
		]
	};
};

const ifBlock = (emit, block) => {
	const condition = emit.input(block, 'CONDITION');

	return {
		statements: [
			...condition.statements,
			ir.ifThen(
				ir.source(['Cast.toBoolean(', condition.source, ')']),
				emit.stack(emit.branch(block, 'SUBSTACK'))
			)
		]
	};
};

const ifElse = (emit, block) => {
	const condition = emit.input(block, 'CONDITION');

	return {
		statements: [
			...condition.statements,
			ir.ifThen(
				emit.boolean(condition.source),
				emit.stack(emit.branch(block, 'SUBSTACK')),
				emit.stack(emit.branch(block, 'SUBSTACK2'))
			)
		]
	};
};

const repeat = (emit, block) => {
	const times = emit.input(block, 'TIMES');
	const count = emit.newVarName('count');
	const index = emit.newVarName('index');

	return {
		statements: [
			...times.statements,
			ir.block([
				ir.declaration(
					'const',
					count,
					ir.source(['Math.round(', emit.number(times.source), ')'])
				),
				ir.forLoop(`let ${index} = 0`, ir.source([index, ' < ', count]), `${index}++`, [
					...emit.stack(emit.branch(block, 'SUBSTACK')),
					...emit.loopYield()
				])
			])
		]
	};
};

const repeatUntil = (emit, block) => conditionalLoop(emit, block, false);

const repeatWhile = (emit, block) => conditionalLoop(emit, block, true);

const forever = (emit, block) => ({
	statements: [
		ir.whileLoop(ir.literal(true), [
			...emit.stack(emit.branch(block, 'SUBSTACK')),
			...emit.loopYield()
		])
	]
});

const waitUntil = (emit, block) => {
	const condition = emit.input(block, 'CONDITION');

	return {
		statements: [
			ir.whileLoop(ir.literal(true), [
				...condition.statements,
				ir.ifThen(
					emit.boolean(condition.source),
					[ir.statement('break')]
				),
				ir.yieldStatement(ir.source('Signals.YIELD'))
			])
		]
	};
};

const forEach = (emit, block) => {
	const value = emit.input(block, 'VALUE');
	const variable = emit.newVarName('variable');
	const count = emit.newVarName('count');
	const index = emit.newVarName('index');
	const field = emit.variableField(block, 'VARIABLE');

	return {
		statements: [
			...value.statements,
			ir.block([
				ir.declaration('const', variable, emit.variable(block, 'VARIABLE')),
				ir.declaration('const', count, ir.source(['Number(', value.source, ')'])),
				ir.forLoop(`let ${index} = 0`, ir.source([index, ' < ', count]), `${index}++`, [
					ir.assignment(ir.source([variable, '.value']), ir.source([index, ' + 1']), field.id),
					...emit.stack(emit.branch(block, 'SUBSTACK')),
					...emit.loopYield()
				])
			])
		]
	};
};

const wait = (emit, block) => {
	// Waiting asks for a redraw, which ends the frame, as it does for the
	// interpreted block.
	const duration = emit.input(block, 'DURATION');
	const milliseconds = emit.newVarName('milliseconds');
	const timer = emit.newVarName('timer');

	return {
		statements: [
			...duration.statements,
			ir.block([
				ir.declaration(
					'const',
					milliseconds,
					ir.source(['Math.max(0, 1000 * ', emit.number(duration.source), ')'])
				),
				ir.statement('runtime.requestRedraw()'),
				ir.declaration('const', timer, ir.source('new Timer()')),
				ir.statement(timer, '.start()'),
				ir.yieldStatement(ir.source('Signals.YIELD')),
				ir.whileLoop(
					ir.source([timer, '.timeElapsed() < ', milliseconds]),
					[ir.yieldStatement(ir.source('Signals.YIELD'))]
				)
			])
		]
	};
};

const createClone = (emit, block) => {
	const option = emit.input(block, 'CLONE_OPTION');
	const name = emit.newVarName('option');
	const cloneTarget = emit.newVarName('cloneTarget');
	const newClone = emit.newVarName('newClone');

	return {
		statements: [
			...option.statements,
			ir.block([
				ir.declaration('const', name, ir.source(['Cast.toString(', option.source, ')'])),
				ir.declaration('const', cloneTarget, ir.source([
					name, " === '_myself_' ? target : runtime.getSpriteTargetByName(",
					name, ')'
				])),
				ir.ifThen(ir.source([cloneTarget]), [
					ir.declaration('const', newClone, ir.source([cloneTarget, '.makeClone()'])),
					ir.ifThen(ir.source([newClone]), [
						ir.statement('runtime.addTarget(', newClone, ')'),
						ir.statement(newClone, '.goBehindOther(', cloneTarget, ')')
					])
				])
			])
		]
	};
};

const deleteClone = () => ({
	statements: [
		ir.ifThen(ir.source('!target.isOriginal'), [
			ir.statement('runtime.disposeTarget(target)'),
			ir.statement('runtime.stopForTarget(target)'),
			ir.returnStatement()
		])
	]
});

const stop = (emit, block) => {
	const option = emit.field(block, 'STOP_OPTION');

	return {
		statements: [
			ir.ifThen(
				ir.source([option, " === 'all'"]),
				[ir.statement('runtime.stopAll()'), ir.returnStatement()],
				[
					ir.ifThen(
						ir.source([
							option, " === 'other scripts in sprite' || ",
							option, " === 'other scripts in stage'"
						]),
						[ir.statement('util.stopOtherTargetThreads()')],
						[ir.returnStatement()]
					)
				]
			)
		]
	};
};

module.exports = {
	expressions: {},
	statements: {
		control_all_at_once: (emit, block) => ({statements: emit.stack(emit.branch(block, 'SUBSTACK'))}),
		control_for_each: forEach,
		control_forever: forever,
		control_if: ifBlock,
		control_if_else: ifElse,
		control_repeat: repeat,
		control_repeat_until: repeatUntil,
		control_stop: stop,
		control_wait: wait,
		control_create_clone_of: createClone,
		control_delete_this_clone: deleteClone,
		control_wait_until: waitUntil,
		control_while: repeatWhile
	}
};
