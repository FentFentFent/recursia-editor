const CompilerError = require('./CompilerError');

/**
 * Source of a JavaScript literal.
 * @param {*} value Value to write.
 * @returns {string} Source of the value.
 */
const quote = value => {
	if (typeof value === 'undefined') return 'undefined';
	if (value === null) return 'null';

	return JSON.stringify(value);
};

/**
 * The block an extension's compilation function is compiling.
 *
 * The compiler passes this context to a block's `compile` function. Its helpers
 * return JavaScript source: an argument becomes the expression that reports the
 * block plugged into it, a field becomes the value of the field, and a substack
 * becomes the lines that run the blocks under the block. The compilation
 * function returns the source that runs the block itself, which the compiler
 * puts in the generator that runs the script.
 *
 * Because that generator is a generator function, the returned code may yield
 * the signals the compiler waits on:
 *
 * - `yield Signals.YIELD` gives the other threads their turn.
 * - `yield Signals.TICK` ends the frame.
 * - `yield Signals.promise(promise)` suspends the script until a promise
 *   resolves.
 *
 * The generated script also has `runtime`, `target`, `thread`, `util`,
 * `sequencer`, `Cast`, `MathUtil` and `Timer` in scope, and `__warp` is true
 * when the script runs without screen refresh.
 */
class CompileBlockContext {
	/**
	 * @param {ScriptEmitter} emitter Emitter of the script being compiled.
	 * @param {object} block Block being compiled.
	 * @param {boolean} valueUsed Whether the block's value is used.
	 */
	constructor (emitter, block, valueUsed) {
		/**
		 * Emitter of the script, for code that needs more than the helpers.
		 * @type {ScriptEmitter}
		 */
		this.emitter = emitter;

		/**
		 * Block being compiled.
		 * @type {object}
		 */
		this.block = block;

		/**
		 * Opcode of the block being compiled.
		 * @type {string}
		 */
		this.opcode = block.opcode;

		/**
		 * Whether the block's value is used, instead of the block running.
		 * @type {boolean}
		 */
		this.valueUsed = valueUsed;

		/**
		 * Lines the helpers asked to run before the block. The compiler emits
		 * them before the code the compilation function returns.
		 * @type {Array.<string>}
		 */
		this.lines = [];
	}

	/**
	 * Source of the value of an input.
	 *
	 * A block plugged into the input is compiled too, so the expression may
	 * wait on promises. The lines that have to run first are emitted by the
	 * compiler before the block's own code.
	 * @param {string} name Name of the input.
	 * @returns {string} Source of the input's value.
	 */
	argument (name) {
		const input = this.emitter.input(this.block, name);

		this.lines.push(...input.lines);

		return input.source;
	}

	/**
	 * Source of the value of a field, such as a dropdown's selection.
	 * @param {string} name Name of the field.
	 * @returns {string} Source of the field's value.
	 */
	field (name) {
		return this.emitter.field(this.block, name);
	}

	/**
	 * Lines that run the blocks in a branch of the block.
	 * @param {string} [name] Name of the branch input.
	 * @returns {Array.<string>} Source lines of the branch, empty if it is empty.
	 */
	substack (name = 'SUBSTACK') {
		const firstId = this.emitter.branch(this.block, name);

		return firstId ? this.emitter.stack(firstId).lines : [];
	}

	/**
	 * Create an identifier no other generated code uses.
	 * @param {string} [hint] Readable part of the identifier.
	 * @returns {string} The identifier.
	 */
	local (hint = 'local') {
		return this.emitter.newVarName(hint);
	}

	/**
	 * Declare a helper function or value once at the top of the script.
	 * @param {string} key Key identifying the helper.
	 * @param {string} hint Readable part of the helper's name.
	 * @param {string} source Source of the helper.
	 * @returns {string} Name of the helper.
	 */
	helper (key, hint, source) {
		return this.emitter.helper(key, hint, source);
	}

	/**
	 * Indent source lines.
	 * @param {Array.<string>} lines Lines to indent.
	 * @param {number} [levels] Number of tabs to add.
	 * @returns {Array.<string>} Indented lines.
	 */
	indent (lines, levels = 1) {
		return this.emitter.indent(lines, levels);
	}

	/**
	 * The yield at the end of a loop iteration: one pass per frame when the
	 * loop draws something, or none in a script that runs without screen
	 * refresh. Use it for a block that loops over its substack.
	 * @returns {Array.<string>} Source lines.
	 */
	loopYield () {
		return this.emitter.loopYield();
	}

	/**
	 * Source of a statement that gives the other threads their turn.
	 * @returns {string} Source line.
	 */
	yieldTurn () {
		return 'yield Signals.YIELD;';
	}

	/**
	 * Source of a statement that ends the frame.
	 * @returns {string} Source line.
	 */
	yieldFrame () {
		return 'yield Signals.TICK;';
	}

	/**
	 * Source of a JavaScript value.
	 * @param {*} value Value to write.
	 * @returns {string} Source of the value.
	 */
	quote (value) {
		return quote(value);
	}

	/**
	 * Fail compilation with an error the script reports as a compiler error.
	 * @param {string} message Message describing the problem.
	 * @param {object} [options] Options for the error.
	 * @param {string} [options.hint] Hint shown with the error.
	 * @returns {Error} The error, for the compilation function to throw.
	 */
	error (message, {hint = null} = {}) {
		return new CompilerError(message, {
			code: 'E_EXTENSION_COMPILE',
			hint,
			source: `${this.opcode} (${this.block.id})`
		});
	}
}

module.exports = CompileBlockContext;
