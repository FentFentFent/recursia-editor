import * as Blockly from 'blockly/core'
import { BlockPadding, setBlockPadding } from './block_padding'

/**
 * Extra space, in workspace units, added around the content of an extra padded
 * block. Scratch's renderer uses a grid unit of 4, so this adds two grid units on
 * each axis.
 */
const EXTRA_PADDING = 8

/**
 * Padding applied by the `style_extrapadded` extension: an extra grid unit above
 * and below each row of content, and in the gaps between a row's elements.
 */
export const EXTRA_PADDED = new BlockPadding('extra_padded', EXTRA_PADDING, EXTRA_PADDING)

/**
 * Extension that applies `EXTRA_PADDED` to a block. The VM requests it when an
 * extension declares `Scratch.StyleShape.ExtraPadded` as a block's style.
 */
const STYLE_EXTRA_PADDED = function (this: Blockly.Block) {
	setBlockPadding(this, EXTRA_PADDED)
}

Blockly.Extensions.register('style_extrapadded', STYLE_EXTRA_PADDED)
