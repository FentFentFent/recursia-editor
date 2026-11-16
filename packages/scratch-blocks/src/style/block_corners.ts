import * as Blockly from 'blockly/core'

/**
 * Corner radius applied to the outline of a single block.
 *
 * The radius is in workspace units. A block without a corners style uses the
 * renderer's default radius, which is the medium radius below: that is what
 * Scratch blocks have always used. Corner styles are independent of the padding
 * styles, so a block can have both.
 */
export class BlockCorners {
	/**
	 * @param name Identifies the style that applied these corners, for debugging.
	 * @param radius Radius of the block's outside corners, in workspace units.
	 *     Zero draws square corners.
	 */
	constructor(
		readonly name: string,
		readonly radius: number,
	) {}
}

const cornersByBlock = new WeakMap<Blockly.Block, BlockCorners>()

/**
 * Returns the corners style applied to a block.
 * @param block The block to read the corners of.
 * @returns The block's corners, or `null` if it has no corners style and should
 *     use the renderer's default radius.
 */
export function getBlockCorners(block: Blockly.Block): BlockCorners | null {
	return cornersByBlock.get(block) ?? null
}

/**
 * Applies a corners style to a block. This is called by the `style_*`
 * extensions; the radius is not serialized with the block because it is always
 * re-applied from the block's definition when the block is created.
 * @param block The block to apply the corners to.
 * @param corners The corners to apply.
 */
export function setBlockCorners(block: Blockly.Block, corners: BlockCorners): void {
	cornersByBlock.set(block, corners)
}
