const ArgumentType = require('../extension-support/argument-type');
const Cast = require('../util/cast');
const CompilationFunctions = require('./CompilationFunctions');
const CompileBlockContext = require('./compile-block-context');
const CompiledThread = require('./compiled_thread');
const CompileUtility = require('./compile_utility');
const CompilerError = require('./CompilerError');
const log = require('../util/log');
const MathUtil = require('../util/math-util');
const ScriptIR = require('./IR');
const Sequencer = require('../engine/sequencer');
const Thread = require('../engine/thread');
const Timer = require('../util/timer');

/**
 * Argument types that hold blocks the primitive runs itself, by value of the
 * argument type and the description the primitive receives.
 * @type {Map.<string, string>}
 */
const BLOCK_INPUT_TYPES = new Map([
	[ArgumentType.INLINE_STACK, 'InlineStack'],
	[ArgumentType.SINGLE_BLOCK, 'SingleBlock']
]);

/**
 * Blocks that are compiled as part of the script's structure instead of being
 * run, and so cannot appear in a stack.
 * @type {Set.<string>}
 */
const STRUCTURAL_OPCODES = new Set([
	'procedures_definition',
	'procedures_prototype'
]);

/**
 * Core blocks that keep state on their stack frame between yields, so they have
 * to be called with a frame that survives until they finish.
 * @type {Set.<string>}
 */
const STATEFUL_OPCODES = new Set([
	'event_broadcastandwait',
	'looks_switchbackdroptoandwait'
]);

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
 * Read the warp flag of a procedure prototype.
 * @param {*} warp Warp flag from the prototype mutation.
 * @returns {boolean} Whether the procedure runs without screen refresh.
 */
const isWarp = warp => warp === true || warp === 'true';

/**
 * Error for a compilation function that did not return usable code.
 * @param {object} block Block that was compiled.
 * @param {string} hint What the compilation function had to return.
 * @returns {CompilerError} The error.
 */
const invalidCompilationResult = (block, hint) => new CompilerError(
	`The compilation function of "${block.opcode}" did not return usable code.`,
	{
		code: 'E_EXTENSION_COMPILE',
		hint,
		source: `${block.opcode} (${block.id})`
	}
);

/**
 * Emits the source of one compiled script.
 *
 * Emitters return the lines of code that run a block and, for reporters, the
 * expression that holds the reported value. Lines are returned relative to the
 * current indentation so control functions can nest the blocks they own.
 *
 * Reporters are compiled as statements followed by an expression: the
 * statements leave the value in a temporary, which lets reporters wait on
 * promises the way statement blocks do.
 */
class ScriptEmitter {
	/**
	 * @param {Runtime} runtime Runtime the script runs in.
	 * @param {RenderedTarget} target Target owning the script.
	 * @param {string} scriptId Id of the script's first block.
	 * @param {CompilationFunctions} functions Compilation functions to use.
	 */
	constructor (runtime, target, scriptId, functions) {
		this.runtime = runtime;
		this.target = target;
		this.blocks = target.blocks;
		this.scriptId = scriptId;
		this.functions = functions;
		this.utility = new CompileUtility();

		/**
		 * Procedure definitions reachable from this script, by procedure code.
		 * @type {Map.<string, object>}
		 */
		this.procedures = new Map();

		/**
		 * Procedures waiting to be emitted.
		 * @type {Array.<object>}
		 */
		this.procedureQueue = [];

		/**
		 * Sources of the emitted procedures.
		 * @type {Array.<string>}
		 */
		this.procedureSources = [];

		/**
		 * Arguments of the procedure being emitted, by argument name.
		 * @type {?Map.<string, string>}
		 */
		this.currentArguments = null;

		/**
		 * Whether any reachable procedure runs in warp mode.
		 * @type {boolean}
		 */
		this.usesWarp = false;
	}

	/**
	 * Compile the script.
	 *
	 * The script's hat block is not compiled: the runtime evaluates hats and
	 * advances the thread past them before the script runs.
	 * @returns {object} The compiled script.
	 */
	emit () {
		const scriptBlock = this.blocks.getBlock(this.scriptId);

		if (!scriptBlock) {
			throw new CompilerError(`Script "${this.scriptId}" does not exist.`, {
				code: 'E_MISSING_SCRIPT',
				hint: 'The script was removed before it could be compiled.'
			});
		}

		// Validation of the block graph: missing blocks, malformed inputs and
		// circular connections are reported here rather than by the emitter.
		const ir = new ScriptIR(this.runtime, this.target, this.scriptId);
		ir.captureSourceBlocks();

		const body = [
			'thread.requestScriptGlowInFrame = true;',
			...this.stack(scriptBlock.next).lines
		];

		while (this.procedureQueue.length > 0) {
			this.emitProcedure(this.procedureQueue.shift());
		}

		const compiled = this.buildSource(body, this.procedureSources);

		return {
			source: compiled.source,
			warp: this.usesWarp,
			create: context => this.createGenerator(compiled, context)
		};
	}

