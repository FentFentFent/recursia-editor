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
 * @param {object} block The glide block.
 * @param {{lines: Array.<string>, source: string}} seconds Glide duration.
 * @param {{lines: Array.<string>, source: string}} x End x position.
 * @param {{lines: Array.<string>, source: string}} y End y position.
 * @returns {{lines: Array.<string>}} Block source.
 */
const emitGlide = (emit, block, seconds, x, y) => ({
	lines: [
		...seconds.lines,
		...x.lines,
		...y.lines,
		`yield* ${glide(emit)}(
			target,
			Cast.toNumber(${seconds.source}),
			Cast.toNumber(${x.source}),
			Cast.toNumber(${y.source})
		);`.replace(/\n\t*/g, ' ')
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
		motion_xposition: emit => ({lines: [], source: `${limitPrecision(emit)}(target.x)`}),

		motion_yposition: emit => ({lines: [], source: `${limitPrecision(emit)}(target.y)`}),

		motion_direction: () => ({lines: [], source: 'target.direction'})
	},
	statements: {
		motion_movesteps: (emit, block) => {
			const steps = emit.input(block, 'STEPS');
			const radians = emit.newVarName('radians');
			const dx = emit.newVarName('dx');
			const dy = emit.newVarName('dy');

			return {
				lines: [
					...steps.lines,
					'{',
					`\tconst ${radians} = MathUtil.degToRad(90 - target.direction);`,
					`\tconst ${dx} = Cast.toNumber(${steps.source}) * Math.cos(${radians});`,
					`\tconst ${dy} = Cast.toNumber(${steps.source}) * Math.sin(${radians});`,
					`\ttarget.setXY(target.x + ${dx}, target.y + ${dy});`,
					'}'
				]
			};
		},

		motion_gotoxy: (emit, block) => {
			const inputs = emit.inputs(block, ['X', 'Y']);

			return {
				lines: [
					...inputs.lines,
					`target.setXY(Cast.toNumber(${inputs.sources.X}), Cast.toNumber(${inputs.sources.Y}));`
				]
			};
		},

		motion_goto: (emit, block) => {
			const to = emit.input(block, 'TO');
			const position = emit.newVarName('position');

			return {
				lines: [
					...to.lines,
					'{',
					`\tconst ${position} = ${targetXY(emit)}(${to.source});`,
					`\tif (${position}) target.setXY(${position}[0], ${position}[1]);`,
					'}'
				]
			};
		},

		motion_glidesecstoxy: (emit, block) => emitGlide(
			emit,
			block,
			emit.input(block, 'SECS'),
			emit.input(block, 'X'),
			emit.input(block, 'Y')
		),

		motion_glideto: (emit, block) => {
			const secs = emit.input(block, 'SECS');
			const to = emit.input(block, 'TO');
			const position = emit.newVarName('position');

			return {
				lines: [
					...secs.lines,
					...to.lines,
					'{',
					`\tconst ${position} = ${targetXY(emit)}(${to.source});`,
					`\tif (${position}) {`,
					`\t\tyield* ${glide(emit)}(target, Cast.toNumber(${secs.source}), ${position}[0], ${position}[1]);`,
					`\t}`,
					'}'
				]
			};
		},

		motion_turnright: (emit, block) => {
			const degrees = emit.input(block, 'DEGREES');

			return {
				lines: [...degrees.lines, `target.setDirection(target.direction + Cast.toNumber(${degrees.source}));`]
			};
		},

		motion_turnleft: (emit, block) => {
			const degrees = emit.input(block, 'DEGREES');

			return {
				lines: [...degrees.lines, `target.setDirection(target.direction - Cast.toNumber(${degrees.source}));`]
			};
		},

		motion_pointindirection: (emit, block) => {
			const direction = emit.input(block, 'DIRECTION');

			return {
				lines: [...direction.lines, `target.setDirection(Cast.toNumber(${direction.source}));`]
			};
		},

		motion_pointtowards: (emit, block) => {
			const towards = emit.input(block, 'TOWARDS');
			const direction = emit.newVarName('direction');

			return {
				lines: [
					...towards.lines,
					'{',
					`\tconst ${direction} = ${directionTowards(emit)}(target, ${towards.source});`,
					`\tif (${direction} !== null) target.setDirection(${direction});`,
					'}'
				]
			};
		},

		motion_ifonedgebounce: emit => ({
			lines: [`${bounce(emit)}(target);`]
		}),

		motion_setrotationstyle: (emit, block) => ({
			lines: [`target.setRotationStyle(${emit.field(block, 'STYLE')});`]
		}),

		motion_changexby: (emit, block) => {
			const dx = emit.input(block, 'DX');

			return {lines: [...dx.lines, `target.setXY(target.x + Cast.toNumber(${dx.source}), target.y);`]};
		},

		motion_setx: (emit, block) => {
			const x = emit.input(block, 'X');

			return {lines: [...x.lines, `target.setXY(Cast.toNumber(${x.source}), target.y);`]};
		},

		motion_changeyby: (emit, block) => {
			const dy = emit.input(block, 'DY');

			return {lines: [...dy.lines, `target.setXY(target.x, target.y + Cast.toNumber(${dy.source}));`]};
		},

		motion_sety: (emit, block) => {
			const y = emit.input(block, 'Y');

			return {lines: [...y.lines, `target.setXY(target.x, Cast.toNumber(${y.source}));`]};
		},

		motion_scroll_right: () => ({lines: []}),
		motion_scroll_up: () => ({lines: []}),
		motion_align_scene: () => ({lines: []}),
		motion_xscroll: () => ({lines: []}),
		motion_yscroll: () => ({lines: []})
	}
};
