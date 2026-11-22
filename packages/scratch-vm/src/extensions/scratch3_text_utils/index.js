const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const log = require('../../util/log');

/**
 * Glyph shared by the block icon and the category menu icon.
 * @type {string}
 */
const iconPaths =
    '<g fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M4 29L11.5 10L19 29M7 22h9"/>' +
    '</g>' +
    '<text x="23" y="29" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#FFFFFF">a</text>';

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
        '<circle cx="20" cy="20" r="20" fill="#59C059"/>' +
        `<g transform="translate(7 7) scale(0.65)">${iconPaths}</g>` +
    '</svg>'
)}`;

/**
 * Ways the case block can change text.
 * @enum {string}
 */
const CASES = {
    UPPER: 'upper',
    LOWER: 'lower',
    TITLE: 'title'
};

/**
 * Ways the comparison block can compare text.
 * @enum {string}
 */
const COMPARISONS = {
    STARTS_WITH: 'startsWith',
    ENDS_WITH: 'endsWith',
    EQUALS: 'equals'
};

/**
 * Block category for rewriting and inspecting text.
 */
class Scratch3TextUtilsBlocks {
    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'textUtils',
            colorStyle: 'textUtils',
            name: formatMessage({
                id: 'textUtils.categoryName',
                default: 'Text Utilities',
                description: 'Name of the extension that adds extra blocks for working with text'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'replace',
                    text: formatMessage({
                        id: 'textUtils.replace',
                        default: 'replace [SEARCH] in [TEXT] with [REPLACEMENT]',
                        description: 'Replace every occurrence of some text'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        SEARCH: {
                            type: ArgumentType.STRING,
                            defaultValue: 'a'
                        },
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'banana'
                        },
                        REPLACEMENT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'o'
                        }
                    }
                },
                {
                    opcode: 'substring',
                    text: formatMessage({
                        id: 'textUtils.substring',
                        default: 'letters [START] to [END] of [TEXT]',
                        description: 'Get part of some text; positions count from 1 and the end is included'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        START: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        END: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 3
                        },
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'apple'
                        }
                    }
                },
                {
                    opcode: 'changeCase',
                    text: formatMessage({
                        id: 'textUtils.changeCase',
                        default: '[TEXT] in [CASE]',
                        description: 'Change the capitalisation of some text'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Hello World'
                        },
                        CASE: {
                            type: ArgumentType.STRING,
                            menu: 'CASE',
                            defaultValue: CASES.UPPER
                        }
                    }
                },
                {
                    opcode: 'trim',
                    text: formatMessage({
                        id: 'textUtils.trim',
                        default: 'trim spaces from [TEXT]',
                        description: 'Remove spaces from the start and end of some text'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: '  text  '
                        }
                    }
                },
                '---',
                {
                    opcode: 'compare',
                    text: formatMessage({
                        id: 'textUtils.compare',
                        default: '[TEXT] [COMPARISON] [OTHER]?',
                        description: 'Check how one piece of text starts, ends or compares to another'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'banana'
                        },
                        COMPARISON: {
                            type: ArgumentType.STRING,
                            menu: 'COMPARISON',
                            defaultValue: COMPARISONS.STARTS_WITH
                        },
                        OTHER: {
                            type: ArgumentType.STRING,
                            defaultValue: 'ban'
                        }
                    }
                },
                {
                    opcode: 'countOccurrences',
                    text: formatMessage({
                        id: 'textUtils.countOccurrences',
                        default: 'count of [SEARCH] in [TEXT]',
                        description: 'Count how many times some text appears in other text'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        SEARCH: {
                            type: ArgumentType.STRING,
                            defaultValue: 'a'
                        },
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'banana'
                        }
                    }
                },
                '---',
                {
                    opcode: 'regexMatch',
                    text: formatMessage({
                        id: 'textUtils.regexMatch',
                        default: 'regex [PATTERN] in [TEXT]',
                        description: 'Get the first part of some text that matches a regular expression'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        PATTERN: {
                            type: ArgumentType.STRING,
                            defaultValue: '\\d+'
                        },
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'abc123'
                        }
                    }
                },
                {
                    opcode: 'regexReplace',
                    text: formatMessage({
                        id: 'textUtils.regexReplace',
                        default: 'regex replace [PATTERN] in [TEXT] with [REPLACEMENT]',
                        description: 'Replace every part of some text that matches a regular expression'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        PATTERN: {
                            type: ArgumentType.STRING,
                            defaultValue: '\\d+'
                        },
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'abc123'
                        },
                        REPLACEMENT: {
                            type: ArgumentType.STRING,
                            defaultValue: '#'
                        }
                    }
                },
                {
                    opcode: 'regexMatches',
                    text: formatMessage({
                        id: 'textUtils.regexMatches',
                        default: 'regex [PATTERN] matches [TEXT]?',
                        description: 'Check whether some text contains a match for a regular expression'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        PATTERN: {
                            type: ArgumentType.STRING,
                            defaultValue: '\\d+'
                        },
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'abc123'
                        }
                    }
                }
            ],
            menus: {
                CASE: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'textUtils.caseUpper',
                                default: 'UPPERCASE',
                                description: 'Make every letter a capital'
                            }),
                            value: CASES.UPPER
                        },
                        {
                            text: formatMessage({
                                id: 'textUtils.caseLower',
                                default: 'lowercase',
                                description: 'Make every letter a small letter'
                            }),
                            value: CASES.LOWER
                        },
                        {
                            text: formatMessage({
                                id: 'textUtils.caseTitle',
                                default: 'Title Case',
                                description: 'Capitalise the first letter of every word'
                            }),
                            value: CASES.TITLE
                        }
                    ]
                },
                COMPARISON: {
                    acceptReporters: true,
                    items: [
                        {
                            text: formatMessage({
                                id: 'textUtils.comparisonStartsWith',
                                default: 'starts with',
                                description: 'Check whether text begins with other text'
                            }),
                            value: COMPARISONS.STARTS_WITH
                        },
                        {
                            text: formatMessage({
                                id: 'textUtils.comparisonEndsWith',
                                default: 'ends with',
                                description: 'Check whether text finishes with other text'
                            }),
                            value: COMPARISONS.ENDS_WITH
                        },
                        {
                            text: formatMessage({
                                id: 'textUtils.comparisonEquals',
                                default: 'equals exactly',
                                description: 'Check whether text is exactly the same as other text, including capitals'
                            }),
                            value: COMPARISONS.EQUALS
                        }
                    ]
                }
            }
        };
    }

    replace (args) {
        const text = Cast.toString(args.TEXT);
        const search = Cast.toString(args.SEARCH);
        if (search === '') return text;
        return text.split(search).join(Cast.toString(args.REPLACEMENT));
    }

    substring (args) {
        const text = Cast.toString(args.TEXT);
        const start = Math.max(1, Math.round(Cast.toNumber(args.START)));
        const end = Math.round(Cast.toNumber(args.END));
        if (end < start || start > text.length) return '';
        return text.substring(start - 1, end);
    }

    changeCase (args) {
        const text = Cast.toString(args.TEXT);
        switch (Cast.toString(args.CASE)) {
        case CASES.UPPER: return text.toUpperCase();
        case CASES.LOWER: return text.toLowerCase();
        case CASES.TITLE:
            return text.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
        default: return text;
        }
    }

    trim (args) {
        return Cast.toString(args.TEXT).trim();
    }

    compare (args) {
        const text = Cast.toString(args.TEXT);
        const other = Cast.toString(args.OTHER);
        switch (Cast.toString(args.COMPARISON)) {
        case COMPARISONS.STARTS_WITH: return text.startsWith(other);
        case COMPARISONS.ENDS_WITH: return text.endsWith(other);
        case COMPARISONS.EQUALS: return text === other;
        default: return false;
        }
    }

    countOccurrences (args) {
        const text = Cast.toString(args.TEXT);
        const search = Cast.toString(args.SEARCH);
        if (search === '') return 0;
        return text.split(search).length - 1;
    }

    regexMatch (args) {
        const regex = this._compileRegex(args.PATTERN);
        if (!regex) return '';
        const match = regex.exec(Cast.toString(args.TEXT));
        return match ? match[0] : '';
    }

    regexReplace (args) {
        const text = Cast.toString(args.TEXT);
        const regex = this._compileRegex(args.PATTERN, 'g');
        if (!regex) return text;
        return text.replace(regex, Cast.toString(args.REPLACEMENT));
    }

    regexMatches (args) {
        const regex = this._compileRegex(args.PATTERN);
        return regex ? regex.test(Cast.toString(args.TEXT)) : false;
    }

    /**
     * Build a regular expression from a block argument.
     * @param {*} pattern the pattern to compile.
     * @param {string} flags flags for the expression.
     * @returns {?RegExp} the expression, or `null` when the pattern is invalid.
     * @private
     */
    _compileRegex (pattern, flags) {
        try {
            return new RegExp(Cast.toString(pattern), flags);
        } catch (error) {
            log.warn(`Text utilities: invalid regular expression "${pattern}": ${error.message}`);
            return null;
        }
    }
}

module.exports = Scratch3TextUtilsBlocks;
