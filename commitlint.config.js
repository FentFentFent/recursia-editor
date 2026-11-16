module.exports = {
    extends: ['@commitlint/config-conventional'],
    ignores: [message => message.startsWith('chore(release):')],
    rules: {
        'body-max-line-length': [0,'always',100]
    }
};
