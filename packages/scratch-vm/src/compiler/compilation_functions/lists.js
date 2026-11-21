/**
 * Compilation functions for the list blocks.
 *
 * Lists are items of the target, so these blocks compile into the same reads
 * and writes the list implementation performs, including the monitor flag.
 */

/**
 * Declare the helper that joins a list's contents.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const listContents = emit => emit.helper('data:listContents', 'listContents', `list => {
	let allSingleLetters = true;
	for (let i = 0; i < list.value.length; i++) {
		const item = list.value[i];
		if (!(typeof item === 'string' && item.length === 1)) {
			allSingleLetters = false;
			break;
		}
	}
	return list.value.join(allSingleLetters ? '' : ' ');
}`);

/**
 * Emit the index a list block works on.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @param {object} block Block owning the INDEX input.
 * @param {string} list Name of the list variable.
 * @param {string} length Source of the list length used to clamp the index.
 * @param {boolean} includeAll Whether the "all" index is accepted.
 * @returns {{lines: Array.<string>, index: string, guard: string}} Index source.
 */
const listIndex = (emit, block, list, length, includeAll) => {
	const index = emit.input(block, 'INDEX');
	const value = emit.newVarName('index');
	const guard = emit.newVarName('invalid');

	return {
		lines: [
			...index.lines,
			`const ${value} = Cast.toListIndex(${index.source}, ${length}, ${includeAll});`,
			`const ${guard} = ${value} === Cast.LIST_INVALID;`
		],
		index: value,
		guard
	};
};

/**
 * Emit a statement that writes to a list.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @param {object} block The list block.
 * @param {boolean} includeAll Whether the "all" index is accepted.
 * @param {function(string, string, string): Array.<string>} body Source of the write.
 * @returns {{lines: Array.<string>}} Block source.
 */
const listWrite = (emit, block, includeAll, body) => {
	const item = emit.input(block, 'ITEM');
	const list = emit.newVarName('list');
	const lines = [...item.lines, '{', `\tconst ${list} = ${emit.variable(block, 'LIST')};`];
	const lookup = listIndex(emit, block, list, `${list}.value.length`, includeAll);

	lines.push(...lookup.lines.map(line => `\t${line}`));
	lines.push(`\tif (!${lookup.guard}) {`);
	lines.push(...body(list, lookup.index, item.source).map(line => `\t\t${line}`));
	lines.push('\t}');
	lines.push('}');

	return {lines};
};

module.exports = {
	expressions: {
		data_listcontents: (emit, block) => {
			const list = emit.newVarName('list');

			return {
				lines: [`const ${list} = ${emit.variable(block, 'LIST')};`],
				source: `${listContents(emit)}(${list})`
			};
		},

		data_itemoflist: (emit, block) => {
			const list = emit.newVarName('list');
			const lookup = listIndex(emit, block, list, `${list}.value.length`, false);

			return {
				lines: [
					`const ${list} = ${emit.variable(block, 'LIST')};`,
					...lookup.lines
				],
				source: `(${lookup.guard} ? '' : ${list}.value[${lookup.index} - 1])`
			};
		},

		data_itemnumoflist: (emit, block) => {
			const list = emit.newVarName('list');
			const item = emit.input(block, 'ITEM');
			const value = emit.newVarName('item');
			const index = emit.newVarName('index');

			return {
				lines: [
					...item.lines,
					`const ${list} = ${emit.variable(block, 'LIST')};`,
					`const ${value} = ${item.source};`,
					`let ${index} = 0;`,
					`for (let i = 0; i < ${list}.value.length; i++) {`,
					`\tif (Cast.compare(${list}.value[i], ${value}) === 0) { ${index} = i + 1; break; }`,
					'}'
				],
				source: index
			};
		},

		data_lengthoflist: (emit, block) => {
			const list = emit.newVarName('list');

			return {
				lines: [`const ${list} = ${emit.variable(block, 'LIST')};`],
				source: `${list}.value.length`
			};
		},

		data_listcontainsitem: (emit, block) => {
			const list = emit.newVarName('list');
			const item = emit.input(block, 'ITEM');
			const value = emit.newVarName('item');
			const found = emit.newVarName('found');

			return {
				lines: [
					...item.lines,
					`const ${list} = ${emit.variable(block, 'LIST')};`,
					`const ${value} = ${item.source};`,
					`let ${found} = ${list}.value.indexOf(${value}) >= 0;`,
					`for (let i = 0; i < ${list}.value.length && !${found}; i++) {`,
					`\t${found} = Cast.compare(${list}.value[i], ${value}) === 0;`,
					'}'
				],
				source: found
			};
		}
	},
	statements: {
		data_addtolist: (emit, block) => {
			const item = emit.input(block, 'ITEM');
			const list = emit.newVarName('list');

			return {
				lines: [
					...item.lines,
					'{',
					`\tconst ${list} = ${emit.variable(block, 'LIST')};`,
					`\t${list}.value.push(${item.source});`,
					`\t${list}._monitorUpToDate = false;`,
					'}'
				]
			};
		},

		data_deleteoflist: (emit, block) => listWrite(emit, block, true, (list, index) => [
			`if (${index} === Cast.LIST_ALL) {`,
			`\t${list}.value = [];`,
			'} else {',
			`\t${list}.value.splice(${index} - 1, 1);`,
			`\t${list}._monitorUpToDate = false;`,
			'}'
		]),

		data_deletealloflist: (emit, block) => {
			const list = emit.newVarName('list');

			return {
				lines: [
					'{',
					`\tconst ${list} = ${emit.variable(block, 'LIST')};`,
					`\t${list}.value = [];`,
					'}'
				]
			};
		},

		data_insertatlist: (emit, block) => {
			const item = emit.input(block, 'ITEM');
			const list = emit.newVarName('list');
			const lookup = listIndex(emit, block, list, `${list}.value.length + 1`, false);

			return {
				lines: [
					...item.lines,
					'{',
					`\tconst ${list} = ${emit.variable(block, 'LIST')};`,
					...lookup.lines.map(line => `\t${line}`),
					`\tif (!${lookup.guard}) {`,
					`\t\t${list}.value.splice(${lookup.index} - 1, 0, ${item.source});`,
					`\t\t${list}._monitorUpToDate = false;`,
					'\t}',
					'}'
				]
			};
		},

		data_replaceitemoflist: (emit, block) => listWrite(emit, block, false, (list, index, item) => [
			`${list}.value[${index} - 1] = ${item};`,
			`${list}._monitorUpToDate = false;`
		]),

		data_showlist: (emit, block) => ({
			lines: [
				`runtime.monitorBlocks.changeBlock({id: ${JSON.stringify(block.fields.LIST.id)}, ` +
				"element: 'checkbox', value: true}, runtime);"
			]
		}),

		data_hidelist: (emit, block) => ({
			lines: [
				`runtime.monitorBlocks.changeBlock({id: ${JSON.stringify(block.fields.LIST.id)}, ` +
				"element: 'checkbox', value: false}, runtime);"
			]
		})
	}
};
