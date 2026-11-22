const log = require('../util/log');

/**
 * Number of gamepad slots exposed by the browser's Gamepad API.
 * @type {number}
 */
const MAX_GAMEPADS = 4;

/**
 * Button values at or above this count as pressed. Analog triggers cross the
 * threshold partway through their travel.
 * @type {number}
 */
const BUTTON_THRESHOLD = 0.5;

/**
 * Axis values smaller than this are reported as zero so that a stick resting
 * slightly off-center does not look held.
 * @type {number}
 */
const AXIS_DEADZONE = 0.08;

/**
 * Virtual I/O device for game controllers, backed by the browser's Gamepad API.
 *
 * Gamepads are polled rather than event driven: `navigator.getGamepads()`
 * returns a snapshot of every controller, and controllers only update while the
 * page has focus. The snapshot is cached for one runtime step so that reading
 * several gamepad blocks in the same frame polls the browser only once.
 *
 * Only the gamepad extension reads this device.
 */
class Gamepad {
    /**
     * @param {Runtime} runtime The runtime that owns this device.
     */
    constructor (runtime) {
        /**
         * Reference to the owning Runtime.
         * @type {!Runtime}
         */
        this.runtime = runtime;

        /**
         * The most recent snapshot of the browser's gamepad slots.
         * @type {Array<?object>}
         * @private
         */
        this._gamepads = [];

        /**
         * The runtime step the snapshot was taken on.
         * @type {?number}
         * @private
         */
        this._gamepadsStep = null;
    }

    /**
     * @returns {number} how many gamepad slots the browser may fill.
     */
    static get MAX_GAMEPADS () {
        return MAX_GAMEPADS;
    }

    /**
     * Read the browser's gamepad slots.
     * @returns {Array<?object>} one entry per slot, `null` where nothing is connected.
     * @private
     */
    _readGamepads () {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
            return [];
        }
        const slots = navigator.getGamepads();
        const gamepads = [];
        for (let index = 0; index < MAX_GAMEPADS; index++) {
            const gamepad = slots[index];
            gamepads.push(gamepad && gamepad.connected ? gamepad : null);
        }
        return gamepads;
    }

    /**
     * Current gamepad slots, polled at most once per runtime step.
     * @returns {Array<?object>} one entry per slot, `null` where nothing is connected.
     * @private
     */
    _poll () {
        const step = this.runtime.currentMSecs;
        // A runtime without a step clock can't tell frames apart, so poll every read.
        if (step === undefined) return this._readGamepads();
        if (step !== this._gamepadsStep) {
            this._gamepads = this._readGamepads();
            this._gamepadsStep = step;
        }
        return this._gamepads;
    }

    /**
     * @param {number} index zero-based gamepad slot.
     * @returns {?object} the connected gamepad in that slot, or `null`.
     */
    getGamepad (index) {
        return this._poll()[index] || null;
    }

    /**
     * @param {number} index zero-based gamepad slot.
     * @returns {boolean} whether a gamepad is connected in that slot.
     */
    isConnected (index) {
        return this.getGamepad(index) !== null;
    }

    /**
     * @returns {number} how many gamepads are connected right now.
     */
    getConnectedCount () {
        return this._poll().filter(gamepad => gamepad !== null).length;
    }

    /**
     * @param {number} index zero-based gamepad slot.
     * @param {number} button zero-based button index.
     * @returns {number} how far the button is pressed, from 0 to 1.
     */
    getButtonValue (index, button) {
        const gamepad = this.getGamepad(index);
        if (!gamepad || !gamepad.buttons[button]) return 0;
        return gamepad.buttons[button].value;
    }

    /**
     * @param {number} index zero-based gamepad slot.
     * @param {number} button zero-based button index.
     * @returns {boolean} whether the button is pressed past the threshold.
     */
    isButtonPressed (index, button) {
        return this.getButtonValue(index, button) >= BUTTON_THRESHOLD;
    }

    /**
     * Read a stick axis, with the deadzone applied.
     * @param {number} index zero-based gamepad slot.
     * @param {number} axis zero-based axis index.
     * @returns {number} the axis position, from -1 to 1.
     */
    getAxis (index, axis) {
        const gamepad = this.getGamepad(index);
        if (!gamepad || typeof gamepad.axes[axis] !== 'number') return 0;
        const value = gamepad.axes[axis];
        return Math.abs(value) < AXIS_DEADZONE ? 0 : value;
    }

    /**
     * Make a gamepad vibrate. Browsers reject the effect when the controller has
     * no vibration actuator or does not support the "dual-rumble" effect.
     * @param {number} index zero-based gamepad slot.
     * @param {number} duration how long to vibrate, in milliseconds.
     * @param {number} strength vibration strength, from 0 to 1.
     * @returns {Promise<boolean>} whether the controller vibrated.
     */
    rumble (index, duration, strength) {
        const gamepad = this.getGamepad(index);
        if (!gamepad || !gamepad.vibrationActuator) return Promise.resolve(false);
        return gamepad.vibrationActuator.playEffect('dual-rumble', {
            duration,
            strongMagnitude: strength,
            weakMagnitude: strength
        }).then(vibrated => Boolean(vibrated), error => {
            log.warn(`Gamepad rumble failed on gamepad ${index + 1}: ${error}`);
            return false;
        });
    }
}

module.exports = Gamepad;
