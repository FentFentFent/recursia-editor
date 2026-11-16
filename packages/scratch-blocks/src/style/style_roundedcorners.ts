import * as Blockly from 'blockly/core'
import { BlockCorners, setBlockCorners } from './block_corners'

/**
 * Corner radii, in workspace units. Scratch's renderer uses a grid unit of 4, so
 * the medium radius is one grid unit and the others scale from it.
 */
export const NO_ROUNDED_CORNERS = new BlockCorners('no_rounded_corners', 0)
export const SMALL_ROUNDED_CORNERS = new BlockCorners('small_rounded_corners', 2)
export const MEDIUM_ROUNDED_CORNERS = new BlockCorners('medium_rounded_corners', 4)
export const BIG_ROUNDED_CORNERS = new BlockCorners('big_rounded_corners', 8)
export const EXTREME_ROUNDED_CORNERS = new BlockCorners('extreme_rounded_corners', 16)

/**
 * Makes an extension that applies a corners style to a block. The VM requests
 * these when an extension declares a `Scratch.StyleShape.*RoundedCorners` entry
 * in a block's style.
 * @param corners The corners to apply.
 * @returns An extension function that applies the given corners.
 */
const styleCorners = function (corners: BlockCorners): () => void {
	return function (this: Blockly.Block) {
		setBlockCorners(this, corners)
	}
}

Blockly.Extensions.register('style_noroundedcorners', styleCorners(NO_ROUNDED_CORNERS))
Blockly.Extensions.register('style_smallroundedcorners', styleCorners(SMALL_ROUNDED_CORNERS))
Blockly.Extensions.register('style_mediumroundedcorners', styleCorners(MEDIUM_ROUNDED_CORNERS))
Blockly.Extensions.register('style_bigroundedcorners', styleCorners(BIG_ROUNDED_CORNERS))
Blockly.Extensions.register('style_extremeroundedcorners', styleCorners(EXTREME_ROUNDED_CORNERS))
