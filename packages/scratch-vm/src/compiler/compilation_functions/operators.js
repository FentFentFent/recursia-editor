const Cast = require('../../util/cast');
const ir = require('../ir/index');
const MathUtil = require('../../util/math-util');

/**
 * Compilation functions for the operator blocks.
 *
 * These mirror the primitives in `scratch3_operators.js` as inline expressions,
 * which avoids building an arguments object and calling out to a primitive for
 * the reporters scripts use most. Operations whose inputs are known while the
 * script is compiled are computed there and emitted as their result, and a math
 * operator compiles to the one `Math` call it performs instead of a runtime
 * lookup. The remaining operators are compiled through their primitives.
 */

/**
 * Build an expression emitter from a function of the block's inputs.
 * @param {Array.<string>} names Names of the inputs to evaluate.
 * @param {function(object.<string, object>, ScriptEmitter): object} build Expression builder.
 * @returns {Function} Compilation function.
 */
const expression = (names, build) => (emit, block) => {
	const inputs = emit.inputs(block, names);

	return {statements: inputs.statements, source: build(inputs.sources, emit)};
};

/**
 * Whether an expression is a literal whose value is known now.
 * @param {object} expression Expression to check.
 * @returns {boolean} True for literal expressions.
 */
const isLiteral = expression => Boolean(expression) && expression.type === 'literal';

/**
 * Value of a number the compiler computed, or null when the value is only
 * known at runtime.
 * @param {object} expression Expression to read.
 * @returns {?number} The value, if it is known now.
 */
const numberValue = expression => (expression && expression.type === 'number' ? expression.value : null);

/**
 * Whether a literal can never be read as a number, so Scratch compares it as a
 * string. Whitespace counts as non-numeric, as it does in `Cast.compare`.
 * @param {object} expression Expression to check.
 * @returns {boolean} True if the literal compares as a string.
 */
const nonNumericLiteral = expression => {
	if (!isLiteral(expression) || typeof expression.value === 'undefined') return false;

	return Cast.isWhiteSpace(expression.value) || Number.isNaN(Number(expression.value));
};

/**
 * Source of a value as a lower-case string, the form Scratch compares strings
 * in. A literal is lower-cased now.
 * @param {object} expression Expression to convert.
 * @returns {object} String expression.
 */
const lowerCase = expression => {
	if (isLiteral(expression)) return ir.literal(Cast.toString(expression.value).toLowerCase());

	const result = ir.source(['Cast.toString(', expression, ').toLowerCase()']);
	result.string = true;

	return result;
};

/**
 * Emit one of the arithmetic operators, computing it now when both operands are
 * known. The result is a number, so blocks using it do not cast it again.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @param {object} left Left operand.
 * @param {object} right Right operand.
 * @param {string} operator JavaScript operator.
 * @param {function(number, number): number} compute Compile-time operation.
 * @returns {object} Expression of the result.
 */
const arithmetic = (emit, left, right, operator, compute) => {
	const leftSource = emit.number(left);
	const rightSource = emit.number(right);
	const leftValue = numberValue(leftSource);
	const rightValue = numberValue(rightSource);

	if (leftValue !== null && rightValue !== null) return ir.number(compute(leftValue, rightValue));

	return ir.binary(operator, leftSource, rightSource);
};

/**
 * Declare the helper that evaluates the modulo operator.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const mod = emit => emit.helper('operator:mod', 'mod', `(left, modulus) => {
	let result = left % modulus;
	if (result / modulus < 0) result += modulus;
	return result;
}`);

/**
 * Declare the helper that compares two values the way `Cast.compare` does.
 *
 * Two finite numbers, which is what almost every comparison in a running
 * project compares, differ by their subtraction. Everything else - strings,
 * `NaN`, `Infinity`, and the special cases `Cast.compare` has for them - goes
 * through `Cast.compare` itself.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const compare = emit => emit.helper(
	'operator:compare',
	'compare',
	'(left, right) => (Number.isFinite(left) && Number.isFinite(right) ?' +
	' left - right : Cast.compare(left, right))'
);

/**
 * Declare the helper that evaluates the math operators the block does not
 * recognize.
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

/**
 * Declare the helper that reads a letter of a string.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const letterOf = emit => emit.helper('operator:letterOf', 'letterOf', `(string, letter) => {
	const index = Cast.toNumber(letter) - 1;
	const value = Cast.toString(string);
	return index < 0 || index >= value.length ? '' : value.charAt(index);
}`);

/**
 * Source of a math operator as the `Math` call it performs.
 * @type {object.<string, {source: function(Array.<(string|object)>): Array, compute: function(number): number}>}
 */
