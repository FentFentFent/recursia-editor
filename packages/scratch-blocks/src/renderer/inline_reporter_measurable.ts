import * as Blockly from 'blockly/core'

/**
 * A single-block input's space while it holds a reporter.
 *
 * A reporter joins the input through its output connection, but the input's own
 * connection is a statement connection, so Blockly derives the slot's shape from
 * that connection and gets a statement notch. The notch places the connection a
 * notch-width from the left of the slot and near the top of the row, which
 * leaves the reporter hanging off the block's top right corner instead of in
 * the slot. The slot is a reporter slot, so its connection takes the shape of
 * the reporter's output connection instead.
 */
class InlineReporterMeasurable extends Blockly.blockRendering.InlineInput {
  constructor(constants: Blockly.blockRendering.ConstantProvider, input: Blockly.Input) {
    super(constants, input)

    const output = this.connectedBlock?.outputConnection
    if (!output) return

    const shape = constants.shapeFor(output)
    this.shape = shape
    this.isDynamicShape = 'isDynamic' in shape && shape.isDynamic

    // A reporter's shape is sized from the height of what it connects to, the
    // same way Blockly sizes a value input's shape.
    this.connectionHeight = this.isDynamicShape
      ? (shape.height as (height: number) => number)(this.height)
      : (shape.height as number)
    this.connectionWidth = this.isDynamicShape
      ? (shape.width as (height: number) => number)(this.height)
      : (shape.width as number)
    this.connectionOffsetY =
      'connectionOffsetY' in shape ? shape.connectionOffsetY(this.connectionHeight) : constants.TAB_OFFSET_FROM_TOP
    this.connectionOffsetX = 'connectionOffsetX' in shape ? shape.connectionOffsetX(this.connectionWidth) : 0
  }
}

export default InlineReporterMeasurable
