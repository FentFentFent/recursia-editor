/**
 * @typedef {object} ExtensionMetadata
 * All the metadata needed to register an extension.
 * @property {string} id - a unique alphanumeric identifier for this extension. No special characters allowed.
 * @property {string} [name] - the human-readable name of this extension.
 * @property {string} [blockIconURI] - URI for an image to be placed on each block in this extension. Data URI ok.
 * @property {string} [menuIconURI] - URI for an image to be placed on this extension's category menu item. Data URI ok.
 * @property {string} [docsURI] - link to documentation content for this extension.
 * @property {ColorStyle} [colorStyle] - colors for this extension's category and blocks in each color mode.
 * @property {Array.<ExtensionBlockMetadata|string>} blocks - the blocks provided by this extension, plus separators.
 * @property {Object.<ExtensionMenuMetadata>} [menus] - map of menu name to metadata for each of this extension's menus.
 */

/**
 * @typedef {object} ExtensionBlockMetadata
 * All the metadata needed to register an extension block.
 * @property {string} [opcode] - a unique alphanumeric identifier for this block. No special characters allowed.
 * @property {string} [func] - the name of the function implementing this block. Can be shared by other blocks/opcodes.
 * @property {BlockType} blockType - the type of block (command, reporter, label, etc.) being described.
 * @property {string} [text] - the text on the block, with [PLACEHOLDERS] for arguments. For a LABEL entry, the
 * @property {'any'|'string'|'number'|'boolean'|undefined} [returnType] - The optional return type of a BlockType.REPORTER block, left undefined will give 'string' by default.
 * text displayed on the label.
 * @property {string} [xml] - for an XML entry, the Blockly XML inserted into the block palette.
 * @property {boolean} [hideFromPalette] - true if this block should not appear in the block palette.
 * @property {boolean} [isTerminal] - true if the block ends a stack - no blocks can be connected after it.
 * @property {boolean} [disableMonitor] - true if this block is a reporter but should not allow a monitor.
 * @property {ReporterScope} [reporterScope] - if this block is a reporter, this is the scope/context for its value.
 * @property {boolean} [isEdgeActivated] - sets whether a hat block is edge-activated.
 * @property {boolean} [shouldRestartExistingThreads] - sets whether a hat/event block should restart existing threads.
 * @property {int} [branchCount] - for flow control blocks, the number of branches/substacks for this block.
 * @property {Object.<ExtensionArgumentMetadata>} [arguments] - map of argument placeholder to metadata about each arg.
 * @property {StyleType|Array.<StyleType>} [style] - Visual styles applied to the block, if any.
 * @property {ColorStyle} [colorStyle] - overrides the extension's color style for this block, if any.
 * @property {ExtensionCompileFunction} [compile] - compiles this block to JavaScript instead of running it through
 * the interpreter. Only unsandboxed extensions can provide it: a function cannot cross the worker boundary.
 */

/**
 * @typedef {Function} ExtensionCompileFunction
 * Compiles one block of an unsandboxed extension to JavaScript.
 * @param {CompileBlockContext} context - the block being compiled, and the helpers that read its inputs, branches and
 * fields. See `src/compiler/compile-block-context.js`.
 * @returns {string|{lines: Array.<string>, source: string}} For a command, the source lines that run the block. For a
 * reporter or boolean, the expression that holds its value, or an object of lines that run first and that expression.
 */

/**
 * @typedef {object} ColorStyleColors
 * The block colors for a single color mode.
 * @property {string} color1 - the primary color, used for the block's fill, in '#rrggbb' format
 * @property {string} [color2] - the secondary color, used for the block's outline; defaults to color1
 * @property {string} [color3] - the tertiary color, used for fields and inputs; defaults to color2 or color1
 */

/**
 * @typedef {object} ColorStyle
 * The colors used by an extension's category and blocks, per color mode. Each color mode key may hold either
 * the colors for that mode or the name of a built-in block color style (see ColorStyle in color-style.js) to
 * extend for that mode. Color modes without their own entry use `base`; without a `base` the extension's
 * color1, color2 and color3 are used in the default color mode and the built-in extension colors are used in
 * the other color modes.
 * @property {string|ColorStyleColors} [base] - the color style for color modes without their own entry
 * @property {string|ColorStyleColors} [default] - the color style for the default ("original") color mode
 * @property {string|ColorStyleColors} [dark] - the color style for the dark color mode
 * @property {string|ColorStyleColors} [high-contrast] - the color style for the high contrast color mode
 * @property {string|ColorStyleColors} [cherry-light] - the color style for the cherry light color mode
 * @property {string|ColorStyleColors} [cherry-dark] - the color style for the cherry dark color mode
 */

/**
 * @typedef {object} ExtensionArgumentMetadata
 * All the metadata needed to register an argument for an extension block.
 * @property {ArgumentType} type - the type of the argument (number, string, etc.)
 * @property {*} [defaultValue] - the default value of this argument.
 * @property {string} [menu] - the name of the menu to use for this argument, if any.
 */

/**
 * @typedef {ExtensionDynamicMenu|ExtensionMenuItems} ExtensionMenuMetadata
 * All the metadata needed to register an extension drop-down menu.
 */

/**
 * @typedef {string} ExtensionDynamicMenu
 * The string name of a function which returns menu items.
 * @see {ExtensionMenuItems} - the type of data expected to be returned by the specified function.
 */

/**
 * @typedef {Array.<ExtensionMenuItemSimple|ExtensionMenuItemComplex>} ExtensionMenuItems
 * Items in an extension menu.
 */

/**
 * @typedef {string} ExtensionMenuItemSimple
 * A menu item for which the label and value are identical strings.
 */

/**
 * @typedef {object} ExtensionMenuItemComplex
 * A menu item for which the label and value can differ.
 * @property {*} value - the value of the block argument when this menu item is selected.
 * @property {string} text - the human-readable label of this menu item in the menu.
 */
