const Cast = require('../../../util/cast');
const ir = require('../../ir/index');

/**
 * Types a value can have at runtime.
 *
 * `NUMBER` is a JavaScript number, which may be `NaN`; `STRING` is a string,
 * which may still look like a number to Scratch; `BOOLEAN` is a boolean.
 * Anything the analysis is unsure about is `ANY`.
 * @type {object.<string, string>}
 */
const Types = Object.freeze({
	ANY: 'any',
	BOOLEAN: 'boolean',
	NUMBER: 'number',
	STRING: 'string'
});

/**
 * Type of the value an expression produces.
 * @param {object} expression Expression to inspect.
 * @param {Map.<string, {type: string, constant: ?{value: *}}>} state Known variables.
 * @returns {string} Type of the value.
 */
const typeOf = (expression, state) => {
	if (!expression || typeof expression === 'string') return Types.ANY;

	switch (expression.type) {
	case 'number':
		return Types.NUMBER;
	case 'literal':
		if (typeof expression.value === 'number') return Types.NUMBER;
		if (typeof expression.value === 'boolean') return Types.BOOLEAN;
		return Types.STRING;
	case 'variableValue': {
		const known = state.get(expression.id);

		return known ? known.type : Types.ANY;
	}
	case 'cast':
		return expression.kind;
	case 'binary':
		return Types.NUMBER;
	case 'source':
		if (expression.numeric) return Types.NUMBER;
		if (expression.boolean) return Types.BOOLEAN;
		if (expression.string) return Types.STRING;
		return Types.ANY;
	default:
		return Types.ANY;
	}
};

/**
 * Value of an arithmetic node whose operands are both known.
 * @param {string} operator JavaScript operator.
 * @param {number} left Left operand.
 * @param {number} right Right operand.
 * @returns {number} Result of the operation.
 */
const computeBinary = (operator, left, right) => {
	switch (operator) {
	case '+': return left + right;
	case '-': return left - right;
	case '*': return left * right;
	case '/': return left / right;
	default: return NaN;
	}
};

/**
 * Value an expression is known to hold, or null.
 * @param {object} expression Expression to inspect.
 * @param {Map.<string, {type: string, constant: ?{value: *}}>} state Known variables.
 * @returns {?{value: *}} The value, if it is known now.
 */
const constantOf = (expression, state) => {
	if (!expression) return null;
	if (expression.type === 'number') return {value: expression.value};
	if (expression.type === 'literal') return {value: expression.value};
	if (expression.type === 'variableValue') {
		const known = state.get(expression.id);

		return known ? known.constant : null;
	}
	if (expression.type === 'binary') {
		const left = constantOf(expression.left, state);
		const right = constantOf(expression.right, state);

		if (left && right) return {value: computeBinary(expression.operator, left.value, right.value)};
	}
	if (expression.type === 'cast') {
		const inner = constantOf(expression.expression, state);

		if (inner) {
			if (expression.kind === 'number') return {value: Cast.toNumber(inner.value)};
			if (expression.kind === 'boolean') return {value: Cast.toBoolean(inner.value)};
			if (expression.kind === 'string') return {value: Cast.toString(inner.value)};
		}
	}

	return null;
};

/**
 * Expression holding a constant value.
 * @param {*} value Value to hold.
 * @returns {object} Expression node.
 */
const literalOf = value => (typeof value === 'number' ? ir.number(value) : ir.literal(value));

/**
 * Copy of a variable state.
 * @param {Map} state State to copy.
 * @returns {Map} The copy.
 */
const cloneState = state => new Map([...state].map(([id, known]) => [id, {...known}]));

/**
 * Merge what two paths know about a variable.
 * @param {?{type: string, constant: ?{value: *}}} left Knowledge from one path.
 * @param {?{type: string, constant: ?{value: *}}} right Knowledge from the other.
 * @returns {?{type: string, constant: ?{value: *}}} What both paths agree on.
 */
