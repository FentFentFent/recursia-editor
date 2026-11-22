const ArgumentType = require('../extension-support/argument-type');
const Cast = require('../util/cast');
const CompilationFunctions = require('./CompilationFunctions');
const CompileBlockContext = require('./compile-block-context');
const CompiledThread = require('./compiled_thread');
const CompileUtility = require('./compile_utility');
const CompilerError = require('./CompilerError');
const ir = require('./ir/index');
const log = require('../util/log');
const MathUtil = require('../util/math-util');
const {optimize} = require('./optimization/index');
const ScriptIR = require('./IR');
const Sequencer = require('../engine/sequencer');
const Thread = require('../engine/thread');
const Timer = require('../util/timer');
const transpile = require('./ir/transpile');

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
 * Blocks that write a variable anywhere in the project, so its value cannot be
 * treated as a constant by compiled scripts.
 * @type {Set.<string>}
 */
const VARIABLE_WRITE_OPCODES = new Set([
	'control_for_each',
	'data_changevariableby',
	'data_setvariableto'
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
 * Emits the intermediate representation of one compiled script.
 *
 * Emitters return the statements that run a block and, for reporters, the
 * expression that holds the reported value. The statements are relative to the
 * block they are in, so control functions can nest the blocks they own. The
 * optimization stages transform the representation before the transpiler turns
 * it into the source of the script.
 *
 * Reporters are compiled as statements followed by an expression: the
 * statements leave the value in a temporary, which lets reporters wait on
 * promises the way statement blocks do.
 */
class ScriptEmitter {
	/**
	 * Number of warp-mode loop iterations between reads of the warp timer.
	 *
	 * A loop ends its turn at the first read that finds the warp time used up, so
	 * this is also how many of its iterations can run past the warp time.
	 * @type {number}
	 */
	static get WARP_LOOP_CHECKS () {
		return 8;
	}

	/**
	 * @param {Runtime} runtime Runtime the script runs in.
	 * @param {RenderedTarget} target Target owning the script.
	 * @param {string} scriptId Id of the script's first block.
	 * @param {CompilationFunctions} functions Compilation functions to use.
	 * @param {object} [optimization] Facts the optimization stages use.
	 */
	constructor (runtime, target, scriptId, functions, optimization = {}) {
		this.runtime = runtime;
		this.target = target;
		this.blocks = target.blocks;
		this.scriptId = scriptId;
		this.functions = functions;
		this.optimization = optimization;
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
		 * Procedures emitted for this script.
		 * @type {Array.<object>}
		 */
		this.procedureBodies = [];

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

		/**
		 * Whether the script calls a primitive, which can start a procedure the
		 * script has to be able to run.
		 * @type {boolean}
		 */
		this.mayStartProcedures = false;
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
		const scriptIR = new ScriptIR(this.runtime, this.target, this.scriptId);
		scriptIR.captureSourceBlocks();

		const body = [
			ir.statement('thread.requestScriptGlowInFrame = true'),
			...this.stack(scriptBlock.next)
		];

		if (this.mayStartProcedures) {
			this.queueProceduresStartedByPrimitives();
		}

		while (this.procedureQueue.length > 0) {
			this.emitProcedure(this.procedureQueue.shift());
		}

		if (this.mayStartProcedures) {
			this.emitStartedProcedureDispatch();
		}

		const compiled = this.build(body);

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
	 * Optimize the representation and transpile it to JavaScript.
	 * @param {Array.<object>} body Statements of the script body.
	 * @returns {{body: Array.<object>, factory: Function, source: string}} Compiled source.
	 */
	build (body) {
		const procedures = this.procedureBodies.map(procedure => ({
			...procedure,
			body: optimize(procedure.body, this.optimization)
		}));
				const optimized = {
			header: [
				`const __WARP_TIME = ${Sequencer.WARP_TIME};`,
				`const __WARP_LOOP_CHECKS = ${ScriptEmitter.WARP_LOOP_CHECKS};`,
				`let __warpChecks = __WARP_LOOP_CHECKS;`
			],
			// The editor glows a whole script, so the block it is told about only
			// has to belong to the script: reporting it once here is what the
			// interpreter's per-block report amounts to.
			body: optimize([
				ir.statement('thread.blockGlowInFrame = ', ir.literal(this.scriptId)),
				...body
			], this.optimization),
			procedures
		};

		// A declaration the optimization stages made unnecessary, such as the
		// lookup of a variable they replaced with its value, is left out.
		const used = transpile.collectIdentifiers(optimized);
		const declared = this.utility.getHeaderLines().filter(line => {
			const name = /^const (\w+)/.exec(line);

			return name && used.has(name[1]);
		});
		const source = transpile({
			...optimized,
			header: [...optimized.header, ...declared]
		});

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
		const body = [
			ir.statement('thread.blockGlowInFrame = ', ir.literal(procedure.definitionId)),
			ir.declaration('const', '__warp', ir.source([String(procedure.warp), ' || __callerWarp']))
		];

		if (procedure.warp) {
			body.push(
				ir.ifThen(ir.source('!thread.warpTimer'), [
					ir.statement('thread.warpTimer = new Timer()'),
					ir.statement('thread.warpTimer.start()')
				]),
				ir.statement('thread.requestScriptGlowInFrame = true')
			);
		}

		// A procedure that ends without returning still reports a value.
		body.push(...this.stack(definition.next), ir.returnStatement(ir.literal('')));

		this.currentArguments = previousArguments;
		this.procedureBodies.push({name: procedure.name, parameters, body});
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
	 * Queue every procedure on the target for emission.
	 *
	 * A primitive names the procedure it starts at runtime, so nothing in the
	 * blocks says which procedures a script may run that way.
	 */
	queueProceduresStartedByPrimitives () {
		for (const scriptId of this.blocks.getScripts()) {
			const block = this.blocks.getBlock(scriptId);
			const customBlockInput = block && block.opcode === 'procedures_definition' && block.inputs.custom_block;
			const prototype = customBlockInput && this.blocks.getBlock(customBlockInput.block);
			const procedureCode = prototype && prototype.mutation && prototype.mutation.proccode;

			if (procedureCode) {
				this.getProcedure(procedureCode);
			}
		}
	}

	/**
	 * Emit the generator that runs a procedure a primitive started.
	 *
	 * The procedure is looked up by the code the primitive named, and its
	 * parameters are read from the values the primitive pushed for it.
	 */
	emitStartedProcedureDispatch () {
		let chain = [];
		let returningChain = [];

		for (const procedure of [...this.procedures.values()].reverse()) {
			const args = procedure.argumentNames.map((argumentName, index) => {
				const value = `__started.params[${quote(argumentName)}]`;
				const fallback = quote(procedure.argumentDefaults[index] || '');

				return `${value} === undefined ? ${fallback} : ${value}`;
			});
			const call = `${procedure.name}(${[...args, '__warp'].join(', ')})`;

			chain = [ir.ifThen(
				ir.source(['__started.procedureCode === ', quote(procedure.procedureCode)]),
				[
					ir.suspending(ir.source(`yield* ${call}`)),
					ir.returnStatement()
				],
				chain
			)];

			returningChain = [ir.ifThen(
				ir.source(['__started.procedureCode === ', quote(procedure.procedureCode)]),
				[ir.returnStatement(ir.source(`yield* ${call}`))],
				returningChain
			)];
		}

		this.procedureBodies.push({
			// The transpiler adds the caller's warp flag as the last parameter.
			name: '__startedProcedure',
			parameters: ['__started'],
			body: [ir.declaration('const', '__warp', ir.source('__callerWarp')), ...chain]
		});

		this.procedureBodies.push({
			// The same dispatch, handing the value the procedure returns to the block which started it.
			name: '__startedReturningProcedure',
			parameters: ['__started'],
			body: [ir.declaration('const', '__warp', ir.source('__callerWarp')), ...returningChain]
		});
	}

	/**
	 * Emit a call to a procedure.
	 * @param {object} block The call block.
	 * @param {boolean} wantsValue Whether the call's value is used.
	 * @returns {{statements: Array.<object>, source: ?object}} Call source.
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

		const statements = [];
		const args = procedure.argumentIds.map((argumentId, index) => {
			const input = this.input(block, argumentId);

			statements.push(...input.statements);

			return this.hasValue(input.source)
				? input.source
				: ir.literal(procedure.argumentDefaults[index]);
		});

		const depth = this.newVarName('depth');
		const value = wantsValue ? this.newVarName('call') : null;

		statements.push(ir.declaration('const', depth, ir.source('util.frameDepth()')));

		const callParts = [`yield* ${procedure.name}(`];

		for (const [index, arg] of [...args, '__warp'].entries()) {
			if (index > 0) callParts.push(', ');
			callParts.push(arg);
		}

		callParts.push(')');

		const call = ir.source(callParts);

		if (value) {
			const declaration = ir.declaration('const', value, call);

			// The procedure can write variables the script has reads of.
			declaration.clearsTypes = true;
			statements.push(declaration);
		} else {
			statements.push(ir.suspending(call));
		}

		// A procedure can return from the middle of a block, which leaves that
		// block's frame behind. Drop everything the procedure pushed.
		statements.push(ir.statement('util.unwindTo(', depth, ')'));

		return wantsValue ? {statements, source: ir.source([value])} : {statements};
	}

	/**
	 * Emit the value a block reports.
	 * @param {object} block Block to compile.
	 * @returns {{statements: Array.<object>, source: object}} Expression source.
	 */
	expression (block) {
		const literal = this.getLiteral(block);

		if (literal !== null) {
			return {statements: [], source: literal};
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
	 * @returns {Array.<object>} Statement nodes.
	 */
	stack (firstId) {
		const statements = [];
		let block = firstId ? this.getBlock(firstId) : null;

		while (block) {
			statements.push(...this.statement(block));
			block = block.next ? this.getBlock(block.next) : null;
		}

		return statements;
	}

	/**
	 * Emit a block used as a statement.
	 * @param {object} block Block to compile.
	 * @returns {Array.<object>} Statement nodes.
	 */
	statement (block) {
		const emitter = this.functions.getStatement(block.opcode);

		return (emitter ? emitter(this, block) : this.compileCall(block, false)).statements;
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
	 * @returns {{statements: Array.<object>, source: ?object}} Block source.
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
	 * @returns {{statements: Array.<object>, source: ?object}} Block source.
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

		const statements = [...context.statements];
		let source = null;

		if (typeof result === 'string') {
			if (wantsValue) {
				source = ir.source(result);
			} else {
				statements.push(ir.line(result));
			}
		} else if (result && typeof result === 'object') {
			if (typeof result.lines !== 'undefined') {
				if (!Array.isArray(result.lines) || result.lines.some(line => typeof line !== 'string')) {
					throw invalidCompilationResult(block, 'Return the lines as an array of source lines.');
				}

				statements.push(...result.lines.map(line => ir.line(line)));
			}

			if (typeof result.source === 'string') {
				source = ir.source(result.source);
			}
		} else {
			throw invalidCompilationResult(block, 'Return the source of the block, or an object of lines and source.');
		}

		if (wantsValue) {
			if (source === null) {
				throw invalidCompilationResult(block, 'A block whose value is used must return the source of its value.');
			}

			return {statements, source};
		}

		if (statements.length === context.statements.length) {
			throw invalidCompilationResult(block, 'A block that runs must return the lines that run it.');
		}

		return {statements};
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
	 * @returns {{statements: Array.<object>, source: ?object}} Block source.
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

		const statements = [
			...args.statements,
			ir.declaration('let', value),
			ir.block([
				ir.declaration('let', result, ir.source([primitive, '(', args.source, ', util)'])),
				ir.ifThen(
					ir.source([
						result, ' !== null && typeof ', result,
						" === 'object' && typeof ", result, ".then === 'function'"
					]),
					[ir.assignment(ir.source([result]), ir.source(['yield Signals.promise(', result, ')']))]
				),
				ir.assignment(ir.source([value]), ir.source([result])),
				ir.ifThen(
					ir.source([
						'thread.status !== ', String(Thread.STATUS_RUNNING), ' || thread.isKilled'
					]),
					[
						ir.declaration(
							'const',
							status,
							ir.source([
								'thread.isKilled ? ', String(Thread.STATUS_DONE), ' : thread.status'
							])
						),
						ir.assignment(
							ir.source('thread.status'),
							ir.source([String(Thread.STATUS_RUNNING)])
						),
						ir.ifThen(
							ir.source([status, ' === ', String(Thread.STATUS_DONE)]),
							[ir.returnStatement()]
						),
						ir.ifThen(
							ir.source([status, ' === ', String(Thread.STATUS_YIELD_TICK)]),
							[ir.yieldStatement(ir.source('Signals.TICK'))],
							[ir.yieldStatement(ir.source('Signals.YIELD'))]
						)
					]
				)
			])
		];

		return wantsValue ? {statements, source: ir.source([value])} : {statements};
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
	 * @returns {{statements: Array.<object>, source: ?object}} Block source.
	 */
	emitPrimitiveCall (block, wantsValue, {branches = true} = {}) {
		this.assertExecutable(block);
		// An extension's primitive can start a procedure, such as a class constructor,
		// so the script needs the dispatch to the compiled procedures to run it.
		const mayStartProcedure = !this.runtime.isCoreOpcode(block.opcode);
		if (mayStartProcedure) {
			this.mayStartProcedures = true;
		}

		const primitive = this.getPrimitiveName(block.opcode);
		const args = this.buildArguments(block);
		const result = this.newVarName('result');
		const value = this.newVarName('value');
		const done = this.newVarName('done');
		const branch = this.newVarName('branch');
		const status = this.newVarName('status');
		const returned = this.newVarName('returned');

		let chain = ir.ifThen(
			ir.source(['thread.status !== ', String(Thread.STATUS_RUNNING)]),
			[
				ir.declaration('const', status, ir.source('thread.status')),
				ir.assignment(ir.source('thread.status'), ir.source([String(Thread.STATUS_RUNNING)])),
				ir.ifThen(
					ir.source([status, ' === ', String(Thread.STATUS_DONE)]),
					[ir.statement('util.leaveBlock()'), ir.returnStatement()]
				),
				ir.ifThen(
					ir.source([status, ' === ', String(Thread.STATUS_YIELD_TICK)]),
					[ir.yieldStatement(ir.source('Signals.TICK'))],
					[ir.yieldStatement(ir.source('Signals.YIELD'))]
				)
			],
			[
				ir.assignment(ir.source([value]), ir.source([result])),
				ir.assignment(ir.source([done]), ir.literal(true))
			]
		);

		chain = ir.ifThen(
			ir.source('util.returned'),
			[
				ir.declaration('const', returned, ir.source('util.takeReturnValue()')),
				ir.statement('util.leaveBlock()'),
				ir.returnStatement(ir.source([returned]))
			],
			[chain]
		);

		chain = ir.ifThen(
			ir.source('util.stopped'),
			[ir.statement('util.leaveBlock()'), ir.returnStatement()],
			[chain]
		);

		if (branches) {
			chain = ir.ifThen(
				ir.source('util.branch !== null'),
				[
					ir.declaration('const', branch, ir.source('util.takeBranch()')),
					ir.assignment(ir.source([value]), ir.source([result])),
					...this.branchDispatch(block, branch),
					// A loop keeps its stack frame between passes, the way the
					// sequencer reuses the frame of the loop block it just stepped.
					ir.ifThen(
						ir.source([branch, '.isLoop']),
						this.loopYield(),
						[ir.assignment(ir.source([done]), ir.literal(true))]
					)
				],
				[chain]
			);
		}

		// A procedure the primitive started runs before the block finishes, the way the
		// sequencer steps into it before the calling block's script continues. The block
		// still needs the rest of the chain, which decides whether it is done.
		if (mayStartProcedure) {
			const procedureValue = this.newVarName('procedureValue');
			const returnedProcedureValue = ir.declaration(
				'const',
				procedureValue,
				ir.source('yield* __startedReturningProcedure(util.takeStartedReturningProcedure(), __warp)')
			);

			// The procedure can write variables the script has reads of.
			returnedProcedureValue.clearsTypes = true;

			// A procedure the primitive needs the value of runs, and the block runs again so
			// that it reports that value, the way the interpreter resumes it with the value.
			chain = ir.ifThen(
				ir.source('util.startedReturningProcedure !== null'),
				[
					returnedProcedureValue,
					ir.statement('util.setReturnedProcedureValue(', procedureValue, ')')
				],
				[
					ir.block([
						ir.ifThen(
							ir.source('util.startedProcedure !== null'),
							[ir.suspending(ir.source('yield* __startedProcedure(util.takeStartedProcedure(), __warp)'))]
						),
						chain
					])
				]
			);
		}

		const statements = [
			...args.statements,
			// Declared outside the block so a reporter's value stays in scope.
			ir.declaration('let', value),
			ir.block([
				ir.statement('util.enterBlock(', ir.literal(block.id), ')'),
				ir.declaration('let', done, ir.literal(false)),
				ir.whileLoop(ir.source(['!', done]), [
					ir.declaration('let', result, ir.source([primitive, '(', args.source, ', util)'])),
					ir.ifThen(
						ir.source([
							result, ' !== null && typeof ', result,
							" === 'object' && typeof ", result, ".then === 'function'"
						]),
						[
							ir.assignment(
								ir.source([result]),
								ir.source(['yield Signals.promise(', result, ')'])
							),
							ir.assignment(ir.source([value]), ir.source([result])),
							ir.assignment(ir.source([done]), ir.literal(true))
						],
						[chain]
					)
				]),
				ir.statement('util.leaveBlock()')
			])
		];

		return wantsValue ? {statements, source: ir.source([value])} : {statements};
	}

	/**
	 * Emit the branches a primitive may ask the script to run.
	 * @param {object} block Block owning the branches.
	 * @param {string} branch Name of the variable holding the requested branch.
	 * @returns {Array.<object>} Statement nodes.
	 */
	branchDispatch (block, branch) {
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

		const emitted = [];
		let chain = null;

		for (const firstId of branchInputs) {
			if (!firstId || emitted.includes(firstId)) continue;
			emitted.push(firstId);
		}

		for (const firstId of emitted.slice().reverse()) {
			const test = ir.source([branch, '.blockId === ', ir.literal(firstId)]);
			const body = this.stack(firstId);

			chain = chain ? ir.ifThen(test, body, [chain]) : ir.ifThen(test, body);
		}

		return chain ? [chain] : [];
	}

	/**
	 * Emit the yield at the end of a loop iteration.
	 *
	 * An interpreted loop gives up its turn at the end of every iteration. When
	 * the iteration asked for a redraw, like any visible block does, that turn
	 * ends the frame, so the loop runs once per frame. Otherwise it only gives
	 * the other threads their turn. A loop that runs without screen refresh
	 * keeps iterating, and ends its turn only when the warp time is used up.
	 *
	 * The warp time is read once every `__WARP_LOOP_CHECKS` iterations instead of
	 * every iteration, because reading the clock costs more than most iterations
	 * do. The read still happens often enough that a loop ends its turn within
	 * `__WARP_LOOP_CHECKS` iterations of the warp time being used up.
	 * @returns {Array.<object>} Statement nodes.
	 */
	loopYield () {
		return [
			ir.ifThen(
				ir.source('__warp'),
				[
					ir.ifThen(
						ir.source('--__warpChecks <= 0'),
						[
							ir.statement('__warpChecks = __WARP_LOOP_CHECKS'),
							ir.ifThen(
								ir.source('thread.warpTimer && thread.warpTimer.timeElapsed() > __WARP_TIME'),
								[ir.yieldStatement(ir.source('Signals.TICK'))]
							)
						]
					)
				],
				[
					ir.ifThen(
						ir.source('runtime.redrawRequested'),
						[ir.yieldStatement(ir.source('Signals.TICK'))],
						[ir.yieldStatement(ir.source('Signals.YIELD'))]
					)
				]
			)
		];
	}

	/**
	 * Expression of a block that holds a single value, such as a number or text
	 * block, or null when the block is not one.
	 * @param {object} block Block to check.
	 * @returns {?object} Expression of the value.
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

		return ir.literal(String(block.fields[fieldNames[0]].value));
	}

	/**
	 * Emit the arguments object a primitive is called with.
	 * @param {object} block Block whose fields and inputs to emit.
	 * @returns {{statements: Array.<object>, source: object}} Arguments source.
	 */
	buildArguments (block) {
		const parts = [];
		const statements = [];
		const fields = block.fields || {};
		const inputs = block.inputs || {};
		const argumentsInfo = this.runtime.getBlockArguments(block.opcode);
		let first = true;

		const add = part => {
			if (!first) parts.push(', ');
			first = false;
			parts.push(part);
		};

		// The interpreter gives every primitive the block's mutation, which an extension block
		// reads for state such as the layout the project gave it.
		if (block.mutation) {
			add(`${quote('mutation')}: ${JSON.stringify(block.mutation)}`);
		}

		for (const name of Object.keys(fields)) {
			const field = fields[name];

			if (name === 'VARIABLE' || name === 'LIST' || name === 'BROADCAST_OPTION') {
				add(`${quote(name)}: {id: ${quote(field.id ?? null)}, name: ${quote(field.value ?? null)}}`);
			} else {
				add(`${quote(name)}: ${quote(field.value)}`);
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
				add(`${quote(name)}: {blockId: ${quote(input.block || null)}, type: ${quote(blockInputType)}}`);
				continue;
			}

			const childId = input.block ?? input.shadow;

			if (!childId) {
				continue;
			}

			const child = this.getBlock(childId);

			if (name === 'BROADCAST_INPUT') {
				const option = this.broadcastOption(block);

				statements.push(...option.statements);
				add(ir.source(['BROADCAST_OPTION: ', option.source]));
			} else {
				const value = this.expression(child);

				statements.push(...value.statements);
				add(ir.source([quote(name), ': ', value.source]));
			}
		}

		return {statements, source: ir.source(['{', ...parts, '}'])};
	}

	/**
	 * Emit an input's value.
	 * @param {object} block Block owning the input.
	 * @param {string} name Name of the input.
	 * @returns {{statements: Array.<object>, source: object}} Expression source.
	 */
	input (block, name) {
		const input = (block.inputs || {})[name];

		if (!input) {
			return {statements: [], source: ir.literal(undefined)};
		}

		const childId = input.block ?? input.shadow;

		if (!childId) {
			return {statements: [], source: ir.literal(undefined)};
		}

		return this.expression(this.getBlock(childId));
	}

	/**
	 * Emit several inputs, evaluated in the order the block lists them.
	 * @param {object} block Block owning the inputs.
	 * @param {Array.<string>} names Names of the inputs.
	 * @returns {{statements: Array.<object>, sources: object.<string, object>}} Input sources.
	 */
	inputs (block, names) {
		const order = Object.keys(block.inputs || {});
		const sorted = names.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
		const statements = [];
		const sources = Object.create(null);

		for (const name of sorted) {
			const input = this.input(block, name);

			statements.push(...input.statements);
			sources[name] = input.source;
		}

		return {statements, sources};
	}

	/**
	 * Whether an expression carries a value.
	 * @param {object} expression Expression to check.
	 * @returns {boolean} True unless the expression is `undefined`.
	 */
	hasValue (expression) {
		return !(expression.type === 'literal' && typeof expression.value === 'undefined');
	}

	/**
	 * Source of a field's value.
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
	 * Emit the message a broadcast block sends.
	 * @param {object} block Block owning the BROADCAST_INPUT input.
	 * @returns {{statements: Array.<object>, source: object}} Source of the message.
	 */
	broadcastOption (block) {
		const input = (block.inputs || {}).BROADCAST_INPUT;
		const childId = input && (input.block ?? input.shadow);

		if (!childId) {
			return {statements: [], source: ir.source('{id: null, name: null}')};
		}

		const child = this.getBlock(childId);
		const menu = (child.fields || {}).BROADCAST_OPTION;

		// The dropdown is a menu block: its field holds the message id and name.
		if (menu && !this.runtime.getOpcodeFunction(child.opcode)) {
			return {
				statements: [],
				source: ir.source([
					'{id: ', ir.literal(menu.id ?? null), ', name: ', ir.literal(menu.value ?? null), '}'
				])
			};
		}

		const message = this.expression(child);

		return {
			statements: message.statements,
			source: ir.source(['{id: null, name: Cast.toString(', message.source, ')}'])
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
	 * Field that names the variable a block uses.
	 * @param {object} block Block owning the field.
	 * @param {string} name Name of the field.
	 * @returns {object} The field.
	 */
	variableField (block, name) {
		const field = (block.fields || {})[name];

		if (!field) {
			throw new CompilerError(`Block "${block.id}" has no ${name} field.`, {
				code: 'E_MISSING_FIELD',
				hint: 'The script was compiled from a malformed block.'
			});
		}

		return field;
	}

	/**
	 * Identifier holding the variable a block refers to.
	 *
	 * The lookup runs once when the script starts, not once per block, so reads
	 * and writes compile to a property access.
	 * @param {object} block Block owning the VARIABLE field.
	 * @param {string} name Name of the field.
	 * @returns {string} Identifier of the variable.
	 */
	variableReference (block, name) {
		const field = this.variableField(block, name);

		return this.utility.declare(
			`variable:${field.id ?? field.value}`,
			'variable',
			`target.lookupOrCreateVariable(${quote(field.id ?? null)}, ${quote(field.value ?? '')})`
		);
	}

	/**
	 * Lookup of the variable a block refers to.
	 * @param {object} block Block owning the VARIABLE field.
	 * @param {string} name Name of the field.
	 * @returns {object} Expression of the variable lookup.
	 */
	variable (block, name) {
		const field = this.variableField(block, name);

		return ir.variable(field.id ?? null, field.value ?? '', this.variableReference(block, name));
	}

	/**
	 * Read of the variable a block refers to.
	 * @param {object} block Block owning the VARIABLE field.
	 * @param {string} name Name of the field.
	 * @returns {object} Expression of the variable's value.
	 */
	variableValue (block, name) {
		const field = this.variableField(block, name);

		return ir.variableValue(field.id ?? null, field.value ?? '', this.variableReference(block, name));
	}

	/**
	 * Emit an expression as a number.
	 *
	 * A literal is converted while the script is compiled, so the generated code
	 * holds the number itself. An expression already known to produce a number is
	 * left alone, and everything else is converted at runtime.
	 * @param {object} expression Expression to convert.
	 * @returns {object} Expression that evaluates to a number.
	 */
	number (expression) {
		if (!expression) return ir.number(0);
		if (expression.type === 'number') return expression;

		if (expression.type === 'literal') {
			return ir.number(Cast.toNumber(expression.value));
		}

		return ir.cast('number', expression);
	}

	/**
	 * Emit an expression as a boolean.
	 * @param {object} expression Expression to convert.
	 * @returns {object} Expression that evaluates to a boolean.
	 */
	boolean (expression) {
		if (!expression) return ir.literal(false);
		if (expression.type === 'literal') return ir.literal(Cast.toBoolean(expression.value));

		return ir.cast('boolean', expression);
	}

	/**
	 * Emit the argument a block reports.
	 * @param {object} block Argument reporter block.
	 * @returns {{statements: Array.<object>, source: object}} Expression source.
	 */
	argument (block) {
		const field = (block.fields || {}).VALUE;
		const local = this.currentArguments && field && this.currentArguments.get(field.value);

		// Argument reporters outside a procedure report 0, like the engine does.
		return {statements: [], source: ir.source([local || '0'])};
	}

	/**
	 * Emit the value a procedure returns.
	 * @param {object} block The return block.
	 * @returns {{statements: Array.<object>}} Statement nodes.
	 */
	returnValue (block) {
		const value = this.input(block, 'VALUE');
		const returned = this.hasValue(value.source) ? value.source : ir.literal('');

		return {statements: [...value.statements, ir.returnStatement(returned)]};
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
	 * Render an expression as JavaScript, for extension compilation functions.
	 * @param {object} expression Expression to render.
	 * @returns {string} Source of the expression.
	 */
	render (expression) {
		return transpile.renderExpression(expression);
	}

	/**
	 * Render statements as JavaScript lines, for extension compilation functions.
	 * @param {Array.<object>} statements Statements to render.
	 * @returns {Array.<string>} Source lines.
	 */
	renderStatements (statements) {
		return transpile.renderStatements(statements, 0);
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

		/**
		 * Variables that cannot change while the project runs, with the value
		 * compiled scripts use instead of reading them.
		 * @type {?Map.<string, {value: *}>}
		 */
		this.variableAnalysis = null;

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
	 * Find the variables that no block in the project writes.
	 *
	 * The value of such a variable cannot change while the project runs, so
	 * compiled scripts can read it as a literal instead of looking it up. Cloud
	 * variables and variables a monitor can change are left out.
	 * @returns {Map.<string, {value: *}>} Constant values by variable id.
	 */
	analyzeVariables () {
		if (this.variableAnalysis) {
			return this.variableAnalysis;
		}

		const constants = new Map();
		const written = new Set();
		const mutable = new Set();

		for (const target of this.runtime.targets) {
			for (const variable of Object.values(target.variables || {})) {
				constants.set(variable.id, {value: variable.value});

				if (variable.isCloud) mutable.add(variable.id);
			}

			if (!target.blocks) continue;

			for (const block of target.blocks.getBlocksList()) {
				const field = (block.fields || {}).VARIABLE;

				if (!field) continue;

				if (VARIABLE_WRITE_OPCODES.has(block.opcode)) {
					written.add(field.id);
				} else if (block.opcode === 'data_showvariable') {
					// Showing a variable lets the user change it in its monitor.
					mutable.add(field.id);
				}
			}
		}

		for (const target of this.runtime.targets) {
			for (const block of target.blocks ? target.blocks.getBlocksList() : []) {
				const field = (block.fields || {}).LIST;

				if (field && block.opcode === 'data_showlist') mutable.add(field.id);
			}
		}

		for (const block of this.runtime.monitorBlocks.getBlocksList()) {
			const field = (block.fields || {}).VARIABLE;

			if (field && block.isMonitored) mutable.add(field.id);
		}

		for (const id of written) constants.delete(id);
		for (const id of mutable) constants.delete(id);

		this.variableAnalysis = constants;

		return constants;
	}

	/**
	 * Compile a script.
	 * @param {RenderedTarget} target Target owning the script.
	 * @param {string} scriptId Id of the script's first block.
	 * @returns {object} The compiled script.
	 */
	compileScript (target, scriptId) {
		const emitter = new ScriptEmitter(
			this.runtime,
			target,
			scriptId,
			this.functions,
			{constants: this.analyzeVariables()}
		);
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
		this.variableAnalysis = null;
	}

	/**
	 * Drop the compiled scripts of a block container and give its running
	 * threads the scripts compiled from its current blocks.
	 *
	 * A thread keeps the generator of the script it started, so an edit made
	 * while the script runs would otherwise keep running the old JavaScript.
	 * The replacement script starts from the top on the thread's next step.
	 * @param {Blocks} blocks Container whose blocks changed.
	 */
	recompileRunningScripts (blocks) {
		this.invalidateCache(blocks);

		const threads = this.runtime.threads.filter(thread =>
			thread.isCompiled && !thread.isKilled && thread.blockContainer === blocks);

		for (const thread of threads) {
			const script = this.getCompiledScript(thread.target, blocks, thread.topBlock);

			// A script that no longer compiles keeps running what it has.
			if (script) thread.replaceScript(script);
		}
	}

	/**
	 * Drop every compiled script, for changes that can affect all of them such
	 * as loading an extension.
	 */
	invalidateAll () {
		this.cache = new WeakMap();
		this.variableAnalysis = null;
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
