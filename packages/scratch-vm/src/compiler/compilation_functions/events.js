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
				lines: [
					...option.lines,
					'{',
					`\tconst ${broadcastVar} = runtime.getTargetForStage().lookupBroadcastMsg(
						${option.source}.id, ${option.source}.name
					);`.replace(/\n\t*/g, ' '),
					`\tif (${broadcastVar}) {`,
					`\t\truntime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: ${broadcastVar}.name});`,
					'\t}',
					'}'
				]
			};
		},

		event_broadcastandwait: (emit, block) =>
			emit.emitPrimitiveCall(block, false, {branches: false})
	}
};
