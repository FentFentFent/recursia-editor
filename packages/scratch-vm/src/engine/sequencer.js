const Timer = require('../util/timer');
const Thread = require('./thread');
const execute = require('./execute.js');

/**
 * Profiler frame name for stepping a single thread.
 * @constant {string}
 */
const stepThreadProfilerFrame = 'Sequencer.stepThread';

/**
 * Profiler frame name for the inner loop of stepThreads.
 * @constant {string}
 */
const stepThreadsInnerProfilerFrame = 'Sequencer.stepThreads#inner';

/**
 * Profiler frame name for execute.
 * @constant {string}
 */
const executeProfilerFrame = 'execute';

/**
 * Profiler frame ID for stepThreadProfilerFrame.
 * @type {number}
 */
let stepThreadProfilerId = -1;

/**
 * Profiler frame ID for stepThreadsInnerProfilerFrame.
 * @type {number}
 */
let stepThreadsInnerProfilerId = -1;

/**
 * Profiler frame ID for executeProfilerFrame.
 * @type {number}
 */
let executeProfilerId = -1;

class Sequencer {
    constructor (runtime) {
        /**
         * A utility timer for timing thread sequencing.
         * @type {!Timer}
         */
        this.timer = new Timer();

        /**
         * Reference to the runtime owning this sequencer.
         * @type {!Runtime}
         */
        this.runtime = runtime;

        this.activeThread = null;

        /**
         * Whether a procedure returned its value to a call that may have
         * already taken its turn in the current pass.
         * @type {boolean}
         */
        this.resumedProcedureCaller = false;
    }

    /**
     * Time to run a warp-mode thread, in ms.
     * @type {number}
     */
    static get WARP_TIME () {
        return 500;
    }

