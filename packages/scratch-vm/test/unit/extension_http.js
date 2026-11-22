const test = require('tap').test;
const Http = require('../../src/extensions/scratch3_http');

const makeResponse = (body, status = 200, ok = true) => ({
    ok,
    status,
    text: () => Promise.resolve(body)
});

/**
 * Run `run` with a stand-in for the global fetch.
 * @param {Function} fakeFetch the stand-in.
 * @param {Function} run the function to run.
 * @returns {Promise<*>} whatever `run` returns.
 */
const withFetch = async (fakeFetch, run) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
        return await run();
    } finally {
        globalThis.fetch = originalFetch;
    }
};

test('getInfo describes the blocks', t => {
    const info = new Http().getInfo();
    t.equal(info.id, 'http');
    t.equal(info.colorStyle, 'http', 'the extension names its color style');
    t.same(
        info.blocks.filter(block => typeof block === 'object').map(block => block.opcode),
        ['fetch', 'getResponse', 'getStatus', 'getError', 'getSucceeded', 'getJsonValue']
    );
    t.same(info.menus.METHOD.items, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
    t.end();
});

test('fetch stores the response and forwards the request', async t => {
    let received;
    const blocks = new Http();
    await withFetch(
        (url, init) => {
            received = {url, init};
            return Promise.resolve(makeResponse('{"ok":true}'));
        },
        () => blocks.fetch({
            METHOD: 'post',
            URL: 'https://example.com/data',
            BODY: '{"a":1}',
            HEADERS: '{"Authorization":"token"}'
        })
    );

    t.equal(received.url, 'https://example.com/data');
    t.equal(received.init.method, 'POST', 'the method is upper-cased');
    t.equal(received.init.body, '{"a":1}');
    t.same(received.init.headers, {Authorization: 'token'});
    t.equal(blocks.getResponse(), '{"ok":true}');
    t.equal(blocks.getStatus(), 200);
    t.equal(blocks.getSucceeded(), true);
    t.equal(blocks.getError(), '');
    t.end();
});

test('GET requests do not send a body', async t => {
    let init;
    const blocks = new Http();
    await withFetch(
        (url, options) => {
            init = options;
            return Promise.resolve(makeResponse('ok'));
        },
        () => blocks.fetch({METHOD: 'GET', URL: 'https://example.com', BODY: 'ignored', HEADERS: ''})
    );

    t.notOk(Object.prototype.hasOwnProperty.call(init, 'body'), 'the body is left out');
    t.same(init.headers, {}, 'no headers are sent when none are given');
    t.end();
});

test('unreadable headers are ignored', async t => {
    let init;
    const blocks = new Http();
    await withFetch(
        (url, options) => {
            init = options;
            return Promise.resolve(makeResponse('ok'));
        },
        () => blocks.fetch({METHOD: 'GET', URL: 'https://example.com', HEADERS: 'not json'})
    );

    t.same(init.headers, {});
    t.end();
});

test('a failed request reports its error', async t => {
    const blocks = new Http();
    await withFetch(
        () => Promise.reject(new Error('network down')),
        () => blocks.fetch({METHOD: 'GET', URL: 'https://example.com'})
    );

    t.equal(blocks.getResponse(), '', 'there is no response');
    t.equal(blocks.getStatus(), 0);
    t.equal(blocks.getSucceeded(), false);
    t.equal(blocks.getError(), 'network down');
    t.end();
});

test('an HTTP error status is a readable response', async t => {
    const blocks = new Http();
    await withFetch(
        () => Promise.resolve(makeResponse('not found', 404, false)),
        () => blocks.fetch({METHOD: 'GET', URL: 'https://example.com/missing'})
    );

    t.equal(blocks.getResponse(), 'not found', 'the body is still readable');
    t.equal(blocks.getStatus(), 404);
    t.equal(blocks.getSucceeded(), false);
    t.equal(blocks.getError(), '', 'an HTTP status is not a request failure');
    t.end();
});

test('json reads values at a path', t => {
    const blocks = new Http();
    const text = '{"name":"Ada","tags":["a","b"],"inner":{"count":2},"nothing":null}';

    t.equal(blocks.getJsonValue({PATH: 'name', TEXT: text}), 'Ada');
    t.equal(blocks.getJsonValue({PATH: 'tags[1]', TEXT: text}), 'b');
    t.equal(blocks.getJsonValue({PATH: 'inner.count', TEXT: text}), '2');
    t.equal(blocks.getJsonValue({PATH: 'tags', TEXT: text}), '["a","b"]', 'objects are reported as text');
    t.equal(blocks.getJsonValue({PATH: 'missing', TEXT: text}), '');
    t.equal(blocks.getJsonValue({PATH: 'nothing', TEXT: text}), '', 'null reports as empty text');
    t.equal(blocks.getJsonValue({PATH: '', TEXT: '3'}), '3', 'an empty path reads the whole value');
    t.equal(blocks.getJsonValue({PATH: 'a', TEXT: 'not json'}), '', 'unreadable JSON reports empty text');
    t.end();
});
