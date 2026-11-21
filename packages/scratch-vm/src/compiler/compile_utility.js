/**
 * Names and header declarations for generated code.
 *
 * Every identifier the compiler creates is unique so nested blocks can use the
 * same kind of temporary without shadowing each other, and values shared by
 * several blocks (primitive functions, for example) are looked up once in the
 * script's header instead of on every execution.
 */
class CompileUtility {
	constructor () {
		/**
		 * Generated names by the key they were created for.
		 * @type {object}
		 */
		this.varNames = Object.create(null);

		/**
		 * Header lines declaring generated identifiers.
		 * @type {Array.<string>}
		 */
		this.header = [];

		this.varCount = 0;
	}

	/**
	 * Create a fresh identifier that no other generated code uses.
	 * @param {string} hint Readable part of the identifier.
	 * @returns {string} The new identifier.
	 */
	getNewVarName (hint = 'v') {
		return `__${hint}${this.varCount++}`;
	}

	/**
	 * Look up the identifier created for a key.
	 * @param {string} key Key the identifier was created for.
	 * @returns {?string} The identifier, or undefined if none was created.
	 */
	getVarName (key) {
		return this.varNames[key];
	}

	/**
	 * Get the identifier for a key, creating and declaring it on first use.
	 * @param {string} key Key identifying the value.
	 * @param {string} hint Readable part of the identifier.
	 * @param {string} expression Source of the value the identifier holds.
	 * @returns {string} The identifier.
	 */
	declare (key, hint, expression) {
		if (this.varNames[key]) {
			return this.varNames[key];
		}

		const name = this.getNewVarName(hint);
		this.varNames[key] = name;
		this.header.push(`const ${name} = ${expression};`);

		return name;
	}

	/**
	 * Header lines that declare every generated identifier.
	 * @returns {Array.<string>} Header lines.
	 */
	getHeaderLines () {
		return this.header;
	}
}

module.exports = CompileUtility;
