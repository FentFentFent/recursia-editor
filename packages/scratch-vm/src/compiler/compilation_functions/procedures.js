/**
 * Compilation functions for custom block blocks.
 *
 * Every procedure reachable from a script is compiled into a generator function
 * next to it, so calls delegate to it with `yield*`: the procedure runs on the
 * calling thread, can yield, and can recurse, like an interpreted call.
 */

module.exports = {
	expressions: {
		argument_reporter_boolean: (emit, block) => emit.argument(block),
		argument_reporter_string_number: (emit, block) => emit.argument(block),
		procedures_call: (emit, block) => emit.callProcedure(block, true)
	},
	statements: {
		procedures_call: (emit, block) => emit.callProcedure(block, false),
		procedures_return: (emit, block) => emit.returnValue(block)
	}
};
