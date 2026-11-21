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
 * @returns {{lines: Array.<string>}} Loop source.
 */
const conditionalLoop = (emit, block, whileTrue) => {
	const condition = emit.input(block, 'CONDITION');
	const body = emit.stack(emit.branch(block, 'SUBSTACK'));
	const test = `Cast.toBoolean(${condition.source})`;
	const check = whileTrue ? `if (!${test}) break;` : `if (${test}) break;`;
	return {
		lines: [
			'while (true) {',
			...emit.indent([...condition.lines, check], 1),
			...emit.indent(body.lines, 1),
			...emit.indent(emit.loopYield(), 1),
			'}'
		]
	};
};

const ifBlock = (emit, block) => {
	const condition = emit.input(block, 'CONDITION');

	return {
		lines: [
			...condition.lines,
			`if (Cast.toBoolean(${condition.source})) {`,
			...emit.indent(emit.stack(emit.branch(block, 'SUBSTACK')).lines, 1),
			'}'
		]
	};
};

const ifElse = (emit, block) => {
	const condition = emit.input(block, 'CONDITION');

	return {
		lines: [
			...condition.lines,
			`if (Cast.toBoolean(${condition.source})) {`,
			...emit.indent(emit.stack(emit.branch(block, 'SUBSTACK')).lines, 1),
			'} else {',
			...emit.indent(emit.stack(emit.branch(block, 'SUBSTACK2')).lines, 1),
			'}'
		]
	};
};

const repeat = (emit, block) => {
	const times = emit.input(block, 'TIMES');
	const count = emit.newVarName('count');
	const index = emit.newVarName('index');

	return {
		lines: [
			...times.lines,
			'{',
			`\tconst ${count} = Math.round(Cast.toNumber(${times.source}));`,
			`\tfor (let ${index} = 0; ${index} < ${count}; ${index}++) {`,
			...emit.indent(emit.stack(emit.branch(block, 'SUBSTACK')).lines, 2),
			...emit.indent(emit.loopYield(), 2),
			'\t}',
			'}'
		]
	};
};

const repeatUntil = (emit, block) => conditionalLoop(emit, block, false);

const repeatWhile = (emit, block) => conditionalLoop(emit, block, true);

const forever = (emit, block) => ({
	lines: [
		'while (true) {',
		...emit.indent(emit.stack(emit.branch(block, 'SUBSTACK')).lines, 1),
		...emit.indent(emit.loopYield(), 1),
		'}'
	]
});

const waitUntil = (emit, block) => {
	const condition = emit.input(block, 'CONDITION');

	return {
		lines: [
			'while (true) {',
			...emit.indent([...condition.lines, `if (Cast.toBoolean(${condition.source})) break;`], 1),
			'\tyield Signals.YIELD;',
			'}'
		]
	};
};

const forEach = (emit, block) => {
	const value = emit.input(block, 'VALUE');
	const variable = emit.newVarName('variable');
	const count = emit.newVarName('count');
	const index = emit.newVarName('index');

	return {
		lines: [
			...value.lines,
			'{',
			`\tconst ${variable} = ${emit.variable(block, 'VARIABLE')};`,
			`\tconst ${count} = Number(${value.source});`,
			`\tfor (let ${index} = 0; ${index} < ${count}; ${index}++) {`,
			`\t\t${variable}.value = ${index} + 1;`,
			...emit.indent(emit.stack(emit.branch(block, 'SUBSTACK')).lines, 2),
			...emit.indent(emit.loopYield(), 2),
			'\t}',
			'}'
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
		lines: [
			...duration.lines,
			'{',
			`\tconst ${milliseconds} = Math.max(0, 1000 * Cast.toNumber(${duration.source}));`,
			'\truntime.requestRedraw();',
			`\tconst ${timer} = new Timer();`,
			`\t${timer}.start();`,
			'\tyield Signals.YIELD;',
			`\twhile (${timer}.timeElapsed() < ${milliseconds}) yield Signals.YIELD;`,
			'}'
		]
	};
};

const createClone = (emit, block) => {
	const option = emit.input(block, 'CLONE_OPTION');
	const name = emit.newVarName('option');
	const cloneTarget = emit.newVarName('cloneTarget');
	const newClone = emit.newVarName('newClone');

	return {
		lines: [
			...option.lines,
			'{',
			`\tconst ${name} = Cast.toString(${option.source});`,
			`\tconst ${cloneTarget} = ${name} === '_myself_' ? target : runtime.getSpriteTargetByName(${name});`,
			`\tif (${cloneTarget}) {`,
			`\t\tconst ${newClone} = ${cloneTarget}.makeClone();`,
			`\t\tif (${newClone}) {`,
			`\t\t\truntime.addTarget(${newClone});`,
			`\t\t\t${newClone}.goBehindOther(${cloneTarget});`,
			'\t\t}',
			'\t}',
			'}'
		]
	};
};

const deleteClone = () => ({
	lines: [
		'if (!target.isOriginal) {',
		'\truntime.disposeTarget(target);',
		'\truntime.stopForTarget(target);',
		'\treturn;',
		'}'
	]
});

const stop = (emit, block) => {
	const option = emit.field(block, 'STOP_OPTION');

	return {
		lines: [
			`if (${option} === 'all') {`,
			'\truntime.stopAll();',
			'\treturn;',
			`} else if (${option} === 'other scripts in sprite' || ${option} === 'other scripts in stage') {`,
			'\tutil.stopOtherTargetThreads();',
			'} else {',
			'\treturn;',
			'}'
		]
	};
};

module.exports = {
	expressions: {},
	statements: {
		control_all_at_once: (emit, block) => emit.stack(emit.branch(block, 'SUBSTACK')),
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