const mergeEntry = (left, right) => {
	// Knowledge has to hold on both paths: a value one path does not know can
	// be anything the other path never saw.
	if (!left || !right) return null;

	const sameConstant = left.constant && right.constant && Object.is(left.constant.value, right.constant.value);

	return {
		type: left.type === right.type ? left.type : Types.ANY,
		constant: sameConstant ? left.constant : null
	};
};

/**
 * Merge the knowledge of two paths.
 * @param {Map} left State of one path.
 * @param {Map} right State of the other.
 * @returns {Map} What both paths agree on.
 */
const mergeStates = (left, right) => {
	const merged = new Map();

	for (const id of new Set([...left.keys(), ...right.keys()])) {
		const entry = mergeEntry(left.get(id), right.get(id));

		if (entry) merged.set(id, entry);
	}

	return merged;
};

/**
 * Whether two states know the same things.
 * @param {Map} left First state.
 * @param {Map} right Second state.
 * @returns {boolean} True if the states are equal.
 */
const sameState = (left, right) => {
	if (left.size !== right.size) return false;

	for (const [id, known] of left) {
		const other = right.get(id);

		if (!other || other.type !== known.type) return false;
		if (Boolean(other.constant) !== Boolean(known.constant)) return false;
		if (known.constant && !Object.is(other.constant.value, known.constant.value)) return false;
	}

	return true;
};

/**
 * Rewrite an expression with what the analysis knows, removing conversions the
 * value does not need.
 * @param {object} expression Expression to rewrite.
 * @param {Map} state Known variables.
 * @returns {object} Rewritten expression.
 */
const rewriteExpression = (expression, state) => {
	if (!expression || typeof expression === 'string') return expression;

	switch (expression.type) {
	case 'cast': {
		const inner = rewriteExpression(expression.expression, state);
		const constant = constantOf(inner, state);

		if (constant) {
			if (expression.kind === 'number') return ir.number(Cast.toNumber(constant.value));
			if (expression.kind === 'boolean') return ir.literal(Cast.toBoolean(constant.value));
			if (expression.kind === 'string') return ir.literal(Cast.toString(constant.value));
		}

		const type = typeOf(inner, state);

		if (inner.type === 'cast' && inner.kind === expression.kind) return inner;
		if (expression.kind === 'boolean' && type === Types.BOOLEAN) return inner;
		if (expression.kind === 'string' && type === Types.STRING) return inner;

		expression.expression = inner;
		return expression;
	}
	case 'binary': {
		const left = rewriteExpression(expression.left, state);
		const right = rewriteExpression(expression.right, state);
		const leftValue = constantOf(left, state);
		const rightValue = constantOf(right, state);

		if (leftValue && rightValue) {
			return ir.number(computeBinary(expression.operator, leftValue.value, rightValue.value));
		}

		expression.left = left;
		expression.right = right;
		return expression;
	}
	case 'source': {
		const parts = expression.parts;

		for (let i = 0; i < parts.length; i++) parts[i] = rewriteExpression(parts[i], state);

		return expression;
	}
	case 'variableValue': {
		const constant = constantOf(expression, state);

		return constant ? literalOf(constant.value) : expression;
	}
	default:
		return expression;
	}
};

/**
 * Rewrite the parts of a statement.
 * @param {object} statement Statement to rewrite.
 * @param {Map} state Known variables.
 * @returns {object} Rewritten statement.
 */
const rewriteParts = (statement, state) => {
	const parts = statement.parts;

	for (let i = 0; i < parts.length; i++) parts[i] = rewriteExpression(parts[i], state);

	return statement;
};

/**
 * Rewrite a list of statements, tracking what each one knows. The returned
 * state is what the statements leave behind.
 * @param {Array.<object>} statements Statements to rewrite.
 * @param {Map} state Known variables before the first statement.
 * @param {boolean} [rewrite] Whether to rewrite the statements, or only track knowledge.
 * @returns {{statements: Array.<object>, state: Map}} Rewritten statements and knowledge after them.
 */
