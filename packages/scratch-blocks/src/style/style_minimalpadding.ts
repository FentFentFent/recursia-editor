import * as Blockly from 'blockly/core'
import { BlockPadding, setBlockPadding } from './block_padding'

/**
 * Space removed from the content of a minimally padded block. Scratch's renderer
 * uses a grid unit of 4, so this removes one grid unit on each axis from the
 * baseline padding.
 */
const MINIMAL_PADDING = -4

/**
 * Padding applied by the `style_minimalpadding` extension: one grid unit less
 * than the default above and below each row of content, and in the gaps between
 * a row's elements.
 */
export const MINIMAL_PADDED = new BlockPadding('minimal_padded', MINIMAL_PADDING, MINIMAL_PADDING)

/**
 * Extension that applies `MINIMAL_PADDED` to a block. The VM requests it when an
 * extension declares `Scratch.StyleShape.MinimalPadding` as a block's style.
 */
const STYLE_MINIMAL_PADDING = function (this: Blockly.Block) {
	setBlockPadding(this, MINIMAL_PADDED)
}

Blockly.Extensions.register('style_minimalpadding', STYLE_MINIMAL_PADDING)