	/**
	 * Create the generator for a compiled script.
	 * @param {{factory: Function}} compiled The compiled script.
	 * @param {object} context Runtime context the script runs with.
	 * @returns {Generator} Generator running the script.
	 */
	createGenerator (compiled, context) {
		return compiled.factory(
			context.runtime,
			context.target,
			context.thread,
			context.util,
			context.sequencer,
			Cast,
			MathUtil,
			Timer,
			CompiledThread.Signals
		)();
	}

	/**
	 * Build the function that produces the script's generator.
	 * @param {Array.<string>} body Script body lines.
	 * @param {Array.<string>} procedures Sources of the script's procedures.
	 * @returns {{body: Array.<string>, factory: Function, source: string}} Compiled source.
	 */
	buildSource (body, procedures) {
		const header = [`const __WARP_TIME = ${Sequencer.WARP_TIME};`, ...this.utility.getHeaderLines()];
		const source = [
			'"use strict";',
			...header,
			...procedures.flatMap(procedure => procedure.split('\n')),
			'return function* () {',
			'\tconst __warp = false;',
			...body.map(line => `\t${line}`),
			'};'
		].join('\n');

		// eslint-disable-next-line no-new-func
		const factory = new Function(
			'runtime',
			'target',
			'thread',
			'util',
			'sequencer',
			'Cast',
			'MathUtil',
			'Timer',
			'Signals',
			source
		);

		return {body, factory, source};
	}

	/**
	 * Emit one procedure definition as a generator function.
	 * @param {object} procedure Procedure information.
	 */
	emitProcedure (procedure) {
		const previousArguments = this.currentArguments;
		const argumentsByName = new Map();
		const parameters = procedure.argumentIds.map((id, index) => {
			const local = this.utility.getNewVarName('argument');
			argumentsByName.set(procedure.argumentNames[index], local);
			return local;
		});

		this.currentArguments = argumentsByName;

		const definition = this.getBlock(procedure.definitionId);
		const body = this.stack(definition.next);
		const lines = [`function* ${procedure.name}(${[...parameters, '__callerWarp'].join(', ')}) {`];

		lines.push(`\tconst __warp = ${procedure.warp} || __callerWarp;`);

		if (procedure.warp) {
			lines.push('\tif (!thread.warpTimer) {');
			lines.push('\t\tthread.warpTimer = new Timer();');
			lines.push('\t\tthread.warpTimer.start();');
			lines.push('\t}');
			lines.push('\tthread.requestScriptGlowInFrame = true;');
		}

		lines.push(...this.indent(body.lines, 1));

		// A procedure that ends without returning still reports a value.
		lines.push("\treturn '';");
		lines.push('}');

		this.currentArguments = previousArguments;
		this.procedureSources.push(lines.join('\n'));
	}

	/**
	 * Find a procedure definition on the target and queue it for emission.
	 * @param {string} procedureCode Procedure code of the procedure.
	 * @returns {?object} Information about the procedure.
	 */
	getProcedure (procedureCode) {
		if (this.procedures.has(procedureCode)) {
			return this.procedures.get(procedureCode);
		}

		const definitionId = this.blocks.getProcedureDefinition(procedureCode);
		const definition = definitionId && this.blocks.getBlock(definitionId);
		const customBlockInput = definition && definition.inputs && definition.inputs.custom_block;
		const prototype = customBlockInput && this.blocks.getBlock(customBlockInput.block);
		const mutation = prototype && prototype.mutation;

		if (!mutation) {
			return null;
		}

		const procedure = {
			procedureCode,
			definitionId,
			name: this.utility.getNewVarName('procedure'),
			warp: isWarp(mutation.warp),
			argumentIds: JSON.parse(mutation.argumentids || '[]'),
			argumentNames: JSON.parse(mutation.argumentnames || '[]'),
			argumentDefaults: JSON.parse(mutation.argumentdefaults || '[]')
		};

		this.usesWarp = this.usesWarp || procedure.warp;
		this.procedures.set(procedureCode, procedure);
		this.procedureQueue.push(procedure);

		return procedure;
	}

