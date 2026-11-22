const BlockUtility = require('../engine/block-utility');

/**
 * Block utility for primitives called by compiled scripts.
 *
 * Compiled scripts have no block stack for the sequencer to step, so the
 * operations a primitive uses to hand control back to the engine have to be
 * recorded instead. The compiled script acts on them once the primitive
 * returns: it runs the requested branch, ends the script, or returns from the
 * procedure, which is what the interpreter does with the same primitive.
 *
 * Every call into a primitive pushes a stack frame for the duration of the
 * block, so `stackFrame` holds that block's own state exactly as it does for an
 * interpreted block.
 */
class CompilerCompatibleBlockUtility extends BlockUtility {
	/**
	 * @param {Sequencer} sequencer Sequencer stepping the thread.
	 * @param {Thread} thread Thread running the compiled script.
	 */
	constructor (sequencer, thread) {
		super(sequencer, thread);

		/**
		 * Id of the block the primitive is currently running.
		 * @type {?string}
		 */
		this.currentBlockId = null;

		/**
		 * Branch the primitive asked the engine to run, or null.
		 * @type {?{blockId: ?string, isLoop: boolean}}
		 */
		this.branch = null;

		/**
		 * Whether the primitive asked to end the script.
		 * @type {boolean}
		 */
		this.stopped = false;

		/**
		 * Whether the primitive asked to return from the procedure.
		 * @type {boolean}
		 */
		this.returned = false;

		/**
		 * Value the primitive asked to return from the procedure.
		 * @type {*}
		 */
		this.returnValue = '';

		/**
		 * Procedure the primitive asked to start, with the parameters it was given.
		 * @type {?{procedureCode: string, params: object}}
		 */
		this.startedProcedure = null;

		/**
		 * Procedure the primitive asked to run for its value, with the parameters it was given.
		 * @type {?{procedureCode: string, params: object}}
		 */
		this.startedReturningProcedure = null;

		/**
		 * Value the procedure the primitive started for its value returned, or null when it has not
		 * returned yet.
		 * @type {*}
		 */
		this.returnedProcedureValue = null;
	}

	/**
	 * Depth of the thread's stack, for restoring it after a procedure returns
	 * from the middle of a block.
	 * @returns {number} Number of stack frames in use.
	 */
	frameDepth () {
		return this.thread.stack.length;
	}

	/**
	 * Drop stack frames until the thread is back at a known depth.
	 * @param {number} depth Depth to return to.
	 */
	unwindTo (depth) {
		while (this.thread.stack.length > depth) {
			this.thread.popStack();
		}

		this.currentBlockId = null;
	}

	/**
	 * Start running a block: give it its own stack frame and clear anything a
	 * previous block left behind.
	 * @param {string} blockId Id of the block being run.
	 */
	enterBlock (blockId) {
		this.currentBlockId = blockId;
		this.branch = null;
		this.stopped = false;
		this.returned = false;
		this.returnValue = '';
		this.startedProcedure = null;
		this.startedReturningProcedure = null;
		this.returnedProcedureValue = null;
		this.thread.pushStack(blockId);
	}

	/**
	 * Finish running a block and release its stack frame.
	 */
	leaveBlock () {
		this.thread.popStack();
		this.currentBlockId = null;
	}

	/**
	 * Take the branch the primitive asked for.
	 * @returns {?{blockId: ?string, isLoop: boolean}} The requested branch.
	 */
	takeBranch () {
		const branch = this.branch;
		this.branch = null;
		return branch;
	}

	/**
	 * Take the value the primitive asked to return.
	 * @returns {*} Value to return from the procedure.
	 */
	takeReturnValue () {
		this.returned = false;
		return this.returnValue;
	}

	/**
	 * Record a branch for the compiled script to run.
	 * @param {number} branchNum Which branch to run.
	 * @param {boolean} isLoop Whether the branch is a loop body.
	 */
	startBranch (branchNum, isLoop) {
		const blocks = this.thread.target.blocks;
		const blockId = blocks.getBranch(this.currentBlockId, branchNum);

		this.branch = {
			blockId: blockId || null,
			isLoop: Boolean(isLoop)
		};
	}

	/**
	 * Record a block input for the compiled script to run.
	 * @param {object} blockInput Description of the block input.
	 */
	startBlockInput (blockInput) {
		this.branch = {
			blockId: (blockInput && blockInput.blockId) || null,
			isLoop: false
		};
	}

	/**
	 * Start a procedure on the thread running the compiled script.
	 *
	 * A compiled script has no block stack for the sequencer to step into, so the
	 * procedure is recorded with the parameters the primitive pushed, and the
	 * compiled script runs the compiled procedure where it called the primitive.
	 * @param {string} procedureCode Procedure code of the procedure to start.
	 */
	startProcedure (procedureCode) {
		this.startedProcedure = {
			procedureCode,
			params: Object.assign({}, this.thread.peekStackFrame().params)
		};
	}

	/**
	 * Take the procedure the primitive asked to start.
	 * @returns {?{procedureCode: string, params: object}} The procedure, or null.
	 */
	takeStartedProcedure () {
		const started = this.startedProcedure;
		this.startedProcedure = null;
		return started;
	}

	/**
	 * Start a procedure whose value the primitive reports.
	 *
	 * The first call records the procedure for the compiled script to run, and the block is run
	 * again once the procedure returns so that this call hands it the value.
	 * @param {string} procedureCode Procedure code of the procedure to start.
	 * @returns {*} The value the procedure returned, or an empty value until it has run.
	 */
	startProcedureReturning (procedureCode) {
		if (this.returnedProcedureValue !== null) {
			const value = this.returnedProcedureValue;
			this.returnedProcedureValue = null;
			return value;
		}

		this.startedReturningProcedure = {
			procedureCode,
			params: Object.assign({}, this.thread.peekStackFrame().params)
		};

		return '';
	}

	/**
	 * Take the procedure the primitive asked to run for its value.
	 * @returns {?{procedureCode: string, params: object}} The procedure, or null.
	 */
	takeStartedReturningProcedure () {
		const started = this.startedReturningProcedure;
		this.startedReturningProcedure = null;
		return started;
	}

	/**
	 * Keep the value a procedure returned, for the block which started it to report.
	 * @param {*} value Value the procedure returned.
	 */
	setReturnedProcedureValue (value) {
		this.returnedProcedureValue = value;
	}

	/**
	 * Ask the compiled script to end the script.
	 */
	stopThisScript () {
		this.stopped = true;
	}

	/**
	 * Ask the compiled script to return from the procedure it runs.
	 * @param {*} value Value the procedure reports.
	 */
	returnFromProcedure (value) {
		this.returned = true;
		this.returnValue = value;
	}
}

module.exports = CompilerCompatibleBlockUtility;
