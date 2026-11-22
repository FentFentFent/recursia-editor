const ir = require('../ir/index');

/**
 * Compilation functions for the sensing blocks.
 *
 * Input devices and the project clock are read from the runtime's IO devices.
 * The blocks that keep state on the sensing block package — the answer, the
 * question queue and the cached loudness — are compiled by calling their
 * implementation instead.
 */

/**
 * Declare the helper that computes the distance to a menu option.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const distanceTo = emit => emit.helper('sensing:distanceTo', 'distanceTo', `(target, menu) => {
	if (target.isStage) return 10000;

	let x = 0;
	let y = 0;
	if (menu === '_mouse_') {
		x = runtime.ioDevices.mouse.getScratchX();
		y = runtime.ioDevices.mouse.getScratchY();
	} else {
		const other = runtime.getSpriteTargetByName(Cast.toString(menu));
		if (!other) return 10000;
		x = other.x;
		y = other.y;
	}

	const dx = target.x - x;
	const dy = target.y - y;
	return Math.sqrt((dx * dx) + (dy * dy));
}`);

/**
 * Declare the helper that reads an attribute of another target.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const attributeOf = emit => emit.helper('sensing:attributeOf', 'attributeOf', `(objectName, property) => {
	const other = objectName === '_stage_' ?
		runtime.getTargetForStage() :
		runtime.getSpriteTargetByName(Cast.toString(objectName));
	if (!other) return 0;

	if (other.isStage) {
		switch (property) {
		case 'background #':
		case 'backdrop #': return other.currentCostume + 1;
		case 'backdrop name': return other.getCostumes()[other.currentCostume].name;
		case 'volume': return other.volume;
		}
	} else {
		switch (property) {
		case 'x position': return other.x;
		case 'y position': return other.y;
		case 'direction': return other.direction;
		case 'costume #': return other.currentCostume + 1;
		case 'costume name': return other.getCostumes()[other.currentCostume].name;
		case 'size': return other.size;
		case 'volume': return other.volume;
		}
	}

	const variable = other.lookupVariableByNameAndType(property, '', true);
	return variable ? variable.value : 0;
}`);

/**
 * Declare the helper that reads a part of the current date.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const currentDate = emit => emit.helper('sensing:current', 'current', `menu => {
	const date = new Date();
	switch (Cast.toString(menu).toLowerCase()) {
	case 'year': return date.getFullYear();
	case 'month': return date.getMonth() + 1;
	case 'date': return date.getDate();
	case 'dayofweek': return date.getDay() + 1;
	case 'hour': return date.getHours();
	case 'minute': return date.getMinutes();
	case 'second': return date.getSeconds();
	}
	return 0;
}`);

/**
 * Declare the helper that counts the days since 2000.
 * @param {ScriptEmitter} emit Compiler emitting the block.
 * @returns {string} Name of the helper.
 */
const daysSince2000 = emit => emit.helper('sensing:daysSince2000', 'daysSince2000', `() => {
	const msPerDay = 24 * 60 * 60 * 1000;
	const start = new Date(2000, 0, 1);
	const today = new Date();
	const dstAdjust = today.getTimezoneOffset() - start.getTimezoneOffset();
	let mSecsSinceStart = today.valueOf() - start.valueOf();
	mSecsSinceStart += ((today.getTimezoneOffset() - dstAdjust) * 60 * 1000);
	return mSecsSinceStart / msPerDay;
}`);

module.exports = {
	expressions: {
		sensing_touchingobject: (emit, block) => {
			const menu = emit.input(block, 'TOUCHINGOBJECTMENU');

			return {
				statements: menu.statements,
				source: ir.source(['target.isTouchingObject(', menu.source, ')'])
			};
		},

		sensing_touchingcolor: (emit, block) => {
			const color = emit.input(block, 'COLOR');

			return {
				statements: color.statements,
				source: ir.source(['target.isTouchingColor(Cast.toRgbColorList(', color.source, '))'])
			};
		},

		sensing_coloristouchingcolor: (emit, block) => {
			const inputs = emit.inputs(block, ['COLOR', 'COLOR2']);

			return {
				statements: inputs.statements,
				source: ir.source([
					'target.colorIsTouchingColor(Cast.toRgbColorList(', inputs.sources.COLOR2,
					'), Cast.toRgbColorList(', inputs.sources.COLOR, '))'
				])
			};
		},

		sensing_distanceto: (emit, block) => {
			const menu = emit.input(block, 'DISTANCETOMENU');

			return {
				statements: menu.statements,
				source: ir.source([distanceTo(emit), '(target, ', menu.source, ')'])
			};
		},

		sensing_timer: () => ({
			statements: [],
			source: ir.source('runtime.ioDevices.clock.projectTimer()')
		}),

		sensing_of: (emit, block) => {
			const object = emit.input(block, 'OBJECT');

			return {
				statements: object.statements,
				source: ir.source([
					attributeOf(emit), '(', object.source, ', ', emit.field(block, 'PROPERTY'), ')'
				])
			};
		},

		sensing_mousex: () => ({
			statements: [],
			source: ir.source('runtime.ioDevices.mouse.getScratchX()')
		}),
		sensing_mousey: () => ({
			statements: [],
			source: ir.source('runtime.ioDevices.mouse.getScratchY()')
		}),
		sensing_mousedown: () => ({
			statements: [],
			source: ir.source('runtime.ioDevices.mouse.getIsDown()')
		}),

		sensing_keypressed: (emit, block) => {
			const key = emit.input(block, 'KEY_OPTION');

			return {
				statements: key.statements,
				source: ir.source(['runtime.ioDevices.keyboard.getKeyIsDown(', key.source, ')'])
			};
		},

		sensing_current: (emit, block) => ({
			statements: [],
			source: ir.source([currentDate(emit), '(', emit.field(block, 'CURRENTMENU'), ')'])
		}),

		sensing_dayssince2000: emit => ({
			statements: [],
			source: ir.source([daysSince2000(emit), '()'])
		}),

		sensing_online: () => ({
			statements: [],
			source: ir.source(
				"(typeof window !== 'undefined' && " +
				"typeof window.navigator.onLine === 'boolean' ? window.navigator.onLine : '')"
			)
		}),

		sensing_username: () => ({
			statements: [],
			source: ir.source('runtime.ioDevices.userData.getUsername()')
		}),

		sensing_answer: (emit, block) => emit.emitPrimitiveCall(block, true, {branches: false}),
		sensing_loudness: (emit, block) => emit.emitPrimitiveCall(block, true, {branches: false}),
		sensing_loud: (emit, block) => emit.emitPrimitiveCall(block, true, {branches: false})
	},
	statements: {
		sensing_resettimer: () => ({
			statements: [ir.statement('runtime.ioDevices.clock.resetProjectTimer()')]
		}),

		sensing_setdragmode: (emit, block) => ({
			statements: [
				ir.statement(
					'target.setDraggable(', emit.field(block, 'DRAG_MODE'), " === 'draggable')"
				)
			]
		}),

		sensing_askandwait: (emit, block) => emit.emitPrimitiveCall(block, false, {branches: false}),

		sensing_userid: () => ({statements: []})
	}
};