	/**
	 * Emit a call to a procedure.
	 * @param {object} block The call block.
	 * @param {boolean} wantsValue Whether the call's value is used.
	 * @returns {{lines: Array.<string>, source: ?string}} Call source.
	 */
	callProcedure (block, wantsValue) {
		const procedureCode = block.mutation && block.mutation.proccode;
		const procedure = procedureCode && this.getProcedure(procedureCode);

		if (!procedure) {
			throw new CompilerError(`Procedure "${procedureCode}" is not defined on this target.`, {
				code: 'E_UNSUPPORTED_PROCEDURE',
				hint: 'Calls into another target keep the script interpreted.',
				source: `procedures_call (${block.id})`
			});
		}

		const lines = [];
		const args = procedure.argumentIds.map((argumentId, index) => {
			const input = this.input(block, argumentId);

			lines.push(...input.lines);

			return input.source === 'undefined'
				? quote(procedure.argumentDefaults[index])
				: input.source;
		});

		const depth = this.newVarName('depth');
		const value = wantsValue ? this.newVarName('call') : null;

		lines.push(`const ${depth} = util.frameDepth();`);

		const call = `yield* ${procedure.name}(${[...args, '__warp'].join(', ')})`;

		if (value) {
			lines.push(`const ${value} = ${call};`);
		} else {
			lines.push(`${call};`);
		}

		// A procedure can return from the middle of a block, which leaves that
		// block's frame behind. Drop everything the procedure pushed.
		lines.push(`util.unwindTo(${depth});`);

		return wantsValue ? {lines, source: value} : {lines};
	}

	/**
	 * Emit the value a block reports.
	 * @param {object} block Block to compile.
	 * @returns {{lines: Array.<string>, source: string}} Expression source.
	 */
	expression (block) {
		const literal = this.getLiteral(block);

		if (literal !== null) {
			return {lines: [], source: literal};
		}

		const emitter = this.functions.getExpression(block.opcode);

		if (emitter) {
			return emitter(this, block);
		}

		return this.compileCall(block, true);
	}

	/**
	 * Emit the blocks that follow one another starting at a block.
	 * @param {?string} firstId Id of the first block.
	 * @returns {{lines: Array.<string>}} Statement source.
	 */
	stack (firstId) {
		const lines = [];
		let block = firstId ? this.getBlock(firstId) : null;

		while (block) {
			lines.push(...this.statement(block).lines);
			block = block.next ? this.getBlock(block.next) : null;
		}

		return {lines};
	}

	/**
	 * Emit a block used as a statement.
	 * @param {object} block Block to compile.
	 * @returns {{lines: Array.<string>}} Statement source.
	 */
	statement (block) {
		const emitter = this.functions.getStatement(block.opcode);
		const compiled = emitter ? emitter(this, block) : this.compileCall(block, false);

		return {
			lines: [`thread.blockGlowInFrame = ${quote(block.id)};`, ...compiled.lines]
		};
	}

	/**
	 * Emit a block without a compilation function of its own.
	 *
	 * A core block is compiled the same way it is implemented: one direct call
	 * to its function in the runtime. Extension blocks are called through the
	 * compatibility utility instead, which lets them ask for branches and yield
	 * exactly like they do when the interpreter runs them.
	 * @param {object} block Block to compile.
	 * @param {boolean} wantsValue Whether the block's value is used.
	 * @returns {{lines: Array.<string>, source: ?string}} Block source.
	 */
	compileCall (block, wantsValue) {
		const compile = this.runtime.getCompileFunction(block.opcode);

		if (compile) {
			return this.emitExtensionCompilation(block, wantsValue, compile);
		}

		if (this.runtime.isCoreOpcode(block.opcode)) {
			return this.coreCall(block, wantsValue);
		}

		return this.emitPrimitiveCall(block, wantsValue);
	}

