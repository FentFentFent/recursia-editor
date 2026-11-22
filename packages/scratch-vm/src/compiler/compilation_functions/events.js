const ir = require('../ir/index');

/**
 * Compilation functions for the event blocks.
 *
 * Broadcasting resolves the message on the stage and starts the receiving hats.
 * Broadcasting and waiting keeps state on the block package and is compiled by
 * calling its implementation instead.
 */

module.exports = {
	expressions: {},
	statements: {
		event_broadcast: (emit, block) => {
			const option = emit.broadcastOption(block);
			const broadcastVar = emit.newVarName('broadcast');

			return {
				statements: [
					...option.statements,
					ir.block([
						ir.declaration('const', broadcastVar, ir.source([
							'runtime.getTargetForStage().lookupBroadcastMsg(',
							option.source, '.id, ', option.source, '.name)'
						])),
						ir.ifThen(ir.source([broadcastVar]), [
							ir.statement(
								"runtime.startHats('event_whenbroadcastreceived', " +
								'{BROADCAST_OPTION: ',
								broadcastVar, '.name})'
							)
						])
					])
				]
			};
		},

		event_broadcastandwait: (emit, block) =>
			emit.emitPrimitiveCall(block, false, {branches: false})
	}
};
