/**
 * Transpiler from the compiler's intermediate representation to JavaScript.
 *
 * The generated script is a generator function: statements are indented by the
 * block they are in, and expressions are embedded in the source fragments the
 * front end and the optimization stages produce.
 */

/**
 * Source of a number, including the values JSON cannot write.
 * @param {number} value Number to write.
 * @returns {string} Source of the number.
 */
const numberSource = value => {
	if (Number.isNaN(value)) return 'NaN';
	if (value === Infinity) return 'Infinity';
	if (value === -Infinity) return '-Infinity';
	if (Object.is(value, -0)) return '-0';

	return String(value);
};

/**
 * Source of a JavaScript literal.
 * @param {*} value Value to write.
 * @returns {string} Source of the value.
 */
const quote = value => {
	if (typeof value === 'undefined') return 'undefined';
	if (value === null) return 'null';
	if (typeof value === 'number') return numberSource(value);

	return JSON.stringify(value);
};

/**
 * `Cast` method used for each conversion.
 * @type {object.<string, string>}
 */
const CONVERSIONS = {
	number: 'toNumber',
	boolean: 'toBoolean',
	string: 'toString'
};

/**
 * Render the parts of a source fragment.
 * @param {Array.<(string|object)>} parts Parts of the fragment.
 * @returns {string} Source of the fragment.
 */
const renderParts = parts => parts
	.map(part => (typeof part === 'string' ? part : renderExpression(part)))
	.join('');

/**
 * Render an expression.
 * @param {object} expression Expression node.
 * @returns {string} Source of the expression.
 */
const renderExpression = expression => {
	if (typeof expression === 'string') return expression;

	switch (expression.type) {
	case 'literal':
		return quote(expression.value);
	case 'number':
		return numberSource(expression.value);
	case 'cast':
		return `Cast.${CONVERSIONS[expression.kind]}(${renderExpression(expression.expression)})`;
	case 'binary':
		return `(${renderExpression(expression.left)} ${expression.operator} ${renderExpression(expression.right)})`;
	case 'source':
		return renderParts(expression.parts);
	case 'variable':
		return expression.reference ??
			`target.lookupOrCreateVariable(${quote(expression.id ?? null)}, ${quote(expression.name ?? '')})`;
	case 'variableValue':
		return expression.reference
			? `${expression.reference}.value`
			: `target.lookupOrCreateVariable(${quote(expression.id ?? null)}, ${quote(expression.name ?? '')}).value`;
	default:
		throw new Error(`Unknown IR expression "${expression.type}".`);
	}
};

/**
 * Render a list of statements.
 * @param {Array.<object>} statements Statements to render.
 * @param {number} level Number of tabs to indent the statements with.
 * @returns {Array.<string>} Source lines.
 */
const renderStatements = (statements, level = 0) => {
	const lines = [];

	for (const statement of statements) {
		lines.push(...renderStatement(statement, level));
	}

	return lines;
};

/**
 * Render one statement.
 * @param {object} statement Statement node.
 * @param {number} level Number of tabs to indent the statement with.
 * @returns {Array.<string>} Source lines.
 */
const renderStatement = (statement, level) => {
	const indent = '\t'.repeat(level);

	switch (statement.type) {
	case 'statement':
		return [`${indent}${renderParts(statement.parts)};`];
	case 'line':
		return [`${indent}${renderParts(statement.parts)}`];
	case 'declaration':
		return [typeof statement.init === 'undefined'
			? `${indent}${statement.kind} ${statement.name};`
			: `${indent}${statement.kind} ${statement.name} = ${renderExpression(statement.init)};`];
	case 'assignment':
		return [
			`${indent}${renderExpression(statement.target)} = ${renderExpression(statement.value)};`
		];
	case 'expression':
		return [`${indent}${renderExpression(statement.expression)};`];
	case 'block':
		return [
			`${indent}{`,
			...renderStatements(statement.body, level + 1),
			`${indent}}`
		];
	case 'if': {
		const lines = [
			`${indent}if (${renderExpression(statement.test)}) {`,
			...renderStatements(statement.consequent, level + 1)
		];

		if (statement.alternate.length > 0) {
			if (statement.alternate.length === 1 && statement.alternate[0].type === 'if') {
				const nested = renderStatement(statement.alternate[0], level);

				nested[0] = `${indent}} else ${nested[0].trimStart()}`;
				lines.push(...nested);
			} else {
				lines.push(`${indent}} else {`);
				lines.push(...renderStatements(statement.alternate, level + 1));
				lines.push(`${indent}}`);
			}
		} else {
			lines.push(`${indent}}`);
		}

		return lines;
	}
	case 'while':
		return [
			`${indent}while (${renderExpression(statement.test)}) {`,
			...renderStatements(statement.body, level + 1),
			`${indent}}`
		];
	case 'for':
		return [
			`${indent}for (${statement.init}; ${renderExpression(statement.test)}; ${statement.update}) {`,
			...renderStatements(statement.body, level + 1),
			`${indent}}`
		];
	case 'return':
		return statement.argument
			? [`${indent}return ${renderExpression(statement.argument)};`]
			: [`${indent}return;`];
	case 'yield':
		return [`${indent}yield ${renderExpression(statement.argument)};`];
	default:
		throw new Error(`Unknown IR statement "${statement.type}".`);
	}
};