	/**
	 * Emit a block with the compilation function its extension registered.
	 *
	 * The function is given a context that reads the block's inputs and branches,
	 * and returns the JavaScript that runs the block. A reporter returns the
	 * expression that holds its value instead. The returned code is put in the
	 * generator that runs the script, so it runs without the interpreter. A
	 * function that throws or returns nothing keeps the script interpreted.
	 * @param {object} block Block to compile.
	 * @param {boolean} wantsValue Whether the block's value is used.
	 * @param {Function} compile Compilation function the extension registered.
	 * @returns {{lines: Array.<string>, source: ?string}} Block source.
	 */
	emitExtensionCompilation (block, wantsValue, compile) {
		this.assertExecutable(block);

		const context = new CompileBlockContext(this, block, wantsValue);
		let result;

		try {
			result = compile(context);
		} catch (error) {
			throw new CompilerError(
				`The compilation function of "${block.opcode}" failed: ${
					error && error.message ? error.message : error
				}`,
				{
					code: 'E_EXTENSION_COMPILE',
					hint: 'The script runs interpreted instead.',
					source: `${block.opcode} (${block.id})`,
					cause: error
				}
			);
		}

		const lines = [...context.lines];
		let source = null;

		if (typeof result === 'string') {
			if (wantsValue) {
				source = result;
			} else {
				lines.push(result);
			}
		} else if (result && typeof result === 'object') {
			if (typeof result.lines !== 'undefined') {
				if (!Array.isArray(result.lines) || result.lines.some(line => typeof line !== 'string')) {
					throw invalidCompilationResult(block, 'Return the lines as an array of source lines.');
				}

				lines.push(...result.lines);
			}

			if (typeof result.source === 'string') {
				source = result.source;
			}
		} else {
			throw invalidCompilationResult(block, 'Return the source of the block, or an object of lines and source.');
		}

		if (wantsValue) {
			if (source === null) {
				throw invalidCompilationResult(block, 'A block whose value is used must return the source of its value.');
			}

			return {lines, source};
		}

		if (lines.length === context.lines.length) {
			throw invalidCompilationResult(block, 'A block that runs must return the lines that run it.');
		}

		return {lines};
	}

	/**
	 * Emit a direct call to a core block's function in the runtime.
	 *
	 * The block is run once, with the arguments the interpreter would give it.
	 * A returned promise suspends the script until it resolves. The few blocks
	 * that keep state on their stack frame across yields are given a frame and
	 * are run again when they yield, like the interpreter runs them.
	 * @param {object} block Block to compile.
	 * @param {boolean} wantsValue Whether the block's value is used.
	 * @returns {{lines: Array.<string>, source: ?string}} Block source.
	 */
	coreCall (block, wantsValue) {
		if (STATEFUL_OPCODES.has(block.opcode)) {
			return this.emitPrimitiveCall(block, wantsValue, {branches: false});
		}

		this.assertExecutable(block);

		const primitive = this.getPrimitiveName(block.opcode);
		const args = this.buildArguments(block);
		const result = this.newVarName('result');
		const value = this.newVarName('value');
		const status = this.newVarName('status');

		const lines = [
			...args.lines,
			`let ${value};`,
			'{',
			`\tlet ${result} = ${primitive}(${args.source}, util);`,
			`\tif (${result} !== null && typeof ${result} === 'object' && typeof ${result}.then === 'function') {`,
			`\t\t${result} = yield Signals.promise(${result});`,
			`\t}`,
			`\t${value} = ${result};`,
			`\tif (thread.status !== ${Thread.STATUS_RUNNING} || thread.isKilled) {`,
			`\t\tconst ${status} = thread.isKilled ? ${Thread.STATUS_DONE} : thread.status;`,
			`\t\tthread.status = ${Thread.STATUS_RUNNING};`,
			`\t\tif (${status} === ${Thread.STATUS_DONE}) return;`,
			`\t\tif (${status} === ${Thread.STATUS_YIELD_TICK}) yield Signals.TICK; else yield Signals.YIELD;`,
			`\t}`,
			'}'
		];

		return wantsValue ? {lines, source: value} : {lines};
	}

