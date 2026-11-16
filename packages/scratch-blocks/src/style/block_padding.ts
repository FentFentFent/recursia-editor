import * as Blockly from 'blockly/core'

/**
 * Extra padding applied to the layout of a single block.
 *
 * Padding is additive: Blockly already inserts its own padding while measuring
 * a block, and a `BlockPadding` only describes the space added on top of that
 * baseline. The renderer reads the padding from the block it is laying out, so
 * padding styles stay independent of each other and never need to know how a
 * block is shaped.
 *
 * Negative values reduce the baseline padding; the renderer clamps the result so
 * a padding style can shrink spacing but never produce negative geometry.
 */
export class BlockPadding {
	/** The padding of a block that has no padding style. */
	static readonly NONE = new BlockPadding('none', 0, 0)

	/**
	 * @param name Identifies the style that applied this padding, for debugging.
	 * @param vertical Extra space, in workspace units, above and below each row
	 *     of content. A spacer between two content rows therefore gains it twice.
	 * @param horizontal Extra space, in workspace units, in the ordinary gaps
	 *     between the elements of a row.
	 */
	constructor(
		readonly name: string,
		readonly vertical: number,
		readonly horizontal: number,
	) {}
}

const paddingByBlock = new WeakMap<Blockly.Block, BlockPadding>()

/**
 * Returns the padding style applied to a block.
 * @param block The block to read the padding of.
 * @returns The block's padding, or `BlockPadding.NONE` if it has no padding style.
 */
export function getBlockPadding(block: Blockly.Block): BlockPadding {
	return paddingByBlock.get(block) ?? BlockPadding.NONE
}

/**
 * Applies a padding style to a block. This is called by the `style_*`
 * extensions; padding is not serialized with the block because it is always
 * re-applied from the block's definition when the block is created.
 * @param block The block to apply the padding to.
 * @param padding The padding to apply.
 */
export function setBlockPadding(block: Blockly.Block, padding: BlockPadding): void {
	paddingByBlock.set(block, padding)
}
