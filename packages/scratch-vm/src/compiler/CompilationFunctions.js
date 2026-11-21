const control = require('./compilation_functions/control');
const data = require('./compilation_functions/data');
const events = require('./compilation_functions/events');
const lists = require('./compilation_functions/lists');
const looks = require('./compilation_functions/looks');
const motion = require('./compilation_functions/motion');
const operators = require('./compilation_functions/operators');
const procedures = require('./compilation_functions/procedures');
const sensing = require('./compilation_functions/sensing');

/**
 * Registry of the functions that turn individual blocks into source code.
 *
 * An expression function receives the emitter and the block and returns the
 * lines that have to run first and the expression that holds the reported
 * value. A statement function returns the lines that run the block.
 *
 * Opcodes without an entry are compiled through their block primitive instead,
 * which the compiler does itself.
 */
class CompilationFunctions {
	constructor () {
		/**
		 * Expression functions by opcode.
		 * @type {Map.<string, Function>}
		 */
		this.expressions = new Map();

		/**
		 * Statement functions by opcode.
		 * @type {Map.<string, Function>}
		 */
		this.statements = new Map();

		this.register(operators.expressions, operators.statements);
		this.register(data.expressions, data.statements);
		this.register(lists.expressions, lists.statements);
		this.register(motion.expressions, motion.statements);
		this.register(looks.expressions, looks.statements);
		this.register(sensing.expressions, sensing.statements);
		this.register(events.expressions, events.statements);
		this.register(control.expressions, control.statements);
		this.register(procedures.expressions, procedures.statements);
	}

	/**
	 * Register compilation functions.
	 * @param {object.<string, Function>} expressions Expression functions by opcode.
	 * @param {object.<string, Function>} statements Statement functions by opcode.
	 */
	register (expressions = {}, statements = {}) {
		for (const opcode of Object.keys(expressions)) {
			this.expressions.set(opcode, expressions[opcode]);
		}

		for (const opcode of Object.keys(statements)) {
			this.statements.set(opcode, statements[opcode]);
		}
	}

	/**
	 * Get the expression function for an opcode.
	 * @param {string} opcode Opcode to look up.
	 * @returns {?Function} The expression function, if there is one.
	 */
	getExpression (opcode) {
		return this.expressions.get(opcode);
	}

	/**
	 * Get the statement function for an opcode.
	 * @param {string} opcode Opcode to look up.
	 * @returns {?Function} The statement function, if there is one.
	 */
	getStatement (opcode) {
		return this.statements.get(opcode);
	}
}

module.exports = CompilationFunctions;