	/**
	 * Emit a block by calling its primitive through the compatibility utility.
	 *
	 * The primitive is given a block utility that records the control
	 * operations it asks for, and the compiled code runs them in the same
	 * places the sequencer would. A block that yields without returning a
	 * promise is run again when the script resumes.
	 * @param {object} block Block to compile.
	 * @param {boolean} wantsValue Whether the block's value is used.
	 * @param {{branches: boolean}} [options] Whether the block may ask for branches.
	 * @returns {{lines: Array.<string>, source: ?string}} Block source.
	 */
	emitPrimitiveCall (block, wantsValue, {branches = true} = {}) {
		this.assertExecutable(block);

		const primitive = this.getPrimitiveName(block.opcode);
		const args = this.buildArguments(block);
		const result = this.newVarName('result');
		const value = this.newVarName('value');
		const done = this.newVarName('done');
		const branch = this.newVarName('branch');
		const status = this.newVarName('status');
		const returned = this.newVarName('returned');

		const branchLines = branches ? [
			`\t\t} else if (util.branch !== null) {`,
			`\t\t\tconst ${branch} = util.takeBranch();`,
			`\t\t\t${value} = ${result};`,
			...this.indent(this.branchDispatch(block, branch), 3),
			// A loop keeps its stack frame between passes, the way the sequencer
			// reuses the frame of the loop block it just stepped.
			`\t\t\tif (${branch}.isLoop) {`,
			...this.indent(this.loopYield(), 4),
			`\t\t\t} else {`,
			`\t\t\t\t${done} = true;`,
			`\t\t\t}`
		] : [];

		const lines = [
			...args.lines,
			// Declared outside the block so a reporter's value stays in scope.
			`let ${value};`,
			'{',
			`\tutil.enterBlock(${quote(block.id)});`,
			`\tlet ${done} = false;`,
			`\twhile (!${done}) {`,
			`\t\tlet ${result} = ${primitive}(${args.source}, util);`,
			`\t\tif (${result} !== null && typeof ${result} === 'object' && typeof ${result}.then === 'function') {`,
			`\t\t\t${result} = yield Signals.promise(${result});`,
			`\t\t\t${value} = ${result};`,
			`\t\t\t${done} = true;`,
			...branchLines,
			`\t\t} else if (util.stopped) {`,
			`\t\t\tutil.leaveBlock();`,
			`\t\t\treturn;`,
			`\t\t} else if (util.returned) {`,
			`\t\t\tconst ${returned} = util.takeReturnValue();`,
			`\t\t\tutil.leaveBlock();`,
			`\t\t\treturn ${returned};`,
			`\t\t} else if (thread.status !== ${Thread.STATUS_RUNNING}) {`,
			`\t\t\tconst ${status} = thread.status;`,
			`\t\t\tthread.status = ${Thread.STATUS_RUNNING};`,
			`\t\t\tif (${status} === ${Thread.STATUS_DONE}) {`,
			`\t\t\t\tutil.leaveBlock();`,
			`\t\t\t\treturn;`,
			`\t\t\t}`,
			`\t\t\tif (${status} === ${Thread.STATUS_YIELD_TICK}) yield Signals.TICK; else yield Signals.YIELD;`,
			`\t\t} else {`,
			`\t\t\t${value} = ${result};`,
			`\t\t\t${done} = true;`,
			`\t\t}`,
			`\t}`,
			`\tutil.leaveBlock();`,
			'}'
		];

		return wantsValue ? {lines, source: value} : {lines};
	}

	/**
	 * Emit the branches a primitive may ask the script to run.
	 * @param {object} block Block owning the branches.
	 * @param {string} branch Name of the variable holding the requested branch.
	 * @returns {Array.<string>} Source lines.
	 */
	branchDispatch (block, branch) {
		const lines = [];
		const emitted = new Set();
		const inputs = block.inputs || {};
		const argumentsInfo = this.runtime.getBlockArguments(block.opcode);
		const branchInputs = [];

		for (const name of Object.keys(inputs)) {
			if (name.startsWith('SUBSTACK')) {
				branchInputs.push(inputs[name].block);
			}
		}

		for (const name of Object.keys(argumentsInfo)) {
			if (BLOCK_INPUT_TYPES.has(argumentsInfo[name].type) && inputs[name]) {
				branchInputs.push(inputs[name].block);
			}
		}

		for (const firstId of branchInputs) {
			if (!firstId || emitted.has(firstId)) continue;

			emitted.add(firstId);
			lines.push(`${lines.length === 0 ? 'if' : '} else if'} (${branch}.blockId === ${quote(firstId)}) {`);
			lines.push(...this.indent(this.stack(firstId).lines, 1));
		}

		if (lines.length > 0) {
			lines.push('}');
		}

		return lines;
	}

	/**
	 * Emit the yield at the end of a loop iteration.
	 *
	 * An interpreted loop gives up its turn at the end of every iteration. When
	 * the iteration asked for a redraw, like any visible block does, that turn
	 * ends the frame, so the loop runs once per frame. Otherwise it only gives
	 * the other threads their turn. A loop that runs without screen refresh
	 * keeps iterating, and ends its turn only when the warp time is used up.
	 * @returns {Array.<string>} Source lines.
	 */
	loopYield () {
		return [
			'if (__warp) {',
			'\tif (thread.warpTimer && thread.warpTimer.timeElapsed() > __WARP_TIME) yield Signals.TICK;',
			'} else if (runtime.redrawRequested) {',
			'\tyield Signals.TICK;',
			'} else {',
			'\tyield Signals.YIELD;',
			'}'
		];
	}