const mathOperators = {
	abs: {
		source: n => ['Math.abs(', n, ')'],
		compute: n => Math.abs(n)
	},
	floor: {
		source: n => ['Math.floor(', n, ')'],
		compute: n => Math.floor(n)
	},
	ceiling: {
		source: n => ['Math.ceil(', n, ')'],
		compute: n => Math.ceil(n)
	},
	sqrt: {
		source: n => ['Math.sqrt(', n, ')'],
		compute: n => Math.sqrt(n)
	},
	sin: {
		source: n => ['parseFloat(Math.sin((Math.PI * ', n, ') / 180).toFixed(10))'],
		compute: n => parseFloat(Math.sin((Math.PI * n) / 180).toFixed(10))
	},
	cos: {
		source: n => ['parseFloat(Math.cos((Math.PI * ', n, ') / 180).toFixed(10))'],
		compute: n => parseFloat(Math.cos((Math.PI * n) / 180).toFixed(10))
	},
	tan: {
		source: n => ['MathUtil.tan(', n, ')'],
		compute: n => MathUtil.tan(n)
	},
	asin: {
		source: n => ['((Math.asin(', n, ') * 180) / Math.PI)'],
		compute: n => (Math.asin(n) * 180) / Math.PI
	},
	acos: {
		source: n => ['((Math.acos(', n, ') * 180) / Math.PI)'],
		compute: n => (Math.acos(n) * 180) / Math.PI
	},
	atan: {
		source: n => ['((Math.atan(', n, ') * 180) / Math.PI)'],
		compute: n => (Math.atan(n) * 180) / Math.PI
	},
	ln: {
		source: n => ['Math.log(', n, ')'],
		compute: n => Math.log(n)
	},
	log: {
		source: n => ['(Math.log(', n, ') / Math.LN10)'],
		compute: n => Math.log(n) / Math.LN10
	},
	'e ^': {
		source: n => ['Math.exp(', n, ')'],
		compute: n => Math.exp(n)
	},
	'10 ^': {
		source: n => ['Math.pow(10, ', n, ')'],
		compute: n => Math.pow(10, n)
	}
};

