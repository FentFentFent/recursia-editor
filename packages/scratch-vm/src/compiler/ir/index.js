/**
 * Intermediate representation for compiled scripts.
 *
 * The front end of the compiler turns blocks into these nodes instead of
 * JavaScript text. Optimization stages transform the tree, and the transpiler
 * in `./transpile` turns the result into the source of the script.
 *
 * Expressions are either `literal` values, `variable` lookups, `variableValue`
 * reads of a variable, or `source` fragments that hold JavaScript parts with
 * nested expressions. Statements cover the constructs the compiler generates
 * itself: sequences of source fragments, declarations, assignments, blocks,
 * conditionals, loops, yields and returns.
 */

/**
 * Flatten nested arrays of nodes.
 * @param {Array.<(object|Array)>} items Nodes or arrays of nodes.
 * @returns {Array.<object>} Flat list of nodes.
 */
const flatten = items => items.reduce((flat, item) => {
	if (Array.isArray(item)) {
		flat.push(...flatten(item));
	} else if (item !== null && typeof item !== 'undefined') {
		flat.push(item);
	}

	return flat;
}, []);

/**
 * Source fragment holding a value, made of strings and nested expressions.
 * @param {...(string|object|Array)} parts Parts of the fragment.
 * @returns {object} Expression node.
 */
const source = (...parts) => ({type: 'source', parts: flatten(parts)});

/**
 * Scratch conversion of a value, such as `Cast.toNumber`.
 *
 * Kept as a node so the optimization stages can see the conversion and remove
 * it when the value already has the requested type.
 * @param {string} kind Type the value is converted to: `number`, `boolean` or `string`.
 * @param {object} expression Expression to convert.
 * @returns {object} Expression node.
 */
const cast = (kind, expression) => ({type: 'cast', kind, expression});

/**
 * Arithmetic on two numbers.
 *
 * Kept as a node so the optimization stages can compute it when both operands
 * are known while the script is compiled.
 * @param {string} operator JavaScript operator.
 * @param {object} left Left operand.
 * @param {object} right Right operand.
 * @returns {object} Expression node.
 */
const binary = (operator, left, right) => ({type: 'binary', operator, left, right, numeric: true});

/**
 * Literal value, written as a JavaScript literal.
 * @param {*} value Value to write.
 * @returns {object} Expression node.
 */
const literal = value => ({type: 'literal', value});

/**
 * Number computed while the script was compiled.
 *
 * Kept apart from other literals so later stages know the value is a number
 * without looking at its JavaScript type, and so values that have no JSON form
 * such as `Infinity` can still be written.
 * @param {number} value Value to write.
 * @returns {object} Expression node.
 */
const number = value => ({type: 'number', value, numeric: true});

/**
 * Lookup of a variable object on the target.
 * @param {?string} id Id of the variable.
 * @param {?string} name Name of the variable.
 * @param {string} [reference] Identifier the lookup is already held in.
 * @returns {object} Expression node.
 */
const variable = (id, name, reference) => ({
	type: 'variable',
	id,
	name,
	reference
});

/**
 * Value of a variable: a lookup followed by its `value` property.
 * @param {?string} id Id of the variable.
 * @param {?string} name Name of the variable.
 * @param {string} [reference] Identifier the lookup is already held in.
 * @returns {object} Expression node.
 */
const variableValue = (id, name, reference) => ({
	type: 'variableValue',
	id,
	name,
	reference
});

/**
 * Expression statement, such as one call to a target's method.
 * @param {...(string|object|Array)} parts Parts of the statement.
 * @returns {object} Statement node.
 */
const statement = (...parts) => ({type: 'statement', parts: flatten(parts)});

/**
 * Source line that is already complete, such as code an extension returned.
 * @param {...(string|object|Array)} parts Parts of the line.
 * @returns {object} Statement node.
 */
const line = (...parts) => ({type: 'line', parts: flatten(parts)});

/**
 * Statement that can suspend the script or run other code, such as a procedure
 * call or a glide.
 *
 * The optimization stages treat everything they knew about variables as lost
 * after it, because another script or the procedure can write them.
 * @param {...(string|object|Array)} parts Parts of the statement.
 * @returns {object} Statement node.
 */
const suspending = (...parts) => ({type: 'statement', parts: flatten(parts), clearsTypes: true});

/**
 * Declaration of a local of the generated script.
 * @param {string} kind `const` or `let`.
 * @param {string} name Name of the local.
 * @param {object} init Expression the local starts with.
 * @returns {object} Statement node.
 */
const declaration = (kind, name, init) => ({type: 'declaration', kind, name, init});

/**
 * Assignment to an expression, usually a property of a variable.
 * @param {object} target Expression to assign to.
 * @param {object} value Expression assigned to it.
 * @param {?string} [variable] Id of the variable the assignment writes.
 * @returns {object} Statement node.
 */
const assignment = (target, value, variable) => ({
	type: 'assignment',
	target,
	value,
	variable
});

/**
 * Braced block of statements.
 * @param {Array.<object>} body Statements of the block.
 * @returns {object} Statement node.
 */
const block = body => ({type: 'block', body: flatten([body])});

/**
 * Conditional statement.
 * @param {object} test Expression that decides the branch.
 * @param {Array.<object>} consequent Statements that run when it is true.
 * @param {Array.<object>} alternate Statements that run when it is false.
 * @returns {object} Statement node.
 */
const ifThen = (test, consequent, alternate = []) => ({
	type: 'if',
	test,
	consequent: flatten([consequent]),
	alternate: flatten([alternate])
});

/**
 * Loop that runs while its test is true.
 * @param {object} test Expression that decides whether to iterate.
 * @param {Array.<object>} body Statements of one iteration.
 * @returns {object} Statement node.
 */
const whileLoop = (test, body) => ({type: 'while', test, body: flatten([body])});

/**
 * Loop with an initializer and an update expression.
 * @param {string} init Source of the initializer, without a semicolon.
 * @param {object} test Expression that decides whether to iterate.
 * @param {string} update Source of the update, without a semicolon.
 * @param {Array.<object>} body Statements of one iteration.
 * @returns {object} Statement node.
 */
const forLoop = (init, test, update, body) => ({
	type: 'for',
	init,
	test,
	update,
	body: flatten([body])
});

/**
 * Stop the generator and report a value.
 * @param {object} [argument] Expression to report.
 * @returns {object} Statement node.
 */
const returnStatement = (argument = null) => ({type: 'return', argument});

/**
 * Hand a signal back to the engine.
 * @param {object} argument Signal to yield.
 * @returns {object} Statement node.
 */
const yieldStatement = argument => ({type: 'yield', argument});

module.exports = {
	assignment,
	binary,
	block,
	cast,
	declaration,
	forLoop,
	ifThen,
	line,
	literal,
	number,
	returnStatement,
	source,
	statement,
	suspending,
	variable,
	variableValue,
	whileLoop,
	yieldStatement
};