	/**
	 * Source of a block that holds a single value, such as a number or text
	 * block, or null when the block is not one.
	 * @param {object} block Block to check.
	 * @returns {?string} Source of the value.
	 */
	getLiteral (block) {
		if (this.runtime.getOpcodeFunction(block.opcode)) {
			return null;
		}

		const fieldNames = Object.keys(block.fields || {});

		if (fieldNames.length !== 1) {
			return null;
		}

		if (Object.keys(block.inputs || {}).length !== 0) {
			return null;
		}

		return quote(String(block.fields[fieldNames[0]].value));
	}

	/**
	 * Emit the arguments object a primitive is called with.
	 * @param {object} block Block whose fields and inputs to emit.
	 * @returns {{lines: Array.<string>, source: string}} Arguments source.
	 */
	buildArguments (block) {
		const parts = [];
		const lines = [];
		const fields = block.fields || {};
		const inputs = block.inputs || {};
		const argumentsInfo = this.runtime.getBlockArguments(block.opcode);

		for (const name of Object.keys(fields)) {
			const field = fields[name];

			if (name === 'VARIABLE' || name === 'LIST' || name === 'BROADCAST_OPTION') {
				parts.push(`${quote(name)}: {id: ${quote(field.id ?? null)}, name: ${quote(field.value ?? null)}}`);
			} else {
				parts.push(`${quote(name)}: ${quote(field.value)}`);
			}
		}

		for (const name of Object.keys(inputs)) {
			if (name === 'custom_block' || name.startsWith('SUBSTACK')) {
				continue;
			}

			const input = inputs[name];
			const blockInputType = BLOCK_INPUT_TYPES.get(
				(argumentsInfo[name] && argumentsInfo[name].type) || ''
			);

			if (blockInputType) {
				// The primitive runs these blocks itself through the utility.
				parts.push(`${quote(name)}: {blockId: ${quote(input.block || null)}, type: ${quote(blockInputType)}}`);
				continue;
			}

			const childId = input.block ?? input.shadow;

			if (!childId) {
				continue;
			}

			const child = this.getBlock(childId);

			if (name === 'BROADCAST_INPUT') {
				const option = this.broadcastOption(block);

				lines.push(...option.lines);
				parts.push(`BROADCAST_OPTION: ${option.source}`);
			} else {
				const value = this.expression(child);

				lines.push(...value.lines);
				parts.push(`${quote(name)}: ${value.source}`);
			}
		}

		return {lines, source: `{${parts.join(', ')}}`};
	}

	/**
	 * Source of an input's value.
	 * @param {object} block Block owning the input.
	 * @param {string} name Name of the input.
	 * @returns {{lines: Array.<string>, source: string}} Expression source.
	 */
	input (block, name) {
		const input = (block.inputs || {})[name];

		if (!input) {
			return {lines: [], source: 'undefined'};
		}

		const childId = input.block ?? input.shadow;

		if (!childId) {
			return {lines: [], source: 'undefined'};
		}

		return this.expression(this.getBlock(childId));
	}

	/**
	 * Source of several inputs, evaluated in the order the block lists them.
	 * @param {object} block Block owning the inputs.
	 * @param {Array.<string>} names Names of the inputs.
	 * @returns {{lines: Array.<string>, sources: object.<string, string>}} Input sources.
	 */
	inputs (block, names) {
		const order = Object.keys(block.inputs || {});
		const sorted = names.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
		const lines = [];
		const sources = Object.create(null);

		for (const name of sorted) {
			const input = this.input(block, name);

			lines.push(...input.lines);
			sources[name] = input.source;
		}

		return {lines, sources};
	}

	/**
	 * Value of a field.
	 * @param {object} block Block owning the field.
	 * @param {string} name Name of the field.
	 * @returns {string} Source of the field's value.
	 */
	field (block, name) {
		const field = (block.fields || {})[name];

		if (!field) {
			return 'undefined';
		}

		return quote(field.value);
	}

	/**
	 * Source of the message a broadcast block sends.
	 * @param {object} block Block owning the BROADCAST_INPUT input.
	 * @returns {{lines: Array.<string>, source: string}} Source of the message.
	 */
	broadcastOption (block) {
		const input = (block.inputs || {}).BROADCAST_INPUT;
		const childId = input && (input.block ?? input.shadow);

		if (!childId) {
			return {lines: [], source: '{id: null, name: null}'};
		}

		const child = this.getBlock(childId);
		const menu = (child.fields || {}).BROADCAST_OPTION;

		// The dropdown is a menu block: its field holds the message id and name.
		if (menu && !this.runtime.getOpcodeFunction(child.opcode)) {
			return {
				lines: [],
				source: `{id: ${quote(menu.id ?? null)}, name: ${quote(menu.value ?? null)}}`
			};
		}

		const message = this.expression(child);

		return {
			lines: message.lines,
			source: `{id: null, name: Cast.toString(${message.source})}`
		};
	}

