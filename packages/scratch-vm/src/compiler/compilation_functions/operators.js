/**
 * Compilation functions for the operator blocks.
 *
 * These mirror the primitives in `scratch3_operators.js` as inline expressions,
 * which avoids building an arguments object and calling out to a primitive for
 * the reporters scripts use most. The remaining operators are compiled through
 * their primitives.
 */

/**
 * Build an expression emitter from a function of the block's inputs.
 * @param {Array.<string>} names Names of the inputs to evaluate.
 * @param {function(object.<string, string>): string} build Expression builder.
 * @returns {Function} Compilation function.
 */
const expression = (names, build) => (emit, block) => {
	const inputs = emit.inputs(block, names);

	return {lines: inputs.lines, source: build(inputs.sources)};
};

/**
 * Build an expression emitter that needs local variables.
 * @param {Array.<string>} names Names of the inputs to evaluate.
 * @param {function(object.<string, string>, Function): string} build Expression builder.
 * @returns {Function} Compilation function.
 */
const expressionWithLocals = (names, build) => (emit, block) => {
	const inputs = emit.inputs(block, names);

	return {lines: inputs.lines, source: build(inputs.sources, hint => emit.newVarName(hint))};
};

/**
 * Declare the helper that evaluates the math operators.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const mathop = emit => emit.helper('operator:mathop', 'mathop', `(operator, n) => {
	switch (Cast.toString(operator).toLowerCase()) {
	case 'abs': return Math.abs(n);
	case 'floor': return Math.floor(n);
	case 'ceiling': return Math.ceil(n);
	case 'sqrt': return Math.sqrt(n);
	case 'sin': return parseFloat(Math.sin((Math.PI * n) / 180).toFixed(10));
	case 'cos': return parseFloat(Math.cos((Math.PI * n) / 180).toFixed(10));
	case 'tan': return MathUtil.tan(n);
	case 'asin': return (Math.asin(n) * 180) / Math.PI;
	case 'acos': return (Math.acos(n) * 180) / Math.PI;
	case 'atan': return (Math.atan(n) * 180) / Math.PI;
	case 'ln': return Math.log(n);
	case 'log': return Math.log(n) / Math.LN10;
	case 'e ^': return Math.exp(n);
	case '10 ^': return Math.pow(10, n);
	}
	return 0;
}`);

module.exports = {
	expressions: {
		operator_add: expression(['NUM1', 'NUM2'], s =>
			`(Cast.toNumber(${s.NUM1}) + Cast.toNumber(${s.NUM2}))`),

		operator_and: expression(['OPERAND1', 'OPERAND2'], s =>
			`(Cast.toBoolean(${s.OPERAND1}) && Cast.toBoolean(${s.OPERAND2}))`),

		operator_contains: expression(['STRING1', 'STRING2'], s =>
			`(Cast.toString(${s.STRING1}).toLowerCase().includes(Cast.toString(${s.STRING2}).toLowerCase()))`),

		operator_divide: expression(['NUM1', 'NUM2'], s =>
			`(Cast.toNumber(${s.NUM1}) / Cast.toNumber(${s.NUM2}))`),

		operator_equals: expression(['OPERAND1', 'OPERAND2'], s =>
			`(Cast.compare(${s.OPERAND1}, ${s.OPERAND2}) === 0)`),

		operator_gt: expression(['OPERAND1', 'OPERAND2'], s =>
			`(Cast.compare(${s.OPERAND1}, ${s.OPERAND2}) > 0)`),

		operator_join: expression(['STRING1', 'STRING2'], s =>
			`(Cast.toString(${s.STRING1}) + Cast.toString(${s.STRING2}))`),

		operator_length: expression(['STRING'], s => `Cast.toString(${s.STRING}).length`),

		operator_letter_of: expressionWithLocals(['STRING', 'LETTER'], (s, name) => {
			const index = name('letter');
			const string = name('string');

			return `(() => {` +
				` const ${index} = Cast.toNumber(${s.LETTER}) - 1;` +
				` const ${string} = Cast.toString(${s.STRING});` +
				` return ${index} < 0 || ${index} >= ${string}.length ? '' : ${string}.charAt(${index});` +
				` })()`;
		}),

		operator_lt: expression(['OPERAND1', 'OPERAND2'], s =>
			`(Cast.compare(${s.OPERAND1}, ${s.OPERAND2}) < 0)`),

		operator_mod: expressionWithLocals(['NUM1', 'NUM2'], (s, name) => {
			const left = name('number');
			const modulus = name('modulus');
			const result = name('result');

			return `(() => {` +
				` const ${left} = Cast.toNumber(${s.NUM1});` +
				` const ${modulus} = Cast.toNumber(${s.NUM2});` +
				` let ${result} = ${left} % ${modulus};` +
				` if (${result} / ${modulus} < 0) ${result} += ${modulus};` +
				` return ${result};` +
				` })()`;
		}),

		operator_multiply: expression(['NUM1', 'NUM2'], s =>
			`(Cast.toNumber(${s.NUM1}) * Cast.toNumber(${s.NUM2}))`),

		operator_not: expression(['OPERAND'], s => `(!Cast.toBoolean(${s.OPERAND}))`),

		operator_or: expression(['OPERAND1', 'OPERAND2'], s =>
			`(Cast.toBoolean(${s.OPERAND1}) || Cast.toBoolean(${s.OPERAND2}))`),

		operator_round: expression(['NUM'], s => `Math.round(Cast.toNumber(${s.NUM}))`),

		operator_random: (emit, block) => {
			const from = emit.input(block, 'FROM');
			const to = emit.input(block, 'TO');
			const rawFrom = emit.newVarName('from');
			const rawTo = emit.newVarName('to');
			const low = emit.newVarName('low');
			const high = emit.newVarName('high');

			return {
				lines: [
					...from.lines,
					...to.lines,
					`const ${rawFrom} = ${from.source};`,
					`const ${rawTo} = ${to.source};`,
					`const ${low} = Math.min(Cast.toNumber(${rawFrom}), Cast.toNumber(${rawTo}));`,
					`const ${high} = Math.max(Cast.toNumber(${rawFrom}), Cast.toNumber(${rawTo}));`
				],
				source: `(${low} === ${high} ? ${low} : ` +
					`(Cast.isInt(${rawFrom}) && Cast.isInt(${rawTo}) ? ` +
					`${low} + Math.floor(Math.random() * ((${high} + 1) - ${low})) : ` +
					`(Math.random() * (${high} - ${low})) + ${low}))`
			};
		},

		operator_mathop: (emit, block) => {
			const num = emit.input(block, 'NUM');

			return {
				lines: num.lines,
				source: `${mathop(emit)}(${emit.field(block, 'OPERATOR')}, Cast.toNumber(${num.source}))`
			};
		},

		operator_subtract: expression(['NUM1', 'NUM2'], s =>
			`(Cast.toNumber(${s.NUM1}) - Cast.toNumber(${s.NUM2}))`)
	},
	statements: {}
};
