const test = require('tap').test;
const Arithmetic = require('../../src/extensions/scratch3_arithmetic');

const blocks = new Arithmetic();

test('getInfo describes the blocks', t => {
    const info = blocks.getInfo();
    t.equal(info.id, 'arithmetic');
    t.equal(info.colorStyle, 'arithmetic');
    t.same(
        info.blocks.filter(block => typeof block === 'object').map(block => block.opcode),
        [
            'power',
            'nthRoot',
            'atan2',
            'roundTo',
            'clamp',
            'remap',
            'sign',
            'randomDecimal',
            'gcd',
            'lcm',
            'factorial',
            'isPrime'
        ]
    );
    t.end();
});

test('power raises a number to a power', t => {
    t.equal(blocks.power({BASE: 2, EXPONENT: 10}), 1024);
    t.equal(blocks.power({BASE: 4, EXPONENT: 0.5}), 2);
    t.equal(blocks.power({BASE: 9, EXPONENT: -1}), 1 / 9);
    t.end();
});

test('nthRoot handles odd and even roots', t => {
    t.equal(blocks.nthRoot({INDEX: 3, NUMBER: 27}), 3);
    t.equal(blocks.nthRoot({INDEX: 3, NUMBER: -27}), -3, 'an odd root of a negative number is negative');
    t.equal(blocks.nthRoot({INDEX: 2, NUMBER: -9}), 3, 'an even root of a negative number is positive');
    t.equal(blocks.nthRoot({INDEX: 0, NUMBER: 5}), 0, 'a zero index has no root');
    t.end();
});

test('atan2 reports degrees', t => {
    t.equal(blocks.atan2({Y: 1, X: 1}), 45);
    t.equal(blocks.atan2({Y: 1, X: 0}), 90);
    t.equal(blocks.atan2({Y: 0, X: -1}), 180);
    t.end();
});

test('roundTo keeps decimal places', t => {
    t.equal(blocks.roundTo({NUMBER: 3.14159, PLACES: 2}), 3.14);
    t.equal(blocks.roundTo({NUMBER: 2.5, PLACES: 0}), 3);
    t.equal(blocks.roundTo({NUMBER: 1234, PLACES: -2}), 1234, 'negative places count as zero');
    t.end();
});

test('clamp keeps a value in range', t => {
    t.equal(blocks.clamp({VALUE: 15, MIN: 0, MAX: 10}), 10);
    t.equal(blocks.clamp({VALUE: -5, MIN: 0, MAX: 10}), 0);
    t.equal(blocks.clamp({VALUE: 5, MIN: 0, MAX: 10}), 5);
    t.end();
});

test('remap converts between ranges', t => {
    t.equal(blocks.remap({VALUE: 0.5, FROM_MIN: 0, FROM_MAX: 1, TO_MIN: 0, TO_MAX: 100}), 50);
    t.equal(blocks.remap({VALUE: -1, FROM_MIN: -1, FROM_MAX: 1, TO_MIN: 0, TO_MAX: 10}), 0);
    t.equal(
        blocks.remap({VALUE: 3, FROM_MIN: 1, FROM_MAX: 1, TO_MIN: 7, TO_MAX: 10}),
        7,
        'a zero-width source range pins the result to the start of the target'
    );
    t.end();
});

test('sign reports the direction of a number', t => {
    t.equal(blocks.sign({NUMBER: -3}), -1);
    t.equal(blocks.sign({NUMBER: 0}), 0);
    t.equal(blocks.sign({NUMBER: 2}), 1);
    t.end();
});

test('randomDecimal stays between its bounds', t => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    t.equal(blocks.randomDecimal({FROM: 0, TO: 10}), 5);
    Math.random = originalRandom;

    for (let i = 0; i < 20; i++) {
        const value = blocks.randomDecimal({FROM: -2, TO: 3});
        t.ok(value >= -2 && value <= 3, `${value} is in range`);
    }
    t.end();
});

test('gcd and lcm work on whole numbers', t => {
    t.equal(blocks.gcd({A: 12, B: 18}), 6);
    t.equal(blocks.gcd({A: -12, B: 18}), 6, 'signs are ignored');
    t.equal(blocks.lcm({A: 4, B: 6}), 12);
    t.equal(blocks.lcm({A: 0, B: 5}), 0);
    t.end();
});

test('factorial multiplies whole numbers together', t => {
    t.equal(blocks.factorial({NUMBER: 5}), 120);
    t.equal(blocks.factorial({NUMBER: 0}), 1);
    t.equal(blocks.factorial({NUMBER: -3}), 0);
    t.end();
});

test('isPrime recognises primes', t => {
    t.ok(blocks.isPrime({NUMBER: 2}));
    t.ok(blocks.isPrime({NUMBER: 97}));
    t.notOk(blocks.isPrime({NUMBER: 1}));
    t.notOk(blocks.isPrime({NUMBER: 91}));
    t.end();
});