const analyzeStatements = (statements, state, rewrite = true) => {
	let current = state;

	if (!rewrite) {
		for (const statement of statements) {
			current = analyzeStatement(statement, current, false).state;
		}

		return {statements, state: current};
	}

	for (let i = 0; i < statements.length; i++) {
		const result = analyzeStatement(statements[i], current, true);

		statements[i] = result.statement;
		current = result.state;
	}

	return {statements, state: current};
};

/**
 * Rewrite one statement and apply what it changes to the variable state.
 * @param {object} statement Statement to rewrite.
 * @param {Map} state Known variables.
 * @param {boolean} [rewrite] Whether to rewrite the statement, or only track knowledge.
 * @returns {{statement: object, state: Map}} Rewritten statement and knowledge after it.
 */
const analyzeStatement = (statement, state, rewrite = true) => {
	switch (statement.type) {
	case 'statement':
	case 'line': {
		const rewritten = rewrite ? rewriteParts(statement, state) : statement;

		return {
			statement: rewritten,
			state: statement.clearsTypes ? new Map() : state
		};
	}
	case 'declaration':
		if (rewrite) statement.init = rewriteExpression(statement.init, state);

		return {
			statement,
			state: statement.clearsTypes ? new Map() : state
		};
	case 'assignment': {
		if (rewrite) {
			statement.target = rewriteExpression(statement.target, state);
			statement.value = rewriteExpression(statement.value, state);
		}

		const value = statement.value;

		if (!statement.variable) return {statement, state};

		const next = cloneState(state);
		const constant = constantOf(value, state);

		next.set(statement.variable, {
			type: typeOf(value, state),
			constant
		});

		return {statement, state: next};
	}
	case 'block': {
		const result = analyzeStatements(statement.body, state, rewrite);

		if (rewrite) statement.body = result.statements;

		return {statement, state: result.state};
	}
	case 'if': {
		const consequent = analyzeStatements(statement.consequent, cloneState(state), rewrite);
		const alternate = analyzeStatements(statement.alternate, cloneState(state), rewrite);

		if (rewrite) {
			statement.test = rewriteExpression(statement.test, state);
			statement.consequent = consequent.statements;
			statement.alternate = alternate.statements;
		}

		return {
			statement,
			state: mergeStates(state, mergeStates(consequent.state, alternate.state))
		};
	}
	case 'while': {
		const entry = loopEntryState(statement.body, state);
		const body = analyzeStatements(statement.body, cloneState(entry), rewrite);

		if (rewrite) {
			statement.test = rewriteExpression(statement.test, state);
			statement.body = body.statements;
		}

		return {
			statement,
			state: mergeStates(state, body.state)
		};
	}
	case 'for': {
		const entry = loopEntryState(statement.body, state);
		const body = analyzeStatements(statement.body, cloneState(entry), rewrite);

		if (rewrite) {
			statement.test = rewriteExpression(statement.test, state);
			statement.body = body.statements;
		}

		return {
			statement,
			state: mergeStates(state, body.state)
		};
	}
	case 'return':
		if (rewrite && statement.argument) statement.argument = rewriteExpression(statement.argument, state);

		return {statement, state: new Map()};
	case 'yield':
		if (rewrite) statement.argument = rewriteExpression(statement.argument, state);

		return {
			statement,
			// Another script can change any variable while this one is paused.
			state: new Map()
		};
	default:
		return {statement, state};
	}
};

/**
 * State a loop body starts from, including what its own earlier iterations
 * know. Iterates until the knowledge stops growing.
 * @param {Array.<object>} body Statements of the loop.
 * @param {Map} state Knowledge before the loop.
 * @returns {Map} Knowledge at the start of the body.
 */
const loopEntryState = (body, state) => {
	let entry = cloneState(state);

	for (let iteration = 0; iteration < 4; iteration++) {
		const result = analyzeStatements(body, cloneState(entry), false);
		const merged = mergeStates(entry, result.state);

		if (sameState(merged, entry)) break;

		entry = merged;
	}

	return entry;
};

/**
 * Run the stage.
 * @param {Array.<object>} statements Script body.
 * @returns {Array.<object>} Optimized statements.
 */
const optimize = statements => analyzeStatements(statements, new Map()).statements;

module.exports = {optimize};