    /**
     * Step through all threads in `this.runtime.threads`, running them in order.
     * @returns {Array.<!Thread>} List of inactive threads after stepping.
     */
    stepThreads () {
        // Work time is 75% of the thread stepping interval.
        const WORK_TIME = 0.75 * this.runtime.currentStepTime;
        // For compatibility with Scatch 2, update the millisecond clock
        // on the Runtime once per step (see Interpreter.as in Scratch 2
        // for original use of `currentMSecs`)
        this.runtime.updateCurrentMSecs();
        // Start counting toward WORK_TIME.
        this.timer.start();
        // Count of active threads.
        let numActiveThreads = Infinity;
        // Whether `stepThreads` has run through a full single tick.
        let ranFirstTick = false;
        const doneThreads = [];
        // Conditions for continuing to stepping threads:
        // 1. We must have threads in the list, and some must be active.
        // 2. Time elapsed must be less than WORK_TIME.
        // 3. Either turbo mode, or no redraw has been requested by a primitive.
        while (this.runtime.threads.length > 0 &&
               numActiveThreads > 0 &&
               this.timer.timeElapsed() < WORK_TIME &&
               (this.runtime.turboMode || !this.runtime.redrawRequested)) {
            if (this.runtime.profiler !== null) {
                if (stepThreadsInnerProfilerId === -1) {
                    stepThreadsInnerProfilerId = this.runtime.profiler.idByName(stepThreadsInnerProfilerFrame);
                }
                this.runtime.profiler.start(stepThreadsInnerProfilerId);
            }

            numActiveThreads = 0;
            let stoppedThread = false;
            // Attempt to run each thread one time.
            const threads = this.runtime.threads;
            for (let i = 0; i < threads.length; i++) {
                const activeThread = this.activeThread = threads[i];
                // Check if the thread is done so it is not executed.
                if (activeThread.stack.length === 0 ||
                    activeThread.status === Thread.STATUS_DONE) {
                    // Finished with this thread.
                    stoppedThread = true;
                    continue;
                }
                if (activeThread.status === Thread.STATUS_YIELD_TICK &&
                    !ranFirstTick) {
                    // Clear single-tick yield from the last call of `stepThreads`.
                    activeThread.status = Thread.STATUS_RUNNING;
                }
                if (activeThread.status === Thread.STATUS_RUNNING ||
                    activeThread.status === Thread.STATUS_YIELD) {
                    // Normal-mode thread: step.
                    if (this.runtime.profiler !== null) {
                        if (stepThreadProfilerId === -1) {
                            stepThreadProfilerId = this.runtime.profiler.idByName(stepThreadProfilerFrame);
                        }

                        // Increment the number of times stepThread is called.
                        this.runtime.profiler.increment(stepThreadProfilerId);
                    }
                    this.stepThread(activeThread);
                    activeThread.warpTimer = null;
                    if (activeThread.isKilled) {
                        i--; // if the thread is removed from the list (killed), do not increase index
                    }
                }
                if (activeThread.status === Thread.STATUS_RUNNING) {
                    numActiveThreads++;
                }
                // Check if the thread completed while it just stepped to make
                // sure we remove it before the next iteration of all threads.
                if (activeThread.stack.length === 0 ||
                    activeThread.status === Thread.STATUS_DONE) {
                    // Finished with this thread.
                    stoppedThread = true;
                }
            }
            // We successfully ticked once. Prevents running STATUS_YIELD_TICK
            // threads on the next tick.
            ranFirstTick = true;

            if (this.runtime.profiler !== null) {
                this.runtime.profiler.stop();
            }

            // Filter inactive threads from `this.runtime.threads`.
            if (stoppedThread) {
                let nextActiveThread = 0;
                for (let i = 0; i < this.runtime.threads.length; i++) {
                    const thread = this.runtime.threads[i];
                    if (thread.stack.length !== 0 &&
                        thread.status !== Thread.STATUS_DONE) {
                        this.runtime.threads[nextActiveThread] = thread;
                        nextActiveThread++;
                    } else {
                        // Resume the parent thread after a cross-boundary procedure finishes.
                        if (thread.procedureParent) {
                            const parentThread = thread.procedureParent;

                            if (parentThread.status === Thread.STATUS_PROMISE_WAIT) {
                                parentThread.status = Thread.STATUS_RUNNING;
                            }

                            thread.procedureParent = null;
                        }

                        // A procedure that ends without returning still has to
                        // report a value to the call waiting on it.
                        this._resolveProcedureReturn(thread);

                        doneThreads.push(thread);
                    }
                }
                this.runtime.threads.length = nextActiveThread;
            }

            // A procedure can return after its call's thread took its turn in
            // this pass, which leaves that thread runnable but not counted.
            // Step again so the call resumes in the same step as the return.
            if (this.resumedProcedureCaller) {
                this.resumedProcedureCaller = false;
                numActiveThreads = Math.max(numActiveThreads, 1);
            }
        }

        this.activeThread = null;

        return doneThreads;
    }

