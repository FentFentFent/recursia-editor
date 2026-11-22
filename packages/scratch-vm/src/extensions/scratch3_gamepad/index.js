const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const Gamepad = require('../../io/gamepad');

/**
 * Glyph shared by the block icon and the category menu icon.
 * @type {string}
 */
const iconPaths =
    '<g fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M10 15h20c3 0 5 2 5 5l1.5 7c.5 3-3 5.5-5.5 3.5L27 27H13l-4 3.5' +
            'C6.5 32.5 3 30 3.5 27L5 20c0-3 2-5 5-5z"/>' +
        '<path d="M14 20v6M11 23h6"/>' +
        '<circle cx="25" cy="21" r="1.7" fill="#FFFFFF" stroke="none"/>' +
        '<circle cx="29" cy="24" r="1.7" fill="#FFFFFF" stroke="none"/>' +
    '</g>';

/**
 * Icon to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
const blockIconURI = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${iconPaths}</svg>`
)}`;

/**
 * Category menu icon: the same glyph on a bubble in the category color.
 * @type {string}
 */
const menuIconURI = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
        '<circle cx="20" cy="20" r="20" fill="#FFAB19"/>' +
        `<g transform="translate(7 7) scale(0.65)">${iconPaths}</g>` +
    '</svg>'
)}`;

/**
 * Button indices in the W3C "standard" gamepad mapping.
 * @enum {number}
 */
const BUTTONS = {
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LEFT_BUMPER: 4,
    RIGHT_BUMPER: 5,
    LEFT_TRIGGER: 6,
    RIGHT_TRIGGER: 7,
    SELECT: 8,
    START: 9,
    LEFT_STICK: 10,
    RIGHT_STICK: 11,
    DPAD_UP: 12,
    DPAD_DOWN: 13,
    DPAD_LEFT: 14,
    DPAD_RIGHT: 15
};

/**
 * Axis indices in the W3C "standard" gamepad mapping.
 * @enum {number}
 */
const STICK_AXES = {
    left: {x: 0, y: 1},
    right: {x: 2, y: 3}
};

/**
 * Block category for reading game controllers.
 */
class Scratch3GamepadBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * The gamepad I/O device.
         * @type {Gamepad}
         * @private
         */
        this._gamepad = runtime.ioDevices.gamepad;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'gamepad',
            colorStyle: 'gamepad',
            name: formatMessage({
                id: 'gamepad.categoryName',
                default: 'Gamepad',
                description: 'Name of the extension that adds game controller blocks'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'whenButtonPressed',
                    text: formatMessage({
                        id: 'gamepad.whenButtonPressed',
                        default: 'when [BUTTON] pressed on [GAMEPAD]',
                        description: 'Event that triggers when a gamepad button is pressed'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.STRING,
                            menu: 'BUTTON',
                            defaultValue: String(BUTTONS.A)
                        },
                        GAMEPAD: {
                            type: ArgumentType.STRING,
                            menu: 'GAMEPAD',
                            defaultValue: '1'
                        }
                    }
                },
                {
                    opcode: 'isButtonPressed',
                    text: formatMessage({
                        id: 'gamepad.isButtonPressed',
                        default: '[BUTTON] pressed on [GAMEPAD]?',
                        description: 'Report whether a gamepad button is pressed'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.STRING,
                            menu: 'BUTTON',
                            defaultValue: String(BUTTONS.A)
                        },
                        GAMEPAD: {
                            type: ArgumentType.STRING,
                            menu: 'GAMEPAD',
                            defaultValue: '1'
                        }
                    }
                },
                {
                    opcode: 'getButtonValue',
                    text: formatMessage({
                        id: 'gamepad.getButtonValue',
                        default: '[BUTTON] value on [GAMEPAD]',
                        description: 'Report how far a gamepad button is pressed, from 0 to 100'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        BUTTON: {
                            type: ArgumentType.STRING,
                            menu: 'BUTTON',
                            defaultValue: String(BUTTONS.RIGHT_TRIGGER)
                        },
                        GAMEPAD: {
                            type: ArgumentType.STRING,
                            menu: 'GAMEPAD',
                            defaultValue: '1'
                        }
                    }
                },
                '---',
                {
                    opcode: 'getStickValue',
                    text: formatMessage({
                        id: 'gamepad.getStickValue',
                        default: '[STICK] stick [AXIS] on [GAMEPAD]',
                        description: 'Report the position of a gamepad stick axis, from -100 to 100'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        STICK: {
                            type: ArgumentType.STRING,
                            menu: 'STICK',
                            defaultValue: 'left'
                        },
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'AXIS',
                            defaultValue: 'x'
                        },
                        GAMEPAD: {
                            type: ArgumentType.STRING,
                            menu: 'GAMEPAD',
                            defaultValue: '1'
                        }
                    }
                },
                '---',
                {
                    opcode: 'isConnected',
                    text: formatMessage({
                        id: 'gamepad.isConnected',
                        default: '[GAMEPAD] connected?',
                        description: 'Report whether a gamepad is connected'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        GAMEPAD: {
                            type: ArgumentType.STRING,
                            menu: 'GAMEPAD',
                            defaultValue: '1'
                        }
                    }
                },
                {
                    opcode: 'getConnectedCount',
                    text: formatMessage({
                        id: 'gamepad.getConnectedCount',
                        default: 'number of connected gamepads',
                        description: 'Report how many gamepads are connected'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'rumble',
                    text: formatMessage({
                        id: 'gamepad.rumble',
                        default: 'rumble [GAMEPAD] for [SECONDS] seconds at [STRENGTH] %',
                        description: 'Make a gamepad vibrate for a time at a strength'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        GAMEPAD: {
                            type: ArgumentType.STRING,
                            menu: 'GAMEPAD',
                            defaultValue: '1'
                        },
                        SECONDS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        STRENGTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    }
                }
            ],
            menus: {
                BUTTON: {
                    acceptReporters: true,
                    items: this._getButtonMenuItems()
                },
                GAMEPAD: {
                    acceptReporters: true,
                    items: this._getGamepadMenuItems()
                },
                STICK: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'gamepad.stickLeft',
                                default: 'left',
                                description: 'The left stick on a game controller'
                            }),
                            value: 'left'
                        },
                        {
                            text: formatMessage({
                                id: 'gamepad.stickRight',
                                default: 'right',
                                description: 'The right stick on a game controller'
                            }),
                            value: 'right'
                        }
                    ]
                },
                AXIS: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'gamepad.axisX',
                                default: 'x',
                                description: 'The horizontal axis of a stick'
                            }),
                            value: 'x'
                        },
                        {
                            text: formatMessage({
                                id: 'gamepad.axisY',
                                default: 'y',
                                description: 'The vertical axis of a stick'
                            }),
                            value: 'y'
                        }
                    ]
                }
            }
        };
    }

    /**
     * @returns {Array<object>} menu items for the standard gamepad buttons.
     * @private
     */
    _getButtonMenuItems () {
        return [
            {
                text: formatMessage({
                    id: 'gamepad.buttonA',
                    default: 'A',
                    description: 'The A button on a game controller'
                }),
                value: String(BUTTONS.A)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonB',
                    default: 'B',
                    description: 'The B button on a game controller'
                }),
                value: String(BUTTONS.B)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonX',
                    default: 'X',
                    description: 'The X button on a game controller'
                }),
                value: String(BUTTONS.X)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonY',
                    default: 'Y',
                    description: 'The Y button on a game controller'
                }),
                value: String(BUTTONS.Y)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonLeftBumper',
                    default: 'left bumper',
                    description: 'The left shoulder button on a game controller'
                }),
                value: String(BUTTONS.LEFT_BUMPER)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonRightBumper',
                    default: 'right bumper',
                    description: 'The right shoulder button on a game controller'
                }),
                value: String(BUTTONS.RIGHT_BUMPER)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonLeftTrigger',
                    default: 'left trigger',
                    description: 'The left analog trigger on a game controller'
                }),
                value: String(BUTTONS.LEFT_TRIGGER)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonRightTrigger',
                    default: 'right trigger',
                    description: 'The right analog trigger on a game controller'
                }),
                value: String(BUTTONS.RIGHT_TRIGGER)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonSelect',
                    default: 'select',
                    description: 'The select or back button on a game controller'
                }),
                value: String(BUTTONS.SELECT)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonStart',
                    default: 'start',
                    description: 'The start button on a game controller'
                }),
                value: String(BUTTONS.START)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonLeftStick',
                    default: 'left stick click',
                    description: 'Pressing the left stick of a game controller in'
                }),
                value: String(BUTTONS.LEFT_STICK)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonRightStick',
                    default: 'right stick click',
                    description: 'Pressing the right stick of a game controller in'
                }),
                value: String(BUTTONS.RIGHT_STICK)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonDpadUp',
                    default: 'd-pad up',
                    description: 'The up button on the directional pad of a game controller'
                }),
                value: String(BUTTONS.DPAD_UP)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonDpadDown',
                    default: 'd-pad down',
                    description: 'The down button on the directional pad of a game controller'
                }),
                value: String(BUTTONS.DPAD_DOWN)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonDpadLeft',
                    default: 'd-pad left',
                    description: 'The left button on the directional pad of a game controller'
                }),
                value: String(BUTTONS.DPAD_LEFT)
            },
            {
                text: formatMessage({
                    id: 'gamepad.buttonDpadRight',
                    default: 'd-pad right',
                    description: 'The right button on the directional pad of a game controller'
                }),
                value: String(BUTTONS.DPAD_RIGHT)
            }
        ];
    }

    /**
     * @returns {Array<object>} menu items for the gamepad slots.
     * @private
     */
    _getGamepadMenuItems () {
        const items = [];
        for (let slot = 1; slot <= Gamepad.MAX_GAMEPADS; slot++) {
            items.push({
                text: formatMessage({
                    id: 'gamepad.gamepadNumber',
                    default: 'gamepad {number}',
                    description: 'A gamepad slot, numbered from 1'
                }, {number: slot}),
                value: String(slot)
            });
        }
        return items;
    }

    /**
     * Convert a one-based gamepad slot argument to the device's zero-based index.
     * @param {*} slot the block argument.
     * @returns {number} the clamped zero-based index.
     * @private
     */
    _gamepadIndex (slot) {
        const oneBased = Math.round(Cast.toNumber(slot));
        return Math.min(Gamepad.MAX_GAMEPADS, Math.max(1, oneBased)) - 1;
    }

    /**
     * @param {object} args the block arguments.
     * @returns {boolean} whether the button is pressed.
     * @private
     */
    _isButtonPressed (args) {
        return this._gamepad.isButtonPressed(
            this._gamepadIndex(args.GAMEPAD),
            Cast.toNumber(args.BUTTON)
        );
    }

    whenButtonPressed (args) {
        return this._isButtonPressed(args);
    }

    isButtonPressed (args) {
        return this._isButtonPressed(args);
    }

    getButtonValue (args) {
        return Math.round(this._gamepad.getButtonValue(
            this._gamepadIndex(args.GAMEPAD),
            Cast.toNumber(args.BUTTON)
        ) * 100);
    }

    getStickValue (args) {
        const stick = STICK_AXES[Cast.toString(args.STICK)] || STICK_AXES.left;
        const isY = Cast.toString(args.AXIS) === 'y';
        const axis = isY ? stick.y : stick.x;
        const value = this._gamepad.getAxis(this._gamepadIndex(args.GAMEPAD), axis);
        // The Gamepad API reports up as -1 on the Y axes; the blocks report up as positive.
        return Math.round((isY ? -value : value) * 100);
    }

    isConnected (args) {
        return this._gamepad.isConnected(this._gamepadIndex(args.GAMEPAD));
    }

    getConnectedCount () {
        return this._gamepad.getConnectedCount();
    }

    rumble (args) {
        const seconds = Math.max(0, Cast.toNumber(args.SECONDS));
        const strength = Math.min(1, Math.max(0, Cast.toNumber(args.STRENGTH) / 100));
        return this._gamepad.rumble(this._gamepadIndex(args.GAMEPAD), seconds * 1000, strength);
    }
}

module.exports = Scratch3GamepadBlocks;
