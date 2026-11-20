import * as Blockly from 'blockly/core'

/** The rendering constants the inline statement input is sized from. */
interface SlotConstants {
  CORNER_RADIUS: number
  EMPTY_INLINE_INPUT_HEIGHT: number
  LARGE_PADDING: number
  MEDIUM_PADDING: number
  NOTCH_OFFSET_LEFT: number
  NOTCH_WIDTH: number
  SMALL_PADDING: number
}

/**
 * An inline statement input's space in its row.
 *
 * The input takes up the width and height of the stack connected to it, on the
 * same row as the fields before it, with padding around it, and places its
 * connection inside that padding so the stack is inset the same way. While it
 * is empty it holds a block-shaped placeholder instead.
 */
class InlineStatementMeasurable extends Blockly.blockRendering.InlineInput {
  /** Space between the stack or placeholder and the sides of the input. */
  readonly paddingX: number

  /** Space between the placeholder and the top and bottom of the input. */
  readonly paddingY: number

  /** Width of the block-shaped placeholder drawn while the input is empty. */
  readonly placeholderWidth: number

  /** Height of the block-shaped placeholder drawn while the input is empty. */
  readonly placeholderHeight: number

  constructor(constants: Blockly.blockRendering.ConstantProvider, input: Blockly.Input) {
    super(constants, input)
    const slot = constants as unknown as SlotConstants

    this.paddingX = slot.LARGE_PADDING
    this.paddingY = slot.MEDIUM_PADDING
    // A stack block's notches start a fixed distance from its left edge and the
    // body continues past them, which is the shape the placeholder copies.
    this.placeholderWidth = slot.NOTCH_OFFSET_LEFT + slot.NOTCH_WIDTH + slot.LARGE_PADDING
    this.placeholderHeight = slot.EMPTY_INLINE_INPUT_HEIGHT

    // A stack joins its previous connection at its top, so the connection is
    // inset by the top padding to leave the stack inside the slot's padding.
    this.connectionOffsetY = this.paddingY

    // The stack hangs off its previous connection, which sits inside the
    // stack's left edge, so the connection is offset to line the stack, or the
    // placeholder, up with the padding on the left.
    const previousOffsetX = this.connectedBlock?.previousConnection
      ? this.connectedBlock.previousConnection.getOffsetInBlock().x
      : slot.NOTCH_OFFSET_LEFT
    this.connectionOffsetX = this.paddingX + previousOffsetX - this.connectionWidth

    this.width = this.paddingX * 2 + (this.connectedBlock ? this.connectedBlockWidth : this.placeholderWidth)
    this.height = this.paddingY * 2 + (this.connectedBlock ? this.connectedBlockHeight : this.placeholderHeight)
  }
}

export default InlineStatementMeasurable