/**
 * Render a procedure definition.
 * @param {{name: string, parameters: Array.<string>, body: Array.<object>}} procedure Procedure.
 * @returns {Array.<string>} Source lines.
 */
const renderProcedure = procedure => [
	`function* ${procedure.name}(${[...procedure.parameters, '__callerWarp'].join(', ')}) {`,
	...renderStatements(procedure.body, 1),
	'}'
];

/**
 * Names of the generated identifiers a program uses.
 *
 * The script header declares helpers, primitives and variables that only some
 * compiled scripts use, so the compiler writes just the ones the program
 * refers to.
 * @param {object} program Program to inspect.
 * @returns {Set.<string>} Identifiers the program refers to.
 */
const collectIdentifiers = ({body, procedures = []}) => {
	const identifiers = new Set();
	const IDENTIFIER = /__[A-Za-z0-9_]+/g;

	const addText = text => {
		const found = text.match(IDENTIFIER);

		if (found) for (const name of found) identifiers.add(name);
	};

	const visitExpression = expression => {
		if (!expression || typeof expression === 'string') return;

		switch (expression.type) {
		case 'variable':
		case 'variableValue':
			if (expression.reference) identifiers.add(expression.reference);
			break;
		case 'cast':
			visitExpression(expression.expression);
			break;
		case 'binary':
			visitExpression(expression.left);
			visitExpression(expression.right);
			break;
		case 'source':
			for (const part of expression.parts) {
				if (typeof part === 'string') addText(part);
				else visitExpression(part);
			}
			break;
		}
	};

	const visitParts = parts => {
		for (const part of parts) {
			if (typeof part === 'string') addText(part);
			else visitExpression(part);
		}
	};

	const visitStatements = statements => {
		for (const statement of statements) {
			switch (statement.type) {
			case 'statement':
			case 'line':
				visitParts(statement.parts);
				break;
			case 'declaration':
				visitExpression(statement.init);
				break;
			case 'assignment':
				visitExpression(statement.target);
				visitExpression(statement.value);
				break;
			case 'block':
				visitStatements(statement.body);
				break;
			case 'if':
				visitExpression(statement.test);
				visitStatements(statement.consequent);
				visitStatements(statement.alternate);
				break;
			case 'while':
				visitExpression(statement.test);
				visitStatements(statement.body);
				break;
			case 'for':
				addText(statement.init);
				addText(statement.update);
				visitExpression(statement.test);
				visitStatements(statement.body);
				break;
			case 'return':
			case 'yield':
				visitExpression(statement.argument);
				break;
			}
		}
	};

	visitStatements(body);
	for (const procedure of procedures) visitStatements(procedure.body);

	return identifiers;
};

/**
 * Transpile a compiled script to JavaScript.
 * @param {object} program Program to transpile.
 * @param {Array.<string>} program.header Declarations shared by the script.
 * @param {Array.<object>} program.body Statements of the script body.
 * @param {Array.<object>} program.procedures Procedures the script uses.
 * @returns {string} Source of the script.
 */
const transpile = ({header = [], body, procedures = []}) => [
	'"use strict";',
	...header,
	...procedures.flatMap(renderProcedure),
	'return function* () {',
	'\tconst __warp = false;',
	...renderStatements(body, 1),
	'};'
].join('\n');

module.exports = transpile;
module.exports.collectIdentifiers = collectIdentifiers;
module.exports.quote = quote;
module.exports.numberSource = numberSource;
module.exports.renderExpression = renderExpression;
module.exports.renderStatements = renderStatements;
