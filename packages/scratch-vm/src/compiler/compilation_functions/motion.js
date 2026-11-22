const ir = require('../ir/index');

/**
 * Compilation functions for the motion blocks.
 *
 * Each block is compiled into the operations its implementation performs on the
 * target, instead of calling the block implementation with an arguments object.
 */

/**
 * Declare the helper that resolves the position of a "go to" menu option.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const targetXY = emit => emit.helper('motion:targetXY', 'targetXY', `targetName => {
	if (targetName === '_mouse_') {
		return [runtime.ioDevices.mouse.getScratchX(), runtime.ioDevices.mouse.getScratchY()];
	}
	if (targetName === '_random_') {
		return [
			Math.round(runtime.constructor.STAGE_WIDTH * (Math.random() - 0.5)),
			Math.round(runtime.constructor.STAGE_HEIGHT * (Math.random() - 0.5))
		];
	}
	const found = runtime.getSpriteTargetByName(Cast.toString(targetName));
	return found ? [found.x, found.y] : null;
}`);

/**
 * Declare the helper that glides a target to a position, yielding per frame.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const glide = emit => emit.helper('motion:glide', 'glide', `function* (target, secs, endX, endY) {
	const startX = target.x;
	const startY = target.y;
	if (secs > 0) {
		const timer = new Timer();
		timer.start();
		while (true) {
			const elapsed = timer.timeElapsed();
			if (elapsed >= secs * 1000) break;
			const fraction = elapsed / (secs * 1000);
			target.setXY(
				startX + (fraction * (endX - startX)),
				startY + (fraction * (endY - startY))
			);
			yield Signals.YIELD;
		}
	}
	target.setXY(endX, endY);
}`);

/**
 * Declare the helper that points a target at a menu option.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const directionTowards = emit => emit.helper('motion:directionTowards', 'directionTowards', `(target, towards) => {
	if (towards === '_mouse_') {
		const dx = runtime.ioDevices.mouse.getScratchX() - target.x;
		const dy = runtime.ioDevices.mouse.getScratchY() - target.y;
		return 90 - MathUtil.radToDeg(Math.atan2(dy, dx));
	}
	if (towards === '_random_') {
		return Math.round(Math.random() * 360) - 180;
	}
	const other = runtime.getSpriteTargetByName(Cast.toString(towards));
	if (!other) return null;
	return 90 - MathUtil.radToDeg(Math.atan2(other.y - target.y, other.x - target.x));
}`);

/**
 * Declare the helper that bounces a target off the stage edge.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const bounce = emit => emit.helper('motion:bounce', 'bounce', `target => {
	const bounds = target.getBounds();
	if (!bounds) return;

	const stageWidth = runtime.constructor.STAGE_WIDTH;
	const stageHeight = runtime.constructor.STAGE_HEIGHT;
	const distLeft = Math.max(0, (stageWidth / 2) + bounds.left);
	const distTop = Math.max(0, (stageHeight / 2) - bounds.top);
	const distRight = Math.max(0, (stageWidth / 2) - bounds.right);
	const distBottom = Math.max(0, (stageHeight / 2) + bounds.bottom);

	let nearestEdge = '';
	let minDist = Infinity;
	if (distLeft < minDist) {
		minDist = distLeft;
		nearestEdge = 'left';
	}
	if (distTop < minDist) {
		minDist = distTop;
		nearestEdge = 'top';
	}
	if (distRight < minDist) {
		minDist = distRight;
		nearestEdge = 'right';
	}
	if (distBottom < minDist) {
		minDist = distBottom;
		nearestEdge = 'bottom';
	}
	if (minDist > 0) return;

	const radians = MathUtil.degToRad(90 - target.direction);
	let dx = Math.cos(radians);
	let dy = -Math.sin(radians);
	if (nearestEdge === 'left') {
		dx = Math.max(0.2, Math.abs(dx));
	} else if (nearestEdge === 'top') {
		dy = Math.max(0.2, Math.abs(dy));
	} else if (nearestEdge === 'right') {
		dx = 0 - Math.max(0.2, Math.abs(dx));
	} else if (nearestEdge === 'bottom') {
		dy = 0 - Math.max(0.2, Math.abs(dy));
	}
	target.setDirection(MathUtil.radToDeg(Math.atan2(dy, dx)) + 90);

	const fenced = target.keepInFence(target.x, target.y);
	target.setXY(fenced[0], fenced[1]);
}`);

/**
 * Emit a glide to a position.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @param {{statements: Array.<object>, source: object}} seconds Glide duration.
 * @param {{statements: Array.<object>, source: object}} x End x position.
 * @param {{statements: Array.<object>, source: object}} y End y position.
 * @returns {{statements: Array.<object>}} Block source.
 */
const emitGlide = (emit, seconds, x, y) => ({
	statements: [
		...seconds.statements,
		...x.statements,
		...y.statements,
		ir.suspending(
			'yield* ', glide(emit), '(target, ', emit.number(seconds.source), ', ',
			emit.number(x.source), ', ', emit.number(y.source), ')'
		)
	]
});

