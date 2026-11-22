const {literal, source} = require('../../ir/index');

/**
 * Replace reads of a variable whose value cannot change with that value.
 *
 * The project-wide analysis in the compiler decides which variables are
 * constant and gives the stage their values. A variable is written by a block
 * in any target, shown in a monitor, or cloud-backed, it is left alone.
 */

/**
 * Rewrite a source fragment or expression.
 * @param {object} expression Expression to rewrite.
 * @param {Map.<string, {value: *}>} constants Constant values by variable id.
 * @returns {object} Rewritten expression.
 */
const rewriteExpression = (expression, constants) => {
	if (!expression || typeof expression === 'string') return expression;

	switch (expression.type) {
	case 'variableValue': {
		const constant = constants.get(expression.id);

		return constant ? literal(constant.value) : expression;
	}
	case 'source':
		return source(expression.parts.map(part => rewriteExpression(part, constants)));
	default:
		return expression;
	}
};

/**
 * Rewrite a statement and the statements it contains.
 * @param {object} statement Statement to rewrite.
 * @param {Map.<string, {value: *}>} constants Constant values by variable id.
 * @returns {object} Rewritten statement.
 */
const rewriteStatement = (statement, constants) => {
	switch (statement.type) {
	case 'statement':
	case 'line':
		return {...statement, parts: statement.parts.map(part => rewriteExpression(part, constants))};
	case 'declaration':
		return {...statement, init: rewriteExpression(statement.init, constants)};
	case 'assignment':
		return {
			...statement,
			target: rewriteExpression(statement.target, constants),
			value: rewriteExpression(statement.value, constants)
		};
	case 'expression':
		return {...statement, expression: rewriteExpression(statement.expression, constants)};
	case 'block':
		return {...statement, body: rewriteStatements(statement.body, constants)};
	case 'if':
		return {
			...statement,
			test: rewriteExpression(statement.test, constants),
			consequent: rewriteStatements(statement.consequent, constants),
			alternate: rewriteStatements(statement.alternate, constants)
		};
	case 'while':
		return {
			...statement,
			test: rewriteExpression(statement.test, constants),
			body: rewriteStatements(statement.body, constants)
		};
	case 'for':
		return {
			...statement,
			test: rewriteExpression(statement.test, constants),
			body: rewriteStatements(statement.body, constants)
		};
	case 'return':
		return statement.argument
			? {...statement, argument: rewriteExpression(statement.argument, constants)}
			: statement;
	case 'yield':
		return {...statement, argument: rewriteExpression(statement.argument, constants)};
	default:
		return statement;
	}
};

/**
 * Rewrite a list of statements.
 * @param {Array.<object>} statements Statements to rewrite.
 * @param {Map.<string, {value: *}>} constants Constant values by variable id.
 * @returns {Array.<object>} Rewritten statements.
 */
const rewriteStatements = (statements, constants) => statements.map(
	statement => rewriteStatement(statement, constants)
);

/**
 * Run the stage.
 * @param {Array.<object>} statements Script body.
 * @param {object} context Optimization context.
 * @param {Map.<string, {value: *}>} context.constants Constant values by variable id.
 * @returns {Array.<object>} Optimized statements.
 */
const optimize = (statements, {constants}) => {
	if (!constants || constants.size === 0) return statements;

	return rewriteStatements(statements, constants);
};

module.exports = {optimize};
