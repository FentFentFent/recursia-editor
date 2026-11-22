const ir = require('../ir/index');

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
 * @param {string} length Source of the list length used to clamp the index.
 * @param {boolean} includeAll Whether the "all" index is accepted.
 * @returns {{statements: Array.<object>, index: string, guard: string}} Index source.
 */
const listIndex = (emit, block, length, includeAll) => {
	const index = emit.input(block, 'INDEX');
	const value = emit.newVarName('index');
	const guard = emit.newVarName('invalid');

	return {
		statements: [
			...index.statements,
			ir.declaration('const', value, ir.source([
				'Cast.toListIndex(', index.source, ', ', length, ', ', String(includeAll), ')'
			])),
			ir.declaration('const', guard, ir.source([value, ' === Cast.LIST_INVALID']))
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
 * @param {function(string, string, object): Array.<object>} body Statements of the write.
 * @returns {{statements: Array.<object>}} Block source.
 */
const listWrite = (emit, block, includeAll, body) => {
	const item = emit.input(block, 'ITEM');
	const list = emit.newVarName('list');
	const lookup = listIndex(emit, block, `${list}.value.length`, includeAll);

	return {
		statements: [
			...item.statements,
			ir.block([
				ir.declaration('const', list, emit.variable(block, 'LIST')),
				...lookup.statements,
				ir.ifThen(ir.source(['!', lookup.guard]), body(list, lookup.index, item.source))
			])
		]
	};
};

module.exports = {
	expressions: {
		data_listcontents: (emit, block) => {
			const list = emit.newVarName('list');

			return {
				statements: [ir.declaration('const', list, emit.variable(block, 'LIST'))],
				source: ir.source([listContents(emit), '(', list, ')'])
			};
		},

		data_itemoflist: (emit, block) => {
			const list = emit.newVarName('list');
			const lookup = listIndex(emit, block, `${list}.value.length`, false);

			return {
				statements: [
					ir.declaration('const', list, emit.variable(block, 'LIST')),
					...lookup.statements
				],
				source: ir.source([
					'(', lookup.guard, ' ? ', "''", ' : ', list, '.value[', lookup.index, ' - 1])'
				])
			};
		},

		data_itemnumoflist: (emit, block) => {
			const list = emit.newVarName('list');
			const item = emit.input(block, 'ITEM');
			const value = emit.newVarName('item');
			const index = emit.newVarName('index');

			return {
				statements: [
					...item.statements,
					ir.declaration('const', list, emit.variable(block, 'LIST')),
					ir.declaration('const', value, item.source),
					ir.declaration('let', index, ir.literal(0)),
					ir.forLoop(
						'let i = 0',
						ir.source(['i < ', list, '.value.length']),
						'i++',
						[
							ir.ifThen(
								ir.source([
									'Cast.compare(', list, '.value[i], ', value, ') === 0'
								]),
								[ir.statement(index, ' = i + 1'), ir.statement('break')]
							)
						]
					)
				],
				source: ir.source([index])
			};
		},

		data_lengthoflist: (emit, block) => {
			const list = emit.newVarName('list');

			return {
				statements: [ir.declaration('const', list, emit.variable(block, 'LIST'))],
				source: ir.source([list, '.value.length'])
			};
		},

		data_listcontainsitem: (emit, block) => {
			const list = emit.newVarName('list');
			const item = emit.input(block, 'ITEM');
			const value = emit.newVarName('item');
			const found = emit.newVarName('found');

			return {
				statements: [
					...item.statements,
					ir.declaration('const', list, emit.variable(block, 'LIST')),
					ir.declaration('const', value, item.source),
					ir.declaration('let', found, ir.source([list, '.value.indexOf(', value, ') >= 0'])),
					ir.forLoop(
						'let i = 0',
						ir.source(['i < ', list, '.value.length && !', found]),
						'i++',
						[
							ir.assignment(
								ir.source([found]),
								ir.source(['Cast.compare(', list, '.value[i], ', value, ') === 0'])
							)
						]
					)
				],
				source: ir.source([found])
			};
		}
	},
	statements: {
		data_addtolist: (emit, block) => {
			const item = emit.input(block, 'ITEM');
			const list = emit.newVarName('list');

			return {
				statements: [
					...item.statements,
					ir.block([
						ir.declaration('const', list, emit.variable(block, 'LIST')),
						ir.statement(list, '.value.push(', item.source, ')'),
						ir.statement(list, '._monitorUpToDate = false')
					])
				]
			};
		},

		data_deleteoflist: (emit, block) => listWrite(emit, block, true, (list, index) => [
			ir.ifThen(
				ir.source([index, ' === Cast.LIST_ALL']),
				[ir.assignment(ir.source([list, '.value']), ir.source('[]'))],
				[
					ir.statement(list, '.value.splice(', index, ' - 1, 1)'),
					ir.statement(list, '._monitorUpToDate = false')
				]
			)
		]),

		data_deletealloflist: (emit, block) => {
			const list = emit.newVarName('list');

			return {
				statements: [
					ir.block([
						ir.declaration('const', list, emit.variable(block, 'LIST')),
						ir.assignment(ir.source([list, '.value']), ir.source('[]'))
					])
				]
			};
		},

		data_insertatlist: (emit, block) => {
			const item = emit.input(block, 'ITEM');
			const list = emit.newVarName('list');
			const lookup = listIndex(emit, block, `${list}.value.length + 1`, false);

			return {
				statements: [
					...item.statements,
					ir.block([
						ir.declaration('const', list, emit.variable(block, 'LIST')),
						...lookup.statements,
						ir.ifThen(ir.source(['!', lookup.guard]), [
							ir.statement(
								list, '.value.splice(', lookup.index, ' - 1, 0, ', item.source, ')'
							),
							ir.statement(list, '._monitorUpToDate = false')
						])
					])
				]
			};
		},

		data_replaceitemoflist: (emit, block) => listWrite(
			emit,
			block,
			false,
			(list, index, item) => [
				ir.assignment(ir.source([list, '.value[', index, ' - 1]']), item),
				ir.statement(list, '._monitorUpToDate = false')
			]
		),

		data_showlist: (emit, block) => ({
			statements: [
				ir.statement(
					'runtime.monitorBlocks.changeBlock({id: ',
					ir.literal(block.fields.LIST.id),
					", element: 'checkbox', value: true}, runtime)"
				)
			]
		}),

		data_hidelist: (emit, block) => ({
			statements: [
				ir.statement(
					'runtime.monitorBlocks.changeBlock({id: ',
					ir.literal(block.fields.LIST.id),
					", element: 'checkbox', value: false}, runtime)"
				)
			]
		})
	}
};