/**
 * Declare the helper that limits coordinate precision.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const limitPrecision = emit => emit.helper('motion:limitPrecision', 'limitPrecision', `value => {
	const rounded = Math.round(value);
	return Math.abs(value - rounded) < 1e-9 ? rounded : value;
}`);

module.exports = {
	expressions: {
		motion_xposition: emit => ({
			statements: [],
			source: ir.source([limitPrecision(emit), '(target.x)'])
		}),

		motion_yposition: emit => ({
			statements: [],
			source: ir.source([limitPrecision(emit), '(target.y)'])
		}),

		motion_direction: () => ({statements: [], source: ir.source('target.direction')})
	},
	statements: {
		motion_movesteps: (emit, block) => {
			const steps = emit.input(block, 'STEPS');
			const radians = emit.newVarName('radians');
			const dx = emit.newVarName('dx');
			const dy = emit.newVarName('dy');

			return {
				statements: [
					...steps.statements,
					ir.block([
						ir.declaration('const', radians, ir.source('MathUtil.degToRad(90 - target.direction)')),
						ir.declaration('const', dx, ir.source([
							emit.number(steps.source), ' * Math.cos(', radians, ')'
						])),
						ir.declaration('const', dy, ir.source([
							emit.number(steps.source), ' * Math.sin(', radians, ')'
						])),
						ir.statement('target.setXY(target.x + ', dx, ', target.y + ', dy, ')')
					])
				]
			};
		},

		motion_gotoxy: (emit, block) => {
			const inputs = emit.inputs(block, ['X', 'Y']);

			return {
				statements: [
					...inputs.statements,
					ir.statement(
						'target.setXY(', emit.number(inputs.sources.X), ', ',
						emit.number(inputs.sources.Y), ')'
					)
				]
			};
		},

		motion_goto: (emit, block) => {
			const to = emit.input(block, 'TO');
			const position = emit.newVarName('position');

			return {
				statements: [
					...to.statements,
					ir.block([
						ir.declaration('const', position, ir.source([targetXY(emit), '(', to.source, ')'])),
						ir.ifThen(ir.source([position]), [
							ir.statement('target.setXY(', position, '[0], ', position, '[1])')
						])
					])
				]
			};
		},

		motion_glidesecstoxy: (emit, block) => emitGlide(
			emit,
			emit.input(block, 'SECS'),
			emit.input(block, 'X'),
			emit.input(block, 'Y')
		),

		motion_glideto: (emit, block) => {
			const secs = emit.input(block, 'SECS');
			const to = emit.input(block, 'TO');
			const position = emit.newVarName('position');

			return {
				statements: [
					...secs.statements,
					...to.statements,
					ir.block([
						ir.declaration('const', position, ir.source([targetXY(emit), '(', to.source, ')'])),
						ir.ifThen(ir.source([position]), [
							ir.suspending(
								'yield* ', glide(emit), '(target, ', emit.number(secs.source), ', ',
								position, '[0], ', position, '[1])'
							)
						])
					])
				]
			};
		},

		motion_turnright: (emit, block) => {
			const degrees = emit.input(block, 'DEGREES');

			return {
				statements: [
					...degrees.statements,
					ir.statement(
						'target.setDirection(target.direction + ', emit.number(degrees.source), ')'
					)
				]
			};
		},

		motion_turnleft: (emit, block) => {
			const degrees = emit.input(block, 'DEGREES');

			return {
				statements: [
					...degrees.statements,
					ir.statement(
						'target.setDirection(target.direction - ', emit.number(degrees.source), ')'
					)
				]
			};
		},

		motion_pointindirection: (emit, block) => {
			const direction = emit.input(block, 'DIRECTION');

			return {
				statements: [
					...direction.statements,
					ir.statement('target.setDirection(', emit.number(direction.source), ')')
				]
			};
		},

		motion_pointtowards: (emit, block) => {
			const towards = emit.input(block, 'TOWARDS');
			const direction = emit.newVarName('direction');

			return {
				statements: [
					...towards.statements,
					ir.block([
						ir.declaration('const', direction, ir.source([
							directionTowards(emit), '(target, ', towards.source, ')'
						])),
						ir.ifThen(ir.source([direction, ' !== null']), [
							ir.statement('target.setDirection(', direction, ')')
						])
					])
				]
			};
		},

		motion_ifonedgebounce: emit => ({
			statements: [ir.statement(bounce(emit), '(target)')]
		}),

		motion_setrotationstyle: (emit, block) => ({
			statements: [ir.statement('target.setRotationStyle(', emit.field(block, 'STYLE'), ')')]
		}),

		motion_changexby: (emit, block) => {
			const dx = emit.input(block, 'DX');

			return {
				statements: [
					...dx.statements,
					ir.statement(
						'target.setXY(target.x + ', emit.number(dx.source), ', target.y)'
					)
				]
			};
		},

		motion_setx: (emit, block) => {
			const x = emit.input(block, 'X');

			return {
				statements: [
					...x.statements,
					ir.statement('target.setXY(', emit.number(x.source), ', target.y)')
				]
			};
		},

		motion_changeyby: (emit, block) => {
			const dy = emit.input(block, 'DY');

			return {
				statements: [
					...dy.statements,
					ir.statement(
						'target.setXY(target.x, target.y + ', emit.number(dy.source), ')'
					)
				]
			};
		},

		motion_sety: (emit, block) => {
			const y = emit.input(block, 'Y');

			return {
				statements: [
					...y.statements,
					ir.statement('target.setXY(target.x, ', emit.number(y.source), ')')
				]
			};
		},

		motion_scroll_right: () => ({statements: []}),
		motion_scroll_up: () => ({statements: []}),
		motion_align_scene: () => ({statements: []}),
		motion_xscroll: () => ({statements: []}),
		motion_yscroll: () => ({statements: []})
	}
};