	/**
	 * Declare a helper function in the generated script's header.
	 * @param {string} key Key identifying the helper.
	 * @param {string} hint Readable part of the helper's name.
	 * @param {string} source Source of the helper.
	 * @returns {string} Name of the helper.
	 */
	helper (key, hint, source) {
		return this.utility.declare(`helper:${key}`, hint, source);
	}

	/**
	 * Source of the variable a block refers to.
	 * @param {object} block Block owning the VARIABLE field.
	 * @param {string} name Name of the field.
	 * @returns {string} Source of the variable lookup.
	 */
	variable (block, name) {
		const field = (block.fields || {})[name];

		if (!field) {
			throw new CompilerError(`Block "${block.id}" has no ${name} field.`, {
				code: 'E_MISSING_FIELD',
				hint: 'The script was compiled from a malformed block.'
			});
		}

		return `target.lookupOrCreateVariable(${quote(field.id ?? null)}, ${quote(field.value ?? '')})`;
	}

	/**
	 * Source of the argument a block reports.
	 * @param {object} block Argument reporter block.
	 * @returns {{lines: Array.<string>, source: string}} Expression source.
	 */
	argument (block) {
		const field = (block.fields || {}).VALUE;
		const local = this.currentArguments && field && this.currentArguments.get(field.value);

		// Argument reporters outside a procedure report 0, like the engine does.
		return {lines: [], source: local || '0'};
	}

	/**
	 * Emit the value a procedure returns.
	 * @param {object} block The return block.
	 * @returns {{lines: Array.<string>}} Statement source.
	 */
	returnValue (block) {
		const value = this.input(block, 'VALUE');
		const returned = value.source === 'undefined' ? "''" : value.source;

		return {lines: [...value.lines, `return ${returned};`]};
	}

	/**
	 * Id of the first block of a branch.
	 * @param {object} block Block owning the branch.
	 * @param {string} name Name of the branch input.
	 * @returns {?string} Id of the branch's first block.
	 */
	branch (block, name) {
		const input = (block.inputs || {})[name];

		return (input && input.block) || null;
	}

	/**
	 * Get a block, failing compilation when it does not exist.
	 * @param {string} id Id of the block.
	 * @returns {object} The block.
	 */
	getBlock (id) {
		const block = this.blocks.getBlock(id);

		if (!block) {
			throw new CompilerError(`Block "${id}" does not exist.`, {
				code: 'E_MISSING_BLOCK',
				hint: 'The script was compiled from a block container that changed.'
			});
		}

		return block;
	}

	/**
	 * Get the generated identifier a primitive is looked up by.
	 * @param {string} opcode Opcode of the primitive.
	 * @returns {string} Identifier holding the primitive.
	 */
	getPrimitiveName (opcode) {
		return this.utility.declare(`primitive:${opcode}`, 'primitive', `runtime.getOpcodeFunction(${quote(opcode)})`);
	}

	/**
	 * Create a unique identifier for generated code.
	 * @param {string} hint Readable part of the identifier.
	 * @returns {string} The identifier.
	 */
	newVarName (hint) {
		return this.utility.getNewVarName(hint);
	}

	/**
	 * Indent source lines.
	 * @param {Array.<string>} lines Lines to indent.
	 * @param {number} levels Number of tabs to add.
	 * @returns {Array.<string>} Indented lines.
	 */
	indent (lines, levels) {
		const prefix = '\t'.repeat(levels);

		return lines.map(line => (line.length ? prefix + line : line));
	}

	/**
	 * Ensure a block can be run by its primitive.
	 * @param {object} block Block to check.
	 */
	assertExecutable (block) {
		if (STRUCTURAL_OPCODES.has(block.opcode)) {
			throw new CompilerError(`Block "${block.opcode}" is part of a script's structure.`, {
				code: 'E_UNSUPPORTED_BLOCK',
				hint: 'The script runs interpreted instead.',
				source: `${block.opcode} (${block.id})`
			});
		}

		if (!this.runtime.getOpcodeFunction(block.opcode)) {
			throw new CompilerError(`Block "${block.opcode}" has no implementation.`, {
				code: 'E_UNSUPPORTED_BLOCK',
				hint: 'The script runs interpreted instead.',
				source: `${block.opcode} (${block.id})`
			});
		}

		if (this.runtime.getIsHat(block.opcode)) {
			throw new CompilerError(`Hat block "${block.opcode}" cannot run inside a script.`, {
				code: 'E_UNSUPPORTED_BLOCK',
				hint: 'The script runs interpreted instead.',
				source: `${block.opcode} (${block.id})`
			});
		}
	}
}

