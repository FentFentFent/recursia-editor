const test = require('tap').test;
const Gamepad = require('../../src/io/gamepad');
const GamepadBlocks = require('../../src/extensions/scratch3_gamepad');

const makeGamepad = ({buttons = {}, axes = []} = {}) => ({
    connected: true,
    buttons: Array.from({length: 16}, (unused, index) => ({value: buttons[index] || 0})),
    axes
});

const makeDevice = slots => {
    const device = new Gamepad({});
    device._readGamepads = () => slots;
    return device;
};

const makeBlocks = slots => {
    const device = makeDevice(slots);
    return {
        device,
        blocks: new GamepadBlocks({ioDevices: {gamepad: device}})
    };
};

test('getInfo describes the blocks and menus', t => {
    const {blocks} = makeBlocks([null, null, null, null]);
    const info = blocks.getInfo();
    t.equal(info.id, 'gamepad');
    t.equal(info.colorStyle, 'gamepad', 'the extension names its color style');
    t.same(
        info.blocks.filter(block => typeof block === 'object').map(block => block.opcode),
        [
            'whenButtonPressed',
            'isButtonPressed',
            'getButtonValue',
            'getStickValue',
            'isConnected',
            'getConnectedCount',
            'rumble'
        ]
    );
    t.equal(info.menus.BUTTON.items.length, 16, 'every standard button has a menu item');
    t.equal(info.menus.GAMEPAD.items.length, Gamepad.MAX_GAMEPADS);
    t.same(info.menus.GAMEPAD.items.map(item => item.value), ['1', '2', '3', '4']);
    t.end();
});

test('an empty gamepad slot reads as disconnected', t => {
    const device = makeDevice([null, null, null, null]);
    t.notOk(device.isConnected(0));
    t.equal(device.getConnectedCount(), 0);
    t.equal(device.getButtonValue(0, 0), 0);
    t.equal(device.getAxis(0, 0), 0);
    t.end();
});

test('button values and stick axes come from the gamepad', t => {
    const device = makeDevice([makeGamepad({buttons: {0: 0.4, 1: 0.6}, axes: [0.05, -0.5]}), null, null, null]);

    t.ok(device.isConnected(0));
    t.equal(device.getConnectedCount(), 1);
    t.equal(device.getButtonValue(0, 0), 0.4);
    t.notOk(device.isButtonPressed(0, 0), 'a value below the threshold is not pressed');
    t.ok(device.isButtonPressed(0, 1), 'a value above the threshold is pressed');
    t.equal(device.getAxis(0, 0), 0, 'a stick that rests near the center reads as zero');
    t.equal(device.getAxis(0, 1), -0.5);
    t.equal(device.getAxis(1, 0), 0, 'a disconnected slot has no axes');
    t.end();
});

test('no Gamepad API means no gamepads', t => {
    const device = new Gamepad({});
    t.equal(device.getConnectedCount(), 0);
    t.notOk(device.isConnected(0));
    t.end();
});

test('rumble falls back when the controller cannot vibrate', async t => {
    const device = makeDevice([makeGamepad(), null, null, null]);
    t.equal(await device.rumble(0, 100, 1), false, 'a controller without an actuator does not vibrate');

    let effect;
    const vibrating = makeGamepad();
    vibrating.vibrationActuator = {
        playEffect: (type, params) => {
            effect = {type, params};
            return Promise.resolve('complete');
        }
    };
    const withActuator = makeDevice([vibrating, null, null, null]);
    t.equal(await withActuator.rumble(0, 500, 0.25), true);
    t.same(effect, {
        type: 'dual-rumble',
        params: {duration: 500, strongMagnitude: 0.25, weakMagnitude: 0.25}
    });
    t.end();
});

test('the blocks read the gamepad slots', t => {
    const {blocks} = makeBlocks([makeGamepad({buttons: {0: 1}, axes: [0.5, -0.25]}), null, null, null]);

    t.ok(blocks.isButtonPressed({BUTTON: '0', GAMEPAD: '1'}));
    t.notOk(blocks.isButtonPressed({BUTTON: '0', GAMEPAD: '2'}), 'other gamepads are independent');
    t.equal(blocks.getButtonValue({BUTTON: '0', GAMEPAD: '1'}), 100);
    t.equal(blocks.getStickValue({STICK: 'left', AXIS: 'x', GAMEPAD: '1'}), 50);
    t.equal(blocks.getStickValue({STICK: 'left', AXIS: 'y', GAMEPAD: '1'}), 25, 'up is positive');
    t.equal(blocks.getStickValue({STICK: 'right', AXIS: 'x', GAMEPAD: '1'}), 0, 'a missing axis reads as zero');
    t.ok(blocks.isConnected({GAMEPAD: '1'}));
    t.notOk(blocks.isConnected({GAMEPAD: '3'}));
    t.equal(blocks.getConnectedCount(), 1);
    t.ok(blocks.whenButtonPressed({BUTTON: '0', GAMEPAD: '1'}), 'the hat reports the pressed state');
    t.end();
});

test('gamepad slots outside the supported range are clamped', t => {
    const pads = [makeGamepad(), makeGamepad(), makeGamepad(), makeGamepad()];
    const {blocks} = makeBlocks(pads);
    t.ok(blocks.isConnected({GAMEPAD: '0'}), 'gamepad 0 clamps to gamepad 1');
    t.ok(blocks.isConnected({GAMEPAD: '9'}), 'gamepad 9 clamps to gamepad 4');
    t.end();
});

test('the rumble block converts and clamps its arguments', async t => {
    const {device, blocks} = makeBlocks([makeGamepad(), null, null, null]);
    const calls = [];
    device.rumble = (index, duration, strength) => {
        calls.push({index, duration, strength});
        return Promise.resolve(true);
    };

    t.ok(await blocks.rumble({GAMEPAD: '1', SECONDS: 1.5, STRENGTH: 250}));
    await blocks.rumble({GAMEPAD: '9', SECONDS: -1, STRENGTH: -20});
    t.same(calls, [
        {index: 0, duration: 1500, strength: 1},
        {index: 3, duration: 0, strength: 0}
    ]);
    t.end();
});
