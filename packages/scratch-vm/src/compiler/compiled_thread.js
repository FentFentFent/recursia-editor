const CompilerCompatibleBlockUtility = require('./compiler-compatible-block-utility');
const log = require('../util/log');
const Thread = require('../engine/thread');
const Timer = require('../util/timer');

/**
 * Values a compiled script yields back to the engine.
 *
 * A compiled script is a generator so it can hand control back to the sequencer
 * without unwinding the code it has already run, the same way an interpreted
 * thread keeps its stack between frames.
 * @type {object}
 */
const Signals = Object.freeze({
	/**
	 * Give other threads a turn. The script resumes after them.
	 */
	YIELD: Object.freeze({type: 'yield'}),

	/**
	 * Give other threads a turn and resume on the next tick.
	 */
	TICK: Object.freeze({type: 'tick'}),

	/**
	 * Create a signal for a promise the script has to wait on.
	 * @param {Promise} promise Promise the script is waiting for.
	 * @returns {object} Signal wrapping the promise.
	 */
	promise: promise => ({type: 'promise', promise})
});

/**
 * A thread running a script compiled by the Gamma compiler.
 *
 * Compiled threads keep the thread interface the runtime already depends on
 * (statuses, stack, glow) and drive a generator instead of stepping blocks.
 */
class CompiledThread extends Thread {
	/**
	 * @param {Thread} thread Thread the script was compiled for.
	 * @param {object} script Compiled script.
	 */
	constructor (thread, script) {
		super(thread.topBlock);

		this.target = thread.target;
		this.blockContainer = thread.blockContainer;
		this.stackClick = thread.stackClick;
		this.updateMonitor = thread.updateMonitor;
		this.pushStack(thread.topBlock);

		/**
		 * The compiled script this thread runs.
		 * @type {object}
		 */
		this.script = script;

		/**
		 * Generator produced by the compiled script, created on the first step.
		 * @type {?Generator}
		 */
		this.generator = null;

		/**
		 * Value the promise the script is waiting on resolved to.
		 * @type {*}
		 */
		this.resumeValue = undefined;

		this.isCompiled = true;
	}

	/**
	 * Step this thread once, resuming the compiled script where it left off.
	 * @param {Sequencer} sequencer Sequencer stepping this thread.
	 */
	step (sequencer) {
		if (this.status === Thread.STATUS_YIELD) {
			this.status = Thread.STATUS_RUNNING;
		}

		if (this.status !== Thread.STATUS_RUNNING) {
			return;
		}

		const frame = this.peekStackFrame();

		// Warp procedures check the warp timer from inside the compiled script,
		// so a script that can run in warp mode needs one for the step.
		if (!this.warpTimer && (this.script.warp || (frame && frame.warpMode))) {
			this.warpTimer = new Timer();
			this.warpTimer.start();
		}

		if (!this.generator) {
			// The compiled script keeps the utility it was created with, so the
			// thread does not need to hold on to it.
			this.generator = this.script.create({
				runtime: sequencer.runtime,
				target: this.target,
				thread: this,
				util: new CompilerCompatibleBlockUtility(sequencer, this),
				sequencer
			});
		}

		const result = this.generator.next(this.resumeValue);
		this.resumeValue = undefined;

		if (result.done) {
			this.finish();
			return;
		}

		const signal = result.value;

		if (signal && signal.type === 'promise') {
			this.awaitPromise(signal.promise);
		} else if (signal && signal.type === 'tick') {
			this.status = Thread.STATUS_YIELD_TICK;
		} else {
			// Give the other threads their turn. The thread stays runnable so the
			// sequencer steps it again in this frame while there is work time left,
			// the same way a block that yields is handled for interpreted threads.
			this.status = Thread.STATUS_RUNNING;
		}
	}

	/**
	 * Suspend the thread until the promise the script is waiting on resolves.
	 * @param {Promise} promise Promise the script is waiting for.
	 */
	awaitPromise (promise) {
		this.status = Thread.STATUS_PROMISE_WAIT;

		// A script replaced while it waits has already moved past the promise.
		const script = this.script;

		Promise.resolve(promise).then(value => {
			if (this.isKilled || this.status === Thread.STATUS_DONE || this.script !== script) return;

			this.resumeValue = value;
			this.status = Thread.STATUS_RUNNING;
		}, reason => {
			if (this.isKilled || this.status === Thread.STATUS_DONE || this.script !== script) return;

			log.warn('Compiled script promise rejected: ', reason);
			this.resumeValue = undefined;
			this.status = Thread.STATUS_RUNNING;
		});
	}

	/**
	 * Replace the compiled script this thread runs.
	 *
	 * The thread starts the new script from the top on its next step, with a
	 * new utility, so it runs the JavaScript compiled from the blocks as they
	 * are now. Frames the old script left on the stack belong to blocks that
	 * may no longer exist, so they are dropped.
	 * @param {object} script Compiled script.
	 */
	replaceScript (script) {
		this.script = script;
		this.generator = null;
		this.resumeValue = undefined;

		while (this.stack.length > 1) {
			this.popStack();
		}

		// The thread no longer waits for whatever the old script was awaiting.
		if (this.status !== Thread.STATUS_DONE) {
			this.status = Thread.STATUS_RUNNING;
		}

		this.warpTimer = null;
	}

	/**
	 * End the script and release the thread's stack.
	 */
	finish () {
		while (this.stack.length > 0) {
			this.popStack();
		}

		this.status = Thread.STATUS_DONE;
	}
}

module.exports = CompiledThread;
module.exports.Signals = Signals;
