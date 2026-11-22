const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

/**
 * Glyph shared by the block icon and the category menu icon.
 * @type {string}
 */
const iconPaths =
    '<g fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M13 11v14M6 18h14"/>' +
        '<path d="M24 12l8 8M32 12l-8 8"/>' +
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
        '<circle cx="20" cy="20" r="20" fill="#659C0D"/>' +
        `<g transform="translate(7 7) scale(0.65)">${iconPaths}</g>` +
    '</svg>'
)}`;

/**
 * Angles are reported in degrees, matching the trig blocks in the operators category.
 * @type {number}
 */
const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * Block category for maths helpers that the operators category does not cover.
 */
class Scratch3ArithmeticBlocks {
    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'arithmetic',
            colorStyle: 'arithmetic',
            name: formatMessage({
                id: 'arithmetic.categoryName',
                default: 'Arithmetic',
                description: 'Name of the extension that adds extra maths blocks'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'power',
                    text: formatMessage({
                        id: 'arithmetic.power',
                        default: '[BASE] ^ [EXPONENT]',
                        description: 'Raise a number to a power'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        BASE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 2
                        },
                        EXPONENT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'nthRoot',
                    text: formatMessage({
                        id: 'arithmetic.nthRoot',
                        default: 'nth root [INDEX] of [NUMBER]',
                        description: 'Get a root of a number, such as the square root'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 3
                        },
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 27
                        }
                    }
                },
                {
                    opcode: 'atan2',
                    text: formatMessage({
                        id: 'arithmetic.atan2',
                        default: 'atan2 of y [Y] x [X]',
                        description: 'Get the angle to a point, in degrees'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'roundTo',
                    text: formatMessage({
                        id: 'arithmetic.roundTo',
                        default: 'round [NUMBER] to [PLACES] decimal places',
                        description: 'Round a number, keeping some decimal places'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 3.14159
                        },
                        PLACES: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 2
                        }
                    }
                },
                '---',
                {
                    opcode: 'clamp',
                    text: formatMessage({
                        id: 'arithmetic.clamp',
                        default: 'clamp [VALUE] between [MIN] and [MAX]',
                        description: 'Keep a number inside a range'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 15
                        },
                        MIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        MAX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'remap',
                    text: formatMessage({
                        id: 'arithmetic.remap',
                        default: 'remap [VALUE] from [FROM_MIN]-[FROM_MAX] to [TO_MIN]-[TO_MAX]',
                        description: 'Convert a number from one range into another'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0.5
                        },
                        FROM_MIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        FROM_MAX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        TO_MIN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        TO_MAX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    }
                },
                {
                    opcode: 'sign',
                    text: formatMessage({
                        id: 'arithmetic.sign',
                        default: 'sign of [NUMBER]',
                        description: 'Get -1, 0 or 1 depending on whether a number is negative, zero or positive'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: -3
                        }
                    }
                },
                {
                    opcode: 'randomDecimal',
                    text: formatMessage({
                        id: 'arithmetic.randomDecimal',
                        default: 'random decimal from [FROM] to [TO]',
                        description: 'Get a random number with a decimal part'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        FROM: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        },
                        TO: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                '---',
                {
                    opcode: 'gcd',
                    text: formatMessage({
                        id: 'arithmetic.gcd',
                        default: 'gcd of [A] and [B]',
                        description: 'Get the greatest common divisor of two whole numbers'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        A: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 12
                        },
                        B: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 18
                        }
                    }
                },
                {
                    opcode: 'lcm',
                    text: formatMessage({
                        id: 'arithmetic.lcm',
                        default: 'lcm of [A] and [B]',
                        description: 'Get the least common multiple of two whole numbers'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        A: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 4
                        },
                        B: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 6
                        }
                    }
                },
                {
                    opcode: 'factorial',
                    text: formatMessage({
                        id: 'arithmetic.factorial',
                        default: 'factorial of [NUMBER]',
                        description: 'Multiply every whole number up to a number together'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 5
                        }
                    }
                },
                {
                    opcode: 'isPrime',
                    text: formatMessage({
                        id: 'arithmetic.isPrime',
                        default: '[NUMBER] is prime?',
                        description: 'Check whether a whole number is prime'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        NUMBER: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 7
                        }
                    }
                }
            ]
        };
    }

    power (args) {
        return Math.pow(Cast.toNumber(args.BASE), Cast.toNumber(args.EXPONENT));
    }

    nthRoot (args) {
        const index = Cast.toNumber(args.INDEX);
        const value = Cast.toNumber(args.NUMBER);
        if (index === 0) return 0;
        const magnitude = Math.pow(Math.abs(value), 1 / index);
        // An odd root of a negative number is negative, like -3 being the cube root of -27.
        const isOddRoot = Math.abs(index % 2) === 1;
        return value < 0 && isOddRoot ? -magnitude : magnitude;
    }

    atan2 (args) {
        return Math.atan2(Cast.toNumber(args.Y), Cast.toNumber(args.X)) * DEGREES_PER_RADIAN;
    }

    roundTo (args) {
        const places = Math.max(0, Math.round(Cast.toNumber(args.PLACES)));
        const factor = Math.pow(10, places);
        return Math.round(Cast.toNumber(args.NUMBER) * factor) / factor;
    }

    clamp (args) {
        const value = Cast.toNumber(args.VALUE);
        const min = Cast.toNumber(args.MIN);
        const max = Cast.toNumber(args.MAX);
        return Math.min(Math.max(value, min), max);
    }

    remap (args) {
        const value = Cast.toNumber(args.VALUE);
        const fromMin = Cast.toNumber(args.FROM_MIN);
        const fromMax = Cast.toNumber(args.FROM_MAX);
        const toMin = Cast.toNumber(args.TO_MIN);
        const toMax = Cast.toNumber(args.TO_MAX);
        // A zero-width source range cannot be scaled, so pin the result to the start of the target.
        if (fromMax === fromMin) return toMin;
        return toMin + (((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin));
    }

    sign (args) {
        return Math.sign(Cast.toNumber(args.NUMBER));
    }

    randomDecimal (args) {
        const from = Cast.toNumber(args.FROM);
        const to = Cast.toNumber(args.TO);
        return from + (Math.random() * (to - from));
    }

    gcd (args) {
        return this._gcd(
            Math.round(Cast.toNumber(args.A)),
            Math.round(Cast.toNumber(args.B))
        );
    }

    lcm (args) {
        const a = Math.round(Cast.toNumber(args.A));
        const b = Math.round(Cast.toNumber(args.B));
        if (a === 0 || b === 0) return 0;
        return Math.abs((a * b) / this._gcd(a, b));
    }

    factorial (args) {
        const number = Math.round(Cast.toNumber(args.NUMBER));
        if (number < 0) return 0;
        let result = 1;
        for (let i = 2; i <= number; i++) {
            result *= i;
        }
        return result;
    }

    isPrime (args) {
        const number = Math.round(Cast.toNumber(args.NUMBER));
        if (number < 2) return false;
        if (number % 2 === 0) return number === 2;
        for (let i = 3; (i * i) <= number; i += 2) {
            if (number % i === 0) return false;
        }
        return true;
    }

    /**
     * Greatest common divisor by Euclid's algorithm.
     * @param {number} a a whole number.
     * @param {number} b another whole number.
     * @returns {number} the greatest common divisor.
     * @private
     */
    _gcd (a, b) {
        let left = Math.abs(a);
        let right = Math.abs(b);
        while (right) {
            const remainder = left % right;
            left = right;
            right = remainder;
        }
        return left;
    }
}

module.exports = Scratch3ArithmeticBlocks;
