const Cast = require('../util/cast');


/**
 * Block implementations for the recursia module blocks.
 */
class Recursia1ModuleBlocks {
    constructor(runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
    }

    /**
     * Retrieve the block primitives implemented by this package.
     * @returns {object.<string, Function>} Mapping of opcode to Function.
     */
    getPrimitives() {
        return { // No implementation, they are just blocks used for metadata.
            modules_single_export: () => { },
            modules_reporter_export: () => { },
            modules_export: () => { }
        };
    }

}

module.exports = Recursia1ModuleBlocks;