module.exports = {
	expressions: {
		operator_add: expression(['NUM1', 'NUM2'], (s, emit) => arithmetic(emit, s.NUM1, s.NUM2, '+', (a, b) => a + b)),

		operator_and: expression(['OPERAND1', 'OPERAND2'], (s, emit) => {
			const left = s.OPERAND1;
			const right = s.OPERAND2;

			if (isLiteral(left) && isLiteral(right)) {
				return ir.literal(Cast.toBoolean(left.value) && Cast.toBoolean(right.value));
			}

			const result = ir.source(['(', emit.boolean(left), ' && ', emit.boolean(right), ')']);
			result.boolean = true;

			return result;
		}),

		operator_contains: expression(['STRING1', 'STRING2'], s => {
			const string = s.STRING1;
			const contains = s.STRING2;

			if (isLiteral(string) && isLiteral(contains)) {
				return ir.literal(
					Cast.toString(string.value).toLowerCase().includes(Cast.toString(contains.value).toLowerCase())
				);
			}

			const result = ir.source([
				'(Cast.toString(', string, ').toLowerCase().includes(',
				'Cast.toString(', contains, ').toLowerCase()))'
			]);
			result.boolean = true;

			return result;
		}),

		operator_divide: expression(['NUM1', 'NUM2'], (s, emit) =>
			arithmetic(emit, s.NUM1, s.NUM2, '/', (a, b) => a / b)),

		operator_equals: expression(['OPERAND1', 'OPERAND2'], (s, emit) => {
			const left = s.OPERAND1;
			const right = s.OPERAND2;

			if (isLiteral(left) && isLiteral(right)) {
				return ir.literal(Cast.compare(left.value, right.value) === 0);
			}

			if (nonNumericLiteral(left) || nonNumericLiteral(right)) {
				return ir.source([lowerCase(left), ' === ', lowerCase(right)]);
			}

			const result = ir.source(['(', compare(emit), '(', left, ', ', right, ') === 0)']);
			result.boolean = true;

			return result;
		}),

		operator_gt: expression(['OPERAND1', 'OPERAND2'], (s, emit) => {
			const left = s.OPERAND1;
			const right = s.OPERAND2;

			if (isLiteral(left) && isLiteral(right)) {
				return ir.literal(Cast.compare(left.value, right.value) > 0);
			}

			if (nonNumericLiteral(left) || nonNumericLiteral(right)) {
				return ir.source([lowerCase(left), ' > ', lowerCase(right)]);
			}

			const result = ir.source(['(', compare(emit), '(', left, ', ', right, ') > 0)']);
			result.boolean = true;

			return result;
		}),

		operator_join: expression(['STRING1', 'STRING2'], s => {
			const left = s.STRING1;
			const right = s.STRING2;

			if (isLiteral(left) && isLiteral(right)) {
				return ir.literal(Cast.toString(left.value) + Cast.toString(right.value));
			}

			const result = ir.source(['(Cast.toString(', left, ') + Cast.toString(', right, '))']);
			result.string = true;

			return result;
		}),

		operator_length: expression(['STRING'], s => {
			const string = s.STRING;

			if (isLiteral(string)) return ir.number(Cast.toString(string.value).length);

			const result = ir.source(['Cast.toString(', string, ').length']);
			result.numeric = true;

			return result;
		}),

		operator_letter_of: expression(['STRING', 'LETTER'], (s, emit) => {
			const string = s.STRING;
			const letter = s.LETTER;

			if (isLiteral(string) && isLiteral(letter)) {
				const index = Cast.toNumber(letter.value) - 1;
				const value = Cast.toString(string.value);

				return ir.literal(index < 0 || index >= value.length ? '' : value.charAt(index));
			}

			return ir.source([letterOf(emit), '(', string, ', ', letter, ')']);
		}),

		operator_lt: expression(['OPERAND1', 'OPERAND2'], (s, emit) => {
			const left = s.OPERAND1;
			const right = s.OPERAND2;

			if (isLiteral(left) && isLiteral(right)) {
				return ir.literal(Cast.compare(left.value, right.value) < 0);
			}

			if (nonNumericLiteral(left) || nonNumericLiteral(right)) {
				return ir.source([lowerCase(left), ' < ', lowerCase(right)]);
			}

			const result = ir.source(['(', compare(emit), '(', left, ', ', right, ') < 0)']);
			result.boolean = true;

			return result;
		}),

		operator_mod: expression(['NUM1', 'NUM2'], (s, emit) => {
			const left = emit.number(s.NUM1);
			const right = emit.number(s.NUM2);
			const leftValue = numberValue(left);
			const rightValue = numberValue(right);

			if (leftValue !== null && rightValue !== null) {
				let result = leftValue % rightValue;
				if (result / rightValue < 0) result += rightValue;

				return ir.number(result);
			}

			const result = ir.source([mod(emit), '(', left, ', ', right, ')']);
			result.numeric = true;

			return result;
		}),

		operator_multiply: expression(['NUM1', 'NUM2'], (s, emit) =>
			arithmetic(emit, s.NUM1, s.NUM2, '*', (a, b) => a * b)),

		operator_not: expression(['OPERAND'], (s, emit) => {
			const operand = s.OPERAND;

			if (isLiteral(operand)) return ir.literal(!Cast.toBoolean(operand.value));

			const result = ir.source(['(!', emit.boolean(operand), ')']);
			result.boolean = true;

			return result;
		}),

		operator_or: expression(['OPERAND1', 'OPERAND2'], (s, emit) => {
			const left = s.OPERAND1;
			const right = s.OPERAND2;

			if (isLiteral(left) && isLiteral(right)) {
				return ir.literal(Cast.toBoolean(left.value) || Cast.toBoolean(right.value));
			}

			const result = ir.source(['(', emit.boolean(left), ' || ', emit.boolean(right), ')']);
			result.boolean = true;

			return result;
		}),

		operator_round: expression(['NUM'], (s, emit) => {
			const value = emit.number(s.NUM);
			const known = numberValue(value);

			if (known === null) {
				const result = ir.source(['Math.round(', value, ')']);
				result.numeric = true;

				return result;
			}

			return ir.number(Math.round(known));
		}),

		operator_random: (emit, block) => {
			const from = emit.input(block, 'FROM');
			const to = emit.input(block, 'TO');
			const rawFrom = emit.newVarName('from');
			const rawTo = emit.newVarName('to');
			const low = emit.newVarName('low');
			const high = emit.newVarName('high');

			return {
				statements: [
					...from.statements,
					...to.statements,
					ir.declaration('const', rawFrom, from.source),
					ir.declaration('const', rawTo, to.source),
					ir.declaration('const', low, ir.source([
						'Math.min(Cast.toNumber(', rawFrom, '), Cast.toNumber(', rawTo, '))'
					])),
					ir.declaration('const', high, ir.source([
						'Math.max(Cast.toNumber(', rawFrom, '), Cast.toNumber(', rawTo, '))'
					]))
				],
				source: ir.source([
					'(', low, ' === ', high, ' ? ', low, ' : ',
					'(Cast.isInt(', rawFrom, ') && Cast.isInt(', rawTo, ') ? ',
					low, ' + Math.floor(Math.random() * ((', high, ' + 1) - ', low, ')) : ',
					'(Math.random() * (', high, ' - ', low, ')) + ', low, '))'
				])
			};
		},

		operator_mathop: (emit, block) => {
			const num = emit.input(block, 'NUM');
			const operator = ((block.fields || {}).OPERATOR || {}).value;
			const value = emit.number(num.source);
			const known = numberValue(value);
			const math = mathOperators[operator];

			if (math) {
				if (known !== null) return {statements: num.statements, source: ir.number(math.compute(known))};

				const result = ir.source(math.source(value));
				result.numeric = true;

				return {statements: num.statements, source: result};
			}

			return {
				statements: num.statements,
				source: ir.source([mathop(emit), '(', emit.field(block, 'OPERATOR'), ', ', value, ')'])
			};
		},

		operator_subtract: expression(['NUM1', 'NUM2'], (s, emit) =>
			arithmetic(emit, s.NUM1, s.NUM2, '-', (a, b) => a - b))
	},
	statements: {}
};
