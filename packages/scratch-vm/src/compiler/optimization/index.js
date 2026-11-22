const constantVariables = require('./stages/constant-variables');
const deadCodeElimination = require('./stages/dead-code-elimination');
const typeAnalysis = require('./stages/type-analysis');

/**
 * Optimization stages, in the order they run.
 *
 * Constant folding goes first so the type analysis can see the literal values
 * it leaves behind, and the type analysis goes before dead code so the dead
 * code stage can see the literal tests it leaves behind.
 * @type {Array.<{optimize: function(Array.<object>, object): Array.<object>}>}
 */
const stages = [
	constantVariables,
	typeAnalysis,
	deadCodeElimination
];

/**
 * Optimize the IR of a compiled script.
 * @param {Array.<object>} statements Statements of the script.
 * @param {object} context Facts the stages optimize with.
 * @returns {Array.<object>} Optimized statements.
 */
const optimize = (statements, context = {}) => stages.reduce(
	(current, stage) => stage.optimize(current, context),
	statements
);

module.exports = {optimize, stages};
