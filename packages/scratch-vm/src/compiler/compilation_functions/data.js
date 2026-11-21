/**
 * Compilation functions for the data blocks.
 *
 * Variables are read and written directly instead of going through the block
 * primitives, which is the most common operation in compiled scripts. The
 * remaining data blocks are compiled through their primitives.
 */

const setVariableTo = (emit, block) => {
	const value = emit.input(block, 'VALUE');
	const variable = emit.newVarName('variable');

	return {
		lines: [
			...value.lines,
			'{',
			`\tconst ${variable} = ${emit.variable(block, 'VARIABLE')};`,
			`\t${variable}.value = ${value.source};`,
			`\tif (${variable}.isCloud) {`,
			`\t\tutil.ioQuery('cloud', 'requestUpdateVariable', [${variable}.name, ${variable}.value]);`,
			`\t}`,
			'}'
		]
	};
};

const changeVariableBy = (emit, block) => {
	const value = emit.input(block, 'VALUE');
	const variable = emit.newVarName('variable');

	return {
		lines: [
			...value.lines,
			'{',
			`\tconst ${variable} = ${emit.variable(block, 'VARIABLE')};`,
			`\t${variable}.value = Cast.toNumber(${variable}.value) + Cast.toNumber(${value.source});`,
			`\tif (${variable}.isCloud) {`,
			`\t\tutil.ioQuery('cloud', 'requestUpdateVariable', [${variable}.name, ${variable}.value]);`,
			`\t}`,
			'}'
		]
	};
};

module.exports = {
	expressions: {
		data_variable: (emit, block) => ({
			lines: [],
			source: `${emit.variable(block, 'VARIABLE')}.value`
		})
	},
	statements: {
		data_changevariableby: changeVariableBy,
		data_setvariableto: setVariableTo,

		data_showvariable: (emit, block) => ({
			lines: [
				`runtime.monitorBlocks.changeBlock({id: ${JSON.stringify(block.fields.VARIABLE.id)}, ` +
				"element: 'checkbox', value: true}, runtime);"
			]
		}),

		data_hidevariable: (emit, block) => ({
			lines: [
				`runtime.monitorBlocks.changeBlock({id: ${JSON.stringify(block.fields.VARIABLE.id)}, ` +
				"element: 'checkbox', value: false}, runtime);"
			]
		})
	}
};
