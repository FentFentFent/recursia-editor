
class CompilerError extends Error {
    constructor(message,{
        code = "COMPILER_ERROR",
        severity = "error",
        line = null,
        column = null,
        file = null,
        source = null,
        cause = null,
        hint = null
    } = {}) {
        super(message,{ cause });

        this.name = "CompilerError";
        this.code = code;
        this.severity = severity;

        this.location = {
            file,
            line,
            column
        };

        this.source = source;
        this.hint = hint;

        Error.captureStackTrace?.(this,CompilerError);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            severity: this.severity,
            location: this.location,
            source: this.source,
            hint: this.hint,
            stack: this.stack
        };
    }

    toString() {
        const { file,line,column } = this.location;

        const location = file
            ? `${ file }${ line ? `:${ line }` : "" }${ column ? `:${ column }` : "" }`
            : null;

        return [
            `${ this.name } [${ this.code }]`,
            location && `at ${ location }`,
            this.message,
            this.hint && `Hint: ${ this.hint }`
        ].filter(Boolean).join("\n");
    }
}

module.exports = CompilerError;