    /**
     * Step the requested thread for as long as necessary.
     * @param {!Thread} thread Thread object to step.
     */
    stepThread (thread) {
        let currentBlockId = thread.peekStack();
        if (!currentBlockId) {
            // A "null block" - empty branch.
            thread.popStack();

            // Did the null follow a hat block?
            if (thread.stack.length === 0) {
                thread.status = Thread.STATUS_DONE;
                return;
            }
        }
        // Save the current block ID to notice if we did control flow.
        while ((currentBlockId = thread.peekStack())) {
            let isWarpMode = thread.peekStackFrame().warpMode;
            if (isWarpMode && !thread.warpTimer) {
                // Initialize warp-mode timer if it hasn't been already.
                // This will start counting the thread toward `Sequencer.WARP_TIME`.
                thread.warpTimer = new Timer();
                thread.warpTimer.start();
            }
            // Execute the current block.
            if (this.runtime.profiler !== null) {
                if (executeProfilerId === -1) {
                    executeProfilerId = this.runtime.profiler.idByName(executeProfilerFrame);
                }

                // Increment the number of times execute is called.
                this.runtime.profiler.increment(executeProfilerId);
            }
            if (thread.target === null) {
                this.retireThread(thread);
            } else {
                execute(this, thread);
            }
            thread.blockGlowInFrame = currentBlockId;
            // If the thread has yielded or is waiting, yield to other threads.
            if (thread.status === Thread.STATUS_YIELD) {
                // Mark as running for next iteration.
                thread.status = Thread.STATUS_RUNNING;
                // In warp mode, yielded blocks are re-executed immediately.
                if (isWarpMode &&
                    thread.warpTimer.timeElapsed() <= Sequencer.WARP_TIME) {
                    continue;
                }
                return;
            } else if (thread.status === Thread.STATUS_PROMISE_WAIT) {
                // A promise was returned by the primitive. Yield the thread
                // until the promise resolves. Promise resolution should reset
                // thread.status to Thread.STATUS_RUNNING.
                return;
            } else if (thread.status === Thread.STATUS_YIELD_TICK) {
                // stepThreads will reset the thread to Thread.STATUS_RUNNING
                return;
            }
            // If no control flow has happened, switch to next block.
            if (thread.peekStack() === currentBlockId) {
                thread.goToNextBlock();
            }
            // If no next block has been found at this point, look on the stack.
            while (!thread.peekStack()) {
                thread.popStack();

                if (thread.stack.length === 0) {
                    // No more stack to run!
                    thread.status = Thread.STATUS_DONE;
                    return;
                }

                const stackFrame = thread.peekStackFrame();
                isWarpMode = stackFrame.warpMode;

                if (stackFrame.isLoop) {
                    // The current level of the stack is marked as a loop.
                    // Return to yield for the frame/tick in general.
                    // Unless we're in warp mode - then only return if the
                    // warp timer is up.
                    if (!isWarpMode ||
                        thread.warpTimer.timeElapsed() > Sequencer.WARP_TIME) {
                        // Don't do anything to the stack, since loops need
                        // to be re-executed.
                        return;
                    }
                    // Don't go to the next block for this level of the stack,
                    // since loops need to be re-executed.
                    continue;

                } else if (stackFrame.waitingReporter) {
                    // This level of the stack was waiting for a value.
                    // This means a reporter has just returned - so don't go
                    // to the next block for this level of the stack.
                    return;
                }
                // Get next block of existing block on the stack.
                thread.goToNextBlock();
            }
        }
    }

    /**
     * Step a thread into a block's branch.
     * @param {!Thread} thread Thread object to step to branch.
     * @param {number} branchNum Which branch to step to (i.e., 1, 2).
     * @param {boolean} isLoop Whether this block is a loop.
     */
    stepToBranch (thread, branchNum, isLoop) {
        if (!branchNum) {
            branchNum = 1;
        }
        const currentBlockId = thread.peekStack();
        const branchId = thread.target.blocks.getBranch(
            currentBlockId,
            branchNum
        );
        thread.peekStackFrame().isLoop = isLoop;
        if (branchId) {
            // Push branch ID to the thread's stack.
            thread.pushStack(branchId);
        } else {
            thread.pushStack(null);
        }
    }

    /**
     * Step a procedure across a module (sprite) boundary.
     *
     * Creates a new thread under the requested block's target.
     * The calling thread waits until the new thread finishes.
     *
     * @param {!Thread} callerThread Thread calling the procedure.
     * @param {!string} procedureCode Procedure code to execute.
     * @returns {boolean} Whether a procedure was found and started.
     */
    stepToProcedureCrossBoundary(callerThread,procedureCode) {
        const callerTarget = callerThread.target;

        if (!callerTarget || !Array.isArray(callerTarget.dependencies)) {
            return false;
        }

        // Resolve the procedure through the caller's dependencies.
        const found = this._findProcedureDefinition(callerThread, procedureCode);

        if (!found) {
            return false;
        }

        const calleeThread = this._startProcedureThread(
            callerThread,
            found.definition,
            found.target,
            procedureCode
        );

        // Track the calling thread so it can resume when this one finishes.
        calleeThread.procedureParent = callerThread;

        // Suspend the calling thread.
        callerThread.status = Thread.STATUS_PROMISE_WAIT;

        // Schedule the procedure thread.
        this.runtime.threads.push(calleeThread);

        return true;
    }

