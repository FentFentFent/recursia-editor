const {block} = require('../../ir/index');

/**
 * Remove statements a script can never run.
 *
 * A statement after a `return` in the same block never runs, so it is dropped.
 * Conditionals whose test is a literal keep only the branch that runs, which
 * also exposes the statements after them to the same rule.
 */

/**
 * Whether a statement always ends the script.
 * @param {object} statement Statement to check.
 * @returns {boolean} True if the script cannot continue after it.
 */
const alwaysReturns = statement => {
	switch (statement.type) {
	case 'return':
		return true;
	case 'block':
		return statement.body.some(alwaysReturns);
	case 'if':
		return statement.alternate.length > 0 &&
			statement.consequent.some(alwaysReturns) &&
			statement.alternate.some(alwaysReturns);
	case 'statement':
	case 'line': {
		const first = statement.parts.find(part => typeof part === 'string');

		return typeof first === 'string' && first.trim().startsWith('return');
	}
	default:
		return false;
	}
};

/**
 * Optimize one statement.
 * @param {object} statement Statement to optimize.
 * @returns {?(object|Array.<object>)} Optimized statement, statements, or null.
 */
const optimizeStatement = statement => {
	switch (statement.type) {
	case 'block': {
		const body = optimizeStatements(statement.body);

		return body.length > 0 ? block(body) : null;
	}
	case 'if': {
		const test = statement.test;

		if (test && test.type === 'literal') {
			const taken = test.value ? statement.consequent : statement.alternate;

			return taken.length > 0 ? block(optimizeStatements(taken)) : null;
		}

		return {
			...statement,
			consequent: optimizeStatements(statement.consequent),
			alternate: optimizeStatements(statement.alternate)
		};
	}
	case 'while':
		return {...statement, body: optimizeStatements(statement.body)};
	case 'for':
		return {...statement, body: optimizeStatements(statement.body)};
	default:
		return statement;
	}
};

/**
 * Optimize a block of statements.
 * @param {Array.<object>} statements Statements to optimize.
 * @returns {Array.<object>} Optimized statements.
 */
const optimizeStatements = statements => {
	const optimized = [];

	for (const statement of statements) {
		const result = optimizeStatement(statement);

		if (Array.isArray(result)) {
			optimized.push(...result);
		} else if (result) {
			optimized.push(result);
		}

		if (alwaysReturns(statement)) break;
	}

	return optimized;
};

/**
 * Run the stage.
 * @param {Array.<object>} statements Script body.
 * @returns {Array.<object>} Optimized statements.
 */
const optimize = statements => optimizeStatements(statements);

module.exports = {optimize};
