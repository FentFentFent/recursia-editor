/**
 * Whether a procedure call block calls a procedure that reports a value.
 * @param {object} args Arguments of the call block.
 * @returns {boolean} True if the call is used as a reporter.
 */
const isReturningCall = function (args) {
    const returns = args.mutation && args.mutation.returns;
    return returns === 'true' || returns === true;
};

class Scratch3ProcedureBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
    }

    /**
     * Retrieve the block primitives implemented by this package.
     * @returns {object.<string, Function>} Mapping of opcode to Function.
     */
    getPrimitives () {
        return {
            procedures_definition: this.definition,
            procedures_call: this.call,
            procedures_return: this.proceduresReturn,
            argument_reporter_string_number: this.argumentReporterStringNumber,
            argument_reporter_boolean: this.argumentReporterBoolean
        };
    }

    definition () {
        // No-op: execute the blocks.
    }

    /**
     * Store the call's arguments as parameters, ready for the procedure body.
     * @param {object} args Arguments of the call block.
     * @param {BlockUtility} util Block utility for the calling block.
     * @param {Array.<Array>} paramNamesIdsAndDefaults Procedure parameters.
     */
    pushProcedureParams (args, util, paramNamesIdsAndDefaults) {
        const [paramNames, paramIds, paramDefaults] = paramNamesIdsAndDefaults;

        // Initialize params for the current stackFrame to {}, even if the procedure does
        // not take any arguments. This is so that `getParam` down the line does not look
        // at earlier stack frames for the values of a given parameter (#1729)
        util.initParams();
        for (let i = 0; i < paramIds.length; i++) {
            if (Object.prototype.hasOwnProperty.call(args, paramIds[i])) {
                util.pushParam(paramNames[i], args[paramIds[i]]);
            } else {
                util.pushParam(paramNames[i], paramDefaults[i]);
            }
        }
    }

    call (args, util) {
        if (isReturningCall(args)) {
            return this.callReturningProcedure(args, util);
        }

        if (util.stackFrame.executed) {
            return;
        }

        const procedureCode = args.mutation.proccode;
        const paramNamesIdsAndDefaults = util.getProcedureParamNamesIdsAndDefaults(procedureCode);

        // If null, procedure could not be found, which can happen if custom
        // block is dragged between sprites without the definition.
        // Match Scratch 2.0 behavior and noop.
        if (paramNamesIdsAndDefaults === null) {
            return;
        }

        this.pushProcedureParams(args, util, paramNamesIdsAndDefaults);

        util.stackFrame.executed = true;
        util.startProcedure(procedureCode);
    }

    /**
     * Call a procedure that reports a value, waiting for the value it returns.
     * @param {object} args Arguments of the call block.
     * @param {BlockUtility} util Block utility for the calling block.
     * @returns {?(object|string)} Thenable for the value the procedure returns,
     *     or an empty value when the procedure could not be found.
     */
    callReturningProcedure (args, util) {
        const procedureCode = args.mutation.proccode;
        const paramNamesIdsAndDefaults = util.getProcedureParamNamesIdsAndDefaults(procedureCode);

        if (paramNamesIdsAndDefaults === null) {
            return '';
        }

        this.pushProcedureParams(args, util, paramNamesIdsAndDefaults);

        const returned = util.startProcedureReturning(procedureCode);
        return returned === null ? '' : returned;
    }

    /**
     * Return a value from the procedure this block runs in.
     * @param {object} args Arguments of the return block.
     * @param {BlockUtility} util Block utility for the return block.
     */
    proceduresReturn (args, util) {
        util.returnFromProcedure(typeof args.VALUE === 'undefined' ? '' : args.VALUE);
    }

    argumentReporterStringNumber (args, util) {
        const value = util.getParam(args.VALUE);
        if (value === null) {
            // When the parameter is not found in the most recent procedure
            // call, the default is always 0.
            return 0;
        }
        return value;
    }

    argumentReporterBoolean (args, util) {
        const value = util.getParam(args.VALUE);
        if (value === null) {
            // When the parameter is not found in the most recent procedure
            // call, the default is always 0.
            return 0;
        }
        return value;
    }
}

module.exports = Scratch3ProcedureBlocks;