    /**
     * Find a procedure definition for a call: first on the calling target, then
     * on the targets it depends on.
     * @param {!Thread} callerThread Thread calling the procedure.
     * @param {!string} procedureCode Procedure code being called.
     * @returns {?{definition: string, target: Target}} The definition block and
     *     the target owning it, or null if the procedure was not found.
     */
    _findProcedureDefinition (callerThread, procedureCode) {
        const callerTarget = callerThread.target;

        if (!callerTarget || !callerTarget.blocks) {
            return null;
        }

        const localDefinition = callerTarget.blocks.getProcedureDefinition(procedureCode);
        if (localDefinition) {
            return {definition: localDefinition, target: callerTarget};
        }

        if (!Array.isArray(callerTarget.dependencies)) {
            return null;
        }

        for (const dependencyId of callerTarget.dependencies) {
            const dependencyTarget = this.runtime.getTargetById(dependencyId);

            if (!dependencyTarget || !dependencyTarget.blocks) {
                continue;
            }

            const definition = dependencyTarget.blocks.getProcedureDefinition(procedureCode);
            if (definition) {
                return {definition, target: dependencyTarget};
            }
        }

        return null;
    }

    /**
     * Start a procedure on a thread of its own, moving the call's parameters
     * onto it.
     *
     * The thread starts at the procedure definition, above a frame standing in
     * for the call itself. Stepping off the definition replaces its frame with
     * the first block of the body, and frames are reset when they are reused, so
     * the parameters have to live below the definition.
     * @param {!Thread} callerThread Thread calling the procedure.
     * @param {!string} definition Id of the procedure definition block.
     * @param {!Target} procedureTarget Target owning the definition.
     * @param {!string} procedureCode Procedure code being called.
     * @returns {!Thread} The thread created for the procedure.
     */
    _startProcedureThread (callerThread, definition, procedureTarget, procedureCode) {
        const calleeThread = new Thread(definition);

        calleeThread.target = procedureTarget;
        calleeThread.blockContainer = procedureTarget.blocks;

        calleeThread.pushStack(null);
        calleeThread.pushStack(definition);

        // Transfer parameters from the procedure call: the callee does not
        // share the caller's stack, so the values move onto the call frame.
        const callerFrame = callerThread.peekStackFrame();
        if (callerFrame && callerFrame.params) {
            calleeThread.peekParentStackFrame().params = callerFrame.params;
            // The caller keeps its stack frame while it waits, so dropping the
            // values here keeps them from being visible once it resumes.
            callerFrame.params = null;
        }

        // Preserve the recursion context for subsequent procedure calls.
        calleeThread.procedureCallStack = [
            ...(callerThread.procedureCallStack || []),
            procedureCode
        ];

        if (this._isWarpProcedure(procedureTarget, definition)) {
            calleeThread.peekStackFrame().warpMode = true;
        }

        return calleeThread;
    }

    /**
     * Whether a procedure runs without screen refresh.
     * @param {!Target} procedureTarget Target owning the definition.
     * @param {!string} definition Id of the procedure definition block.
     * @returns {boolean} True if the procedure is in warp mode.
     */
    _isWarpProcedure (procedureTarget, definition) {
        const definitionBlock = procedureTarget.blocks.getBlock(definition);
        if (!definitionBlock) return false;

        const customBlockInput = definitionBlock.inputs.custom_block;
        if (!customBlockInput) return false;

        const prototypeBlock = procedureTarget.blocks.getBlock(customBlockInput.block);
        if (!prototypeBlock || !prototypeBlock.mutation) return false;

        const warp = prototypeBlock.mutation.warp;
        if (typeof warp === 'boolean') return warp;
        if (typeof warp === 'string') return JSON.parse(warp);
        return false;
    }

