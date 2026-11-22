const ir = require('../ir/index');

/**
 * Compilation functions for the data blocks.
 *
 * Variables are read and written directly instead of going through the block
 * primitives, which is the most common operation in compiled scripts. The
 * remaining data blocks are compiled through their primitives.
 */

const setVariableTo = (emit, block) => {
	const value = emit.input(block, 'VALUE');
	const variable = emit.variableReference(block, 'VARIABLE');
	const field = emit.variableField(block, 'VARIABLE');

	return {
		statements: [
			...value.statements,
			ir.block([
				ir.assignment(ir.source([variable, '.value']), value.source, field.id),
				ir.ifThen(ir.source([variable, '.isCloud']), [
					ir.statement(
						"util.ioQuery('cloud', 'requestUpdateVariable', [",
						variable, '.name, ', variable, '.value])'
					)
				])
			])
		]
	};
};

const changeVariableBy = (emit, block) => {
	const value = emit.input(block, 'VALUE');
	const variable = emit.variableReference(block, 'VARIABLE');
	const field = emit.variableField(block, 'VARIABLE');

	return {
		statements: [
			...value.statements,
			ir.block([
				ir.assignment(
					ir.source([variable, '.value']),
					ir.source([
						emit.number(emit.variableValue(block, 'VARIABLE')), ' + ', emit.number(value.source)
					]),
					field.id
				),
				ir.ifThen(ir.source([variable, '.isCloud']), [
					ir.statement(
						"util.ioQuery('cloud', 'requestUpdateVariable', [",
						variable, '.name, ', variable, '.value])'
					)
				])
			])
		]
	};
};

module.exports = {
	expressions: {
		data_variable: (emit, block) => ({
			statements: [],
			source: emit.variableValue(block, 'VARIABLE')
		})
	},
	statements: {
		data_changevariableby: changeVariableBy,
		data_setvariableto: setVariableTo,

		data_showvariable: (emit, block) => ({
			statements: [
				ir.statement(
					'runtime.monitorBlocks.changeBlock({id: ',
					ir.literal(block.fields.VARIABLE.id),
					", element: 'checkbox', value: true}, runtime)"
				)
			]
		}),

		data_hidevariable: (emit, block) => ({
			statements: [
				ir.statement(
					'runtime.monitorBlocks.changeBlock({id: ',
					ir.literal(block.fields.VARIABLE.id),
					", element: 'checkbox', value: false}, runtime)"
				)
			]
		})
	}
};
