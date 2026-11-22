const test = require('tap').test;
const TextUtils = require('../../src/extensions/scratch3_text_utils');

const blocks = new TextUtils();

test('getInfo describes the blocks and menus', t => {
    const info = blocks.getInfo();
    t.equal(info.id, 'textUtils');
    t.equal(info.colorStyle, 'textUtils', 'the extension names its color style');
    t.same(
        info.blocks.filter(block => typeof block === 'object').map(block => block.opcode),
        [
            'replace',
            'substring',
            'changeCase',
            'trim',
            'compare',
            'countOccurrences',
            'regexMatch',
            'regexReplace',
            'regexMatches'
        ]
    );
    t.same(info.menus.CASE.items.map(item => item.value), ['upper', 'lower', 'title']);
    t.same(info.menus.COMPARISON.items.map(item => item.value), ['startsWith', 'endsWith', 'equals']);
    t.end();
});

test('replace replaces every occurrence', t => {
    t.equal(blocks.replace({SEARCH: 'a', TEXT: 'banana', REPLACEMENT: 'o'}), 'bonono');
    t.equal(blocks.replace({SEARCH: '', TEXT: 'banana', REPLACEMENT: 'o'}), 'banana', 'an empty search changes nothing');
    t.equal(blocks.replace({SEARCH: 'ana', TEXT: 'banana', REPLACEMENT: ''}), 'bna');
    t.end();
});

test('substring counts from 1 and includes the end', t => {
    t.equal(blocks.substring({START: 2, END: 4, TEXT: 'apple'}), 'ppl');
    t.equal(blocks.substring({START: 1, END: 1, TEXT: 'apple'}), 'a');
    t.equal(blocks.substring({START: 4, END: 99, TEXT: 'apple'}), 'le', 'past the end is clamped');
    t.equal(blocks.substring({START: 0, END: 2, TEXT: 'apple'}), 'ap', 'before the start is clamped');
    t.equal(blocks.substring({START: 4, END: 2, TEXT: 'apple'}), '', 'a reversed range is empty');
    t.equal(blocks.substring({START: 9, END: 10, TEXT: 'apple'}), '', 'a range past the text is empty');
    t.end();
});

test('changeCase changes capitalisation', t => {
    t.equal(blocks.changeCase({TEXT: 'Hello World', CASE: 'upper'}), 'HELLO WORLD');
    t.equal(blocks.changeCase({TEXT: 'Hello World', CASE: 'lower'}), 'hello world');
    t.equal(blocks.changeCase({TEXT: 'hello WORLD', CASE: 'title'}), 'Hello World');
    t.equal(blocks.changeCase({TEXT: 'Hello', CASE: 'unknown'}), 'Hello', 'an unknown case leaves the text alone');
    t.end();
});

test('trim removes surrounding spaces', t => {
    t.equal(blocks.trim({TEXT: '  hello \n'}), 'hello');
    t.end();
});

test('compare checks how text starts, ends and matches', t => {
    t.ok(blocks.compare({TEXT: 'banana', COMPARISON: 'startsWith', OTHER: 'ban'}));
    t.notOk(blocks.compare({TEXT: 'banana', COMPARISON: 'startsWith', OTHER: 'nan'}));
    t.ok(blocks.compare({TEXT: 'banana', COMPARISON: 'endsWith', OTHER: 'nana'}));
    t.ok(blocks.compare({TEXT: 'banana', COMPARISON: 'equals', OTHER: 'banana'}));
    t.notOk(blocks.compare({TEXT: 'Banana', COMPARISON: 'equals', OTHER: 'banana'}), 'equals is case sensitive');
    t.end();
});

test('countOccurrences counts without overlapping', t => {
    t.equal(blocks.countOccurrences({SEARCH: 'a', TEXT: 'banana'}), 3);
    t.equal(blocks.countOccurrences({SEARCH: 'ana', TEXT: 'banana'}), 1, 'matches do not overlap');
    t.equal(blocks.countOccurrences({SEARCH: '', TEXT: 'banana'}), 0);
    t.equal(blocks.countOccurrences({SEARCH: 'z', TEXT: 'banana'}), 0);
    t.end();
});

test('regexMatch reports the first match', t => {
    t.equal(blocks.regexMatch({PATTERN: '\\d+', TEXT: 'abc123'}), '123');
    t.equal(blocks.regexMatch({PATTERN: 'x', TEXT: 'abc123'}), '', 'no match reports empty text');
    t.equal(blocks.regexMatch({PATTERN: '([', TEXT: 'abc123'}), '', 'an invalid pattern reports empty text');
    t.end();
});

test('regexReplace replaces every match', t => {
    t.equal(blocks.regexReplace({PATTERN: '\\d+', TEXT: 'a1b22', REPLACEMENT: '#'}), 'a#b#');
    t.equal(blocks.regexReplace({PATTERN: '(\\w+)@(\\w+)', TEXT: 'ada@lovelace', REPLACEMENT: '$2 at $1'}),
        'lovelace at ada', 'capture groups can be used in the replacement');
    t.equal(blocks.regexReplace({PATTERN: '([', TEXT: 'abc', REPLACEMENT: '#'}), 'abc', 'an invalid pattern changes nothing');
    t.end();
});

test('regexMatches checks for a match', t => {
    t.ok(blocks.regexMatches({PATTERN: '\\d+', TEXT: 'abc123'}));
    t.notOk(blocks.regexMatches({PATTERN: '\\d+', TEXT: 'abc'}));
    t.notOk(blocks.regexMatches({PATTERN: '([', TEXT: 'abc'}), 'an invalid pattern does not match');
    t.end();
});
