/**
 * Compilation functions for the looks blocks.
 *
 * Say/think compile to the runtime event the block implementation emits. The
 * blocks that own a bubble or start hats keep state on the looks block package,
 * so they are compiled by calling their implementation instead.
 */

/**
 * Declare the helper that switches a target's costume.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const setCostume = emit => emit.helper('looks:setCostume', 'setCostume', `(target, requested, zeroIndex) => {
	if (typeof requested === 'number') {
		target.setCostume(zeroIndex ? requested : requested - 1);
		return;
	}
	const index = target.getCostumeIndexByName(requested.toString());
	if (index !== -1) {
		target.setCostume(index);
	} else if (requested === 'next costume') {
		target.setCostume(target.currentCostume + 1);
	} else if (requested === 'previous costume') {
		target.setCostume(target.currentCostume - 1);
	} else if (!(isNaN(requested) || Cast.isWhiteSpace(requested))) {
		target.setCostume(zeroIndex ? Number(requested) : Number(requested) - 1);
	}
}`);

/**
 * Declare the helper that switches the stage's backdrop and starts the hats.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const setBackdrop = emit => emit.helper('looks:setBackdrop', 'setBackdrop', `(stage, requested, zeroIndex) => {
	if (typeof requested === 'number') {
		stage.setCostume(zeroIndex ? requested : requested - 1);
	} else {
		const index = stage.getCostumeIndexByName(requested.toString());
		if (index !== -1) {
			stage.setCostume(index);
		} else if (requested === 'next backdrop') {
			stage.setCostume(stage.currentCostume + 1);
		} else if (requested === 'previous backdrop') {
			stage.setCostume(stage.currentCostume - 1);
		} else if (requested === 'random backdrop') {
			const count = stage.getCostumes().length;
			if (count > 1) {
				stage.setCostume(MathUtil.inclusiveRandIntWithout(0, count - 1, stage.currentCostume));
			}
		} else if (!(isNaN(requested) || Cast.isWhiteSpace(requested))) {
			stage.setCostume(zeroIndex ? Number(requested) : Number(requested) - 1);
		}
	}

	const name = stage.getCostumes()[stage.currentCostume].name;
	runtime.startHats('event_whenbackdropswitchesto', {BACKDROP: name});
}`);

/**
 * Declare the helper that clamps a graphic effect.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const clampEffect = emit => emit.helper('looks:clampEffect', 'clampEffect', `(effect, value) => {
	if (effect === 'ghost') return MathUtil.clamp(value, 0, 100);
	if (effect === 'brightness') return MathUtil.clamp(value, -100, 100);
	return value;
}`);

/**
 * Emit a change of a graphic effect.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @param {object} block The effect block.
 * @param {{lines: Array.<string>, source: string}} value Amount to change by.
 * @returns {{lines: Array.<string>}} Block source.
 */
const changeEffect = (emit, block, value) => {
	const effect = emit.newVarName('effect');
	const amount = emit.newVarName('value');

	return {
		lines: [
			...value.lines,
			'{',
			`\tconst ${effect} = Cast.toString(${emit.field(block, 'EFFECT')}).toLowerCase();`,
			`\tif (Object.prototype.hasOwnProperty.call(target.effects, ${effect})) {`,
			`\t\tconst ${amount} = ${clampEffect(emit)}(${effect}, Cast.toNumber(${value.source}) + target.effects[${effect}]);`,
			`\t\ttarget.setEffect(${effect}, ${amount});`,
			`\t}`,
			'}'
		]
	};
};

/**
 * Emit a change of the target's size.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @param {{lines: Array.<string>, source: string}} size Size to set.
 * @returns {{lines: Array.<string>}} Block source.
 */
const setSize = (emit, size) => ({
	lines: [...size.lines, `target.setSize(Cast.toNumber(${size.source}));`]
});