/**
 * Compile scratch scripts to JavaScript for enhanced performance.
 *
 * Compiled scripts run on a `CompiledThread`. A script the compiler cannot
 * handle keeps running through the interpreter.
 */
class Compiler {
	/**
	 * @param {object} vm Virtual machine, or a runtime, owning this compiler.
	 */
	constructor (vm) {
		this.vm = vm;
		this.runtime = vm.runtime || vm;

		/**
		 * Compilation functions used by every compiled script.
		 * @type {CompilationFunctions}
		 */
		this.functions = new CompilationFunctions();

		/**
		 * Compiled scripts by block container and script id. A missing entry is
		 * a script that failed to compile and runs interpreted.
		 * @type {WeakMap.<object, Map.<string, ?object>>}
		 */
		this.cache = new WeakMap();

		this.emitted = [];
	}

	/**
	 * Compile a thread's script if it can be compiled.
	 * @param {Thread} thread Thread to upgrade.
	 * @returns {?CompiledThread} A compiled thread, or null when the thread
	 *     should keep running interpreted.
	 */
	compileThread (thread) {
		if (!this.canCompileThread(thread)) {
			return null;
		}

		const script = this.getCompiledScript(thread.target, thread.blockContainer, thread.topBlock);

		if (!script) {
			return null;
		}

		return new CompiledThread(thread, script);
	}

	/**
	 * Whether a thread's script is one the compiler handles.
	 * @param {Thread} thread Thread to check.
	 * @returns {boolean} True if the thread can be compiled.
	 */
	canCompileThread (thread) {
		if (!thread || thread.stackClick || thread.updateMonitor) {
			// Stack clicks report values and monitors update from the engine.
			return false;
		}

		const target = thread.target;

		if (!target || !target.blocks || thread.blockContainer !== target.blocks) {
			return false;
		}

		const topBlock = thread.blockContainer.getBlock(thread.topBlock);

		return Boolean(topBlock) && this.runtime.getIsHat(topBlock.opcode);
	}

	/**
	 * Get the compiled script for a script, compiling it on first use.
	 * @param {RenderedTarget} target Target owning the script.
	 * @param {Blocks} blocks Container holding the script.
	 * @param {string} scriptId Id of the script's first block.
	 * @returns {?object} The compiled script.
	 */
	getCompiledScript (target, blocks, scriptId) {
		let scripts = this.cache.get(blocks);

		if (!scripts) {
			scripts = new Map();
			this.cache.set(blocks, scripts);
		}

		if (scripts.has(scriptId)) {
			return scripts.get(scriptId);
		}

		let script = null;

		try {
			script = this.compileScript(target, scriptId);
		} catch (error) {
			this.reportCompilationError(error, target, scriptId);
		}

		scripts.set(scriptId, script);

		return script;
	}

	/**
	 * Compile a script.
	 * @param {RenderedTarget} target Target owning the script.
	 * @param {string} scriptId Id of the script's first block.
	 * @returns {object} The compiled script.
	 */
	compileScript (target, scriptId) {
		const emitter = new ScriptEmitter(this.runtime, target, scriptId, this.functions);
		const compiled = emitter.emit();

		this.emitted = compiled.source.split('\n');

		return compiled;
	}

	/**
	 * Report a script that could not be compiled. It keeps running interpreted.
	 * @param {Error} error Error raised while compiling.
	 * @param {RenderedTarget} target Target owning the script.
	 * @param {string} scriptId Id of the script's first block.
	 */
	reportCompilationError (error, target, scriptId) {
		if (error && error.name === 'CompilerError') {
			log.warn(`Script "${scriptId}" on target "${target.id}" cannot be compiled (${error.code}): ${error.message}`);
			return;
		}

		console.error(
			`Compiling script "${scriptId}" on target "${target.id}" failed; it runs interpreted instead.`,
			error
		);
	}

	/**
	 * Drop the compiled scripts of a block container.
	 * @param {Blocks} blocks Container whose scripts should be recompiled.
	 */
	invalidateCache (blocks) {
		this.cache.delete(blocks);
	}

	/**
	 * Drop every compiled script, for changes that can affect all of them such
	 * as loading an extension.
	 */
	invalidateAll () {
		this.cache = new WeakMap();
	}

	/**
	 * Source of the script compiled last.
	 * @returns {string} Compiled source.
	 */
	getFinishedWork () {
		return this.emitted.join('\n');
	}
}

module.exports = Compiler;