    /**
     * Step a procedure that reports a value back to the calling block.
     *
     * The procedure runs on its own thread and the calling block waits for the
     * value it returns.
     * @param {!Thread} callerThread Thread calling the procedure.
     * @param {!string} procedureCode Procedure code to execute.
     * @returns {?object} Thenable for the value the procedure returns, or null
     *     if the procedure was not found.
     */
    stepToReturningProcedure (callerThread, procedureCode) {
        const found = this._findProcedureDefinition(callerThread, procedureCode);

        if (!found) {
            return null;
        }

        const calleeThread = this._startProcedureThread(
            callerThread,
            found.definition,
            found.target,
            procedureCode
        );

        // The calling block waits on a thenable that the procedure resolves
        // from its return block. Resolving it directly, rather than through a
        // Promise, resumes the caller in the same sequencer step as the return
        // instead of on the next frame.
        const returned = {
            then: resolve => {
                calleeThread.procedureReturnResolve = resolve;
            }
        };

        // The calling block suspends its thread by returning this thenable.
        this.runtime.threads.push(calleeThread);

        return returned;
    }

    /**
     * End the procedure running on a thread, reporting a value to its call.
     *
     * The thread unwinds to the procedure call that started it. A call on the
     * caller's own thread continues after the call block; a call on its own
     * thread ends, and the value goes to the block waiting for it.
     * @param {!Thread} thread Thread running the procedure.
     * @param {*} value Value the call block should report.
     */
    returnFromProcedure (thread, value) {
        thread.returnValue = value;

        while (thread.stack.length > 0) {
            const block = thread.target.blocks.getBlock(thread.peekStack());
            if (block && block.opcode === 'procedures_call') break;
            thread.popStack();
        }

        if (thread.stack.length === 0) {
            thread.status = Thread.STATUS_DONE;
        }

        this._resolveProcedureReturn(thread);
    }

    /**
     * Hand a finished procedure's return value to the call waiting on it.
     * @param {!Thread} thread Thread that ran the procedure.
     */
    _resolveProcedureReturn (thread) {
        if (!thread.procedureReturnResolve) return;

        const resolve = thread.procedureReturnResolve;
        thread.procedureReturnResolve = null;
        resolve(thread.returnValue);

        this.resumedProcedureCaller = true;
    }


    /**
     * Step a procedure.
     * @param {!Thread} thread Thread object to step to procedure.
     * @param {!string} procedureCode Procedure code of procedure to step to.
     */
    stepToProcedure (thread, procedureCode) {
        const definition = thread.target.blocks.getProcedureDefinition(procedureCode);
        if (!definition) {

            this.stepToProcedureCrossBoundary(thread,procedureCode);
            return;
        }
        // Check if the call is recursive.
        // If so, set the thread to yield after pushing.
        const isRecursive = thread.isRecursiveCall(procedureCode);
        // To step to a procedure, we put its definition on the stack.
        // Execution for the thread will proceed through the definition hat
        // and on to the main definition of the procedure.
        // When that set of blocks finishes executing, it will be popped
        // from the stack by the sequencer, returning control to the caller.
        thread.pushStack(definition);
        // In known warp-mode threads, only yield when time is up.
        if (thread.peekStackFrame().warpMode &&
            thread.warpTimer.timeElapsed() > Sequencer.WARP_TIME) {
            thread.status = Thread.STATUS_YIELD;
        } else {
            // Look for warp-mode flag on definition, and set the thread
            // to warp-mode if needed.
            const definitionBlock = thread.target.blocks.getBlock(definition);
            const innerBlock = thread.target.blocks.getBlock(
                definitionBlock.inputs.custom_block.block);
            let doWarp = false;
            if (innerBlock && innerBlock.mutation) {
                const warp = innerBlock.mutation.warp;
                if (typeof warp === 'boolean') {
                    doWarp = warp;
                } else if (typeof warp === 'string') {
                    doWarp = JSON.parse(warp);
                }
            }
            if (doWarp) {
                thread.peekStackFrame().warpMode = true;
            } else if (isRecursive) {
                // In normal-mode threads, yield any time we have a recursive call.
                thread.status = Thread.STATUS_YIELD;
            }
        }
    }

    /**
     * Retire a thread in the middle, without considering further blocks.
     * @param {!Thread} thread Thread object to retire.
     */
    retireThread (thread) {
        thread.stack = [];
        thread.stackFrame = [];
        thread.requestScriptGlowInFrame = false;
        thread.status = Thread.STATUS_DONE;
        this._resolveProcedureReturn(thread);
    }
}

module.exports = Sequencer;