module.exports = {
	expressions: {
		looks_size: () => ({lines: [], source: 'Math.round(target.size)'}),

		looks_costumenumbername: (emit, block) => {
			const name = emit.field(block, 'NUMBER_NAME');
			const current = emit.newVarName('costume');

			return {
				lines: [`const ${current} = target.currentCostume;`],
				source: `(${name} === 'number' ? ${current} + 1 : target.getCostumes()[${current}].name)`
			};
		},

		looks_backdropnumbername: (emit, block) => {
			const name = emit.field(block, 'NUMBER_NAME');
			const stage = emit.newVarName('stage');
			const current = emit.newVarName('backdrop');

			return {
				lines: [
					`const ${stage} = runtime.getTargetForStage();`,
					`const ${current} = ${stage}.currentCostume;`
				],
				source: `(${name} === 'number' ? ${current} + 1 : ${stage}.getCostumes()[${current}].name)`
			};
		}
	},
	statements: {
		looks_say: (emit, block) => {
			const message = emit.input(block, 'MESSAGE');

			return {lines: [...message.lines, `runtime.emit('SAY', target, 'say', ${message.source});`]};
		},

		looks_think: (emit, block) => {
			const message = emit.input(block, 'MESSAGE');

			return {lines: [...message.lines, `runtime.emit('SAY', target, 'think', ${message.source});`]};
		},

		looks_switchcostumeto: (emit, block) => {
			const costume = emit.input(block, 'COSTUME');

			return {
				lines: [...costume.lines, `${setCostume(emit)}(target, ${costume.source}, false);`]
			};
		},

		looks_nextcostume: emit => ({
			lines: [`${setCostume(emit)}(target, target.currentCostume + 1, true);`]
		}),

		looks_switchbackdropto: (emit, block) => {
			const backdrop = emit.input(block, 'BACKDROP');

			return {
				lines: [
					...backdrop.lines,
					`${setBackdrop(emit)}(runtime.getTargetForStage(), ${backdrop.source}, false);`
				]
			};
		},

		looks_nextbackdrop: emit => {
			const stage = emit.newVarName('stage');

			return {
				lines: [
					`const ${stage} = runtime.getTargetForStage();`,
					`${setBackdrop(emit)}(${stage}, ${stage}.currentCostume + 1, true);`
				]
			};
		},

		looks_changeeffectby: (emit, block) => changeEffect(emit, block, emit.input(block, 'CHANGE')),

		looks_seteffectto: (emit, block) => {
			const effect = emit.newVarName('effect');
			const value = emit.input(block, 'VALUE');
			const amount = emit.newVarName('value');

			return {
				lines: [
					...value.lines,
					'{',
					`\tconst ${effect} = Cast.toString(${emit.field(block, 'EFFECT')}).toLowerCase();`,
					`\tconst ${amount} = ${clampEffect(emit)}(${effect}, Cast.toNumber(${value.source}));`,
					`\ttarget.setEffect(${effect}, ${amount});`,
					'}'
				]
			};
		},

		looks_cleargraphiceffects: () => ({lines: ['target.clearEffects();']}),

		looks_changesizeby: (emit, block) => {
			const change = emit.input(block, 'CHANGE');

			return {
				lines: [...change.lines, `target.setSize(target.size + Cast.toNumber(${change.source}));`]
			};
		},

		looks_setsizeto: (emit, block) => setSize(emit, emit.input(block, 'SIZE')),

		looks_gotofrontback: (emit, block) => {
			const option = emit.field(block, 'FRONT_BACK');

			return {
				lines: [
					'if (!target.isStage) {',
					`\tif (${option} === 'front') target.goToFront(); else target.goToBack();`,
					'}'
				]
			};
		},

		looks_goforwardbackwardlayers: (emit, block) => {
			const option = emit.field(block, 'FORWARD_BACKWARD');
			const num = emit.input(block, 'NUM');

			return {
				lines: [
					...num.lines,
					'if (!target.isStage) {',
					`\tif (${option} === 'forward') target.goForwardLayers(Cast.toNumber(${num.source}));`,
					`\telse target.goBackwardLayers(Cast.toNumber(${num.source}));`,
					'}'
				]
			};
		},

		// Hiding a target also has to remove its bubble, which the looks blocks
		// keep on the target, so these two call their implementation.
		looks_show: (emit, block) => emit.emitPrimitiveCall(block, false, {branches: false}),
		looks_hide: (emit, block) => emit.emitPrimitiveCall(block, false, {branches: false}),
		looks_hideallsprites: () => ({lines: []}),
		looks_changestretchby: () => ({lines: []}),
		looks_setstretchto: () => ({lines: []}),
		looks_sayforsecs: (emit, block) => emit.emitPrimitiveCall(block, false, {branches: false}),
		looks_thinkforsecs: (emit, block) => emit.emitPrimitiveCall(block, false, {branches: false}),
		looks_switchbackdroptoandwait: (emit, block) =>
			emit.emitPrimitiveCall(block, false, {branches: false})
	}
};
