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
    '<g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588' +
            'A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>' +
        '<path d="M14 2v5a1 1 0 0 0 1 1h5"/>' +
        '<path d="M10 9H8"/>' +
        '<path d="M16 13H8"/>' +
        '<path d="M16 17H8"/>' +
    '</g>';

/**
 * Icon to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
const blockIconURI = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${iconPaths}</svg>`
)}`;

/**
 * Category menu icon: the same glyph on a bubble in the category color.
 * @type {string}
 */
const menuIconURI = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
        '<circle cx="20" cy="20" r="20" fill="#0E7490"/>' +
        `<g transform="translate(10 10) scale(0.83)">${iconPaths}</g>` +
    '</svg>'
)}`;

/**
 * How long a request may take before it is aborted, in milliseconds.
 * @type {number}
 */
const TIMEOUT_MS = 30000;

/**
 * Call the platform `fetch`. Resolved per call so tests and hosts can replace it.
 * @param {...*} args arguments forwarded to `fetch`.
 * @returns {Promise<object>} the response.
 */
const doFetch = (...args) => globalThis.fetch(...args);

/**
 * Block category for making HTTP requests.
 *
 * The extension keeps the result of the most recent request, so any script can
 * read it with the reporter blocks. Like the "answer" block, that result is
 * shared: when several scripts make requests at once, the last one to finish
 * wins.
 */
class Scratch3HttpBlocks {
    constructor () {
        /**
         * Body of the most recent response.
         * @type {string}
         * @private
         */
        this._body = '';

        /**
         * Status code of the most recent response.
         * @type {number}
         * @private
         */
        this._status = 0;

        /**
         * Whether the most recent request finished successfully.
         * @type {boolean}
         * @private
         */
        this._succeeded = false;

        /**
         * Why the most recent request failed. Empty after a successful request.
         * @type {string}
         * @private
         */
        this._error = '';
    }

    /**
     * @returns {ExtensionMetadata} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'http',
            colorStyle: 'http',
            name: formatMessage({
                id: 'http.categoryName',
                default: 'Web Requests',
                description: 'Name of the extension that adds blocks for making web requests'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'fetch',
                    text: formatMessage({
                        id: 'http.fetch',
                        default: 'fetch [METHOD] [URL] with body [BODY] and headers [HEADERS]',
                        description: 'Make a web request and wait for the response'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        METHOD: {
                            type: ArgumentType.STRING,
                            menu: 'METHOD',
                            defaultValue: 'GET'
                        },
                        URL: {
                            type: ArgumentType.STRING,
                            defaultValue: 'https://'
                        },
                        BODY: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        },
                        HEADERS: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'getResponse',
                    text: formatMessage({
                        id: 'http.getResponse',
                        default: 'response',
                        description: 'Report the body of the most recent response'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getStatus',
                    text: formatMessage({
                        id: 'http.getStatus',
                        default: 'status code',
                        description: 'Report the status code of the most recent response'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getError',
                    text: formatMessage({
                        id: 'http.getError',
                        default: 'error',
                        description: 'Report why the most recent request failed'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getSucceeded',
                    text: formatMessage({
                        id: 'http.getSucceeded',
                        default: 'request succeeded?',
                        description: 'Report whether the most recent request succeeded'
                    }),
                    blockType: BlockType.BOOLEAN
                },
                '---',
                {
                    opcode: 'getJsonValue',
                    text: formatMessage({
                        id: 'http.getJsonValue',
                        default: 'json [PATH] of [TEXT]',
                        description: 'Report the value at a path in JSON text'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        PATH: {
                            type: ArgumentType.STRING,
                            defaultValue: 'key'
                        },
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: ''
                        }
                    }
                }
            ],
            menus: {
                METHOD: {
                    acceptReporters: true,
                    items: [
                        'GET',
                        'POST',
                        'PUT',
                        'PATCH',
                        'DELETE',
                        'HEAD'
                    ]
                }
            }
        };
    }

    /**
     * Make a request and store its result for the reporter blocks.
     * @param {object} args the block arguments.
     * @returns {Promise} a promise that resolves when the request finishes.
     */
    async fetch (args) {
        const method = Cast.toString(args.METHOD).trim().toUpperCase() || 'GET';
        const url = Cast.toString(args.URL).trim();
        const body = Cast.toString(args.BODY);
        const headers = this._parseHeaders(args.HEADERS);

        const init = {method, headers};
        if (body && method !== 'GET' && method !== 'HEAD') init.body = body;

        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        let timeoutId = null;
        if (controller) {
            init.signal = controller.signal;
            timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        }

        try {
            const response = await doFetch(url, init);
            this._body = await response.text();
            this._status = response.status;
            this._succeeded = response.ok;
            this._error = '';
        } catch (error) {
            this._body = '';
            this._status = 0;
            this._succeeded = false;
            this._error = this._describeError(error);
            log.warn(`HTTP extension: ${method} ${url} failed: ${this._error}`);
        } finally {
            if (timeoutId !== null) clearTimeout(timeoutId);
        }
    }

    /**
     * @param {*} error what the request failed with.
     * @returns {string} a description of the failure.
     * @private
     */
    _describeError (error) {
        if (error && error.name === 'AbortError') {
            return formatMessage({
                id: 'http.timedOut',
                default: 'Request timed out after {seconds} seconds',
                description: 'Message reported when a web request takes too long'
            }, {seconds: TIMEOUT_MS / 1000});
        }
        return error && error.message ? error.message : String(error);
    }

    /**
     * Read request headers, which are written as a JSON object.
     * @param {*} headerArg the block argument.
     * @returns {object} headers to send, or an empty object when they are unreadable.
     * @private
     */
    _parseHeaders (headerArg) {
        const text = Cast.toString(headerArg).trim();
        if (!text) return {};

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            log.warn(`HTTP extension: headers must be a JSON object, not "${text}": ${error.message}`);
            return {};
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            log.warn(`HTTP extension: headers must be a JSON object, not "${text}".`);
            return {};
        }
        return parsed;
    }

    getResponse () {
        return this._body;
    }

    getStatus () {
        return this._status;
    }

    getError () {
        return this._error;
    }

    getSucceeded () {
        return this._succeeded;
    }

    getJsonValue (args) {
        let value;
        try {
            value = JSON.parse(Cast.toString(args.TEXT));
        } catch (error) {
            log.warn(`HTTP extension: could not parse JSON: ${error.message}`);
            return '';
        }

        for (const key of this._parsePath(Cast.toString(args.PATH))) {
            if (value === null || typeof value !== 'object') return '';
            value = value[key];
            if (value === undefined) return '';
        }
        return this._toText(value);
    }

    /**
     * Split a path like `a.b[0].c` into its keys.
     * @param {string} path the path to split.
     * @returns {Array<string>} the keys, outermost first.
     * @private
     */
    _parsePath (path) {
        return path
            .replace(/\[\s*['"]?([^'"\]]*)['"]?\s*\]/g, '.$1')
            .split('.')
            .filter(key => key !== '');
    }

    /**
     * @param {*} value a value from parsed JSON.
     * @returns {string} the value as a block can report it.
     * @private
     */
    _toText (value) {
        if (value === null) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }
}

module.exports = Scratch3HttpBlocks;
