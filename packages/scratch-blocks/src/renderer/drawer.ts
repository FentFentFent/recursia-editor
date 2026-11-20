/**
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'
import { ConstantProvider } from './constants'
import InlineStatementMeasurable from './inline_statement_measurable'
import type { RenderInfo } from './render_info'

/** The parts of a statement connection's notch shape. */
interface StatementNotchShape {
  pathLeft: string
  pathRight: string
}

/** The rendering constants the placeholder slot is built from. */
interface SlotConstants {
  CORNER_RADIUS: number
  NOTCH_OFFSET_LEFT: number
  NOTCH_WIDTH: number
}

export class Drawer extends Blockly.zelos.Drawer {
  declare constants_: ConstantProvider
  declare info_: RenderInfo

  override drawStatementInput_(row: Blockly.blockRendering.Row) {
    if (this.info_.isBowlerHatBlock()) {
      // Bowler hat blocks have straight sides with no C-shape/indentation for
      // statement blocks.
      this.drawRightSideRow_(row)
      this.positionStatementInputConnection_(row)
    } else {
      super.drawStatementInput_(row)
    }
  }

  override drawInlineInput_(input: Blockly.blockRendering.InlineInput) {
    if (!(input instanceof InlineStatementMeasurable)) {
      super.drawInlineInput_(input)
      return
    }

    this.positionInlineInputConnection_(input)

    // A connected stack covers the input's space, so the slot is only drawn
    // while the input is empty.
    if (input.connectedBlock || this.info_.isInsertionMarker) {
      return
    }

    // zelos only draws inline inputs with dynamic (value) shapes, and a
    // connection's notch says nothing about what connects to it. The empty
    // input is drawn as the outline of a stack block instead: a block with a
    // previous-statement notch in its top edge and a next-statement notch on
    // its bottom edge, padded inside the input's space.
    const svgPaths = Blockly.utils.svgPaths
    const constants = this.constants_ as unknown as SlotConstants
    const shape = input.shape as unknown as StatementNotchShape
    const radius = this.info_.getCornerRadius()
    const corners = this.constants_.makeOutsideCornersForRadius(radius)

    // The placeholder starts where a connected stack would start, inside the
    // input's padding, so it does not move when one is dropped on it.
    const x = input.xPos + input.paddingX
    const y = input.centerline - input.height / 2 + input.paddingY
    const width = input.placeholderWidth
    const height = input.placeholderHeight

    // The notches sit where a stack block's do: a fixed distance from the left
    // edge, with the body continuing past them. Their paths do not scale with
    // the corner radius, so their span comes from the default one.
    const notchStart = x + constants.NOTCH_OFFSET_LEFT
    const notchEnd = notchStart + constants.NOTCH_WIDTH - constants.CORNER_RADIUS
    const leftInset = notchStart - (x + radius)
    const rightInset = x + width - radius - notchEnd

    const path =
      svgPaths.moveTo(x, y) +
      corners.topLeft +
      svgPaths.lineOnAxis('h', leftInset) +
      shape.pathLeft +
      svgPaths.lineOnAxis('h', rightInset) +
      corners.topRight +
      svgPaths.lineOnAxis('v', height - 2 * radius) +
      corners.bottomRight +
      svgPaths.lineOnAxis('h', -rightInset) +
      shape.pathRight +
      svgPaths.lineOnAxis('h', -leftInset) +
      corners.bottomLeft +
      svgPaths.lineOnAxis('v', -(height - 2 * radius)) +
      'z'

    const pathObject = this.block_.pathObject as Blockly.zelos.PathObject
    pathObject.setOutlinePath(input.input.name, path)
  }

  override drawRightSideRow_(row: Blockly.blockRendering.Row) {
    if (this.info_.isBowlerHatBlock() && Blockly.blockRendering.Types.isSpacer(row)) {
      // Multi-row bowler hat blocks are not supported, this may need
      // adjustment to do so.
      this.outlinePath_ += Blockly.utils.svgPaths.lineOnAxis('V', row.yPos + row.height)
    } else {
      super.drawRightSideRow_(row)
    }
  }

  override drawTop_() {
    this.drawWithBlockCorners_(() => {
      super.drawTop_()

      const replacementTop = this.makeReplacementTop_()
      if (replacementTop) {
        const capHatPath = this.constants_.START_HAT.path
        this.outlinePath_ = this.outlinePath_.replace(capHatPath, replacementTop)
      }
    })
  }

  makeReplacementTop_() {
    if (this.info_.isBowlerHatBlock()) {
      // Ugly ugly hack.
      return this.constants_.makeBowlerHatPath(this.info_.width)
    }
  }

  override drawConnectionHighlightPath(measurable: Blockly.blockRendering.Connection) {
    const conn = measurable.connectionModel
    const connectionType: Blockly.ConnectionType = conn.type

    const isInlineStatement = connectionType === Blockly.ConnectionType.NEXT_STATEMENT && measurable.isDynamicShape

    const isInlineValue = connectionType === Blockly.ConnectionType.INPUT_VALUE && measurable.isDynamicShape

    if (isInlineValue || isInlineStatement) {
      const input = measurable as Blockly.blockRendering.InlineInput

      const EXPAND_X = 0.5
      const EXPAND_Y = 2

      const xPos = input.connectionWidth - EXPAND_X
      const yPos = -input.height / 2 - EXPAND_Y

      const width = input.width - input.connectionWidth * 2 + 2 * EXPAND_X
      const height = input.height + 2 * EXPAND_Y

      const shape = input.shape as Blockly.blockRendering.DynamicShape

      const path =
        Blockly.utils.svgPaths.moveTo(xPos, yPos) +
        Blockly.utils.svgPaths.lineOnAxis('h', width) +
        shape.pathRightDown(height) +
        Blockly.utils.svgPaths.lineOnAxis('h', -width) +
        shape.pathUp(height) +
        'z'

      const block = conn.getSourceBlock()

      return block.pathObject.addConnectionHighlight?.(conn, path, conn.getOffsetInBlock(), block.RTL)
    }

    return super.drawConnectionHighlightPath(measurable)
  }

  override drawBottom_() {
    this.drawWithBlockCorners_(() => super.drawBottom_())
  }

  drawWithBlockCorners_(draw: () => void) {
    const radius = this.info_.getCornerRadius()

    if (radius === this.constants_.CORNER_RADIUS) {
      draw()
      return
    }

    const constants = Object.create(this.constants_) as ConstantProvider
    constants.OUTSIDE_CORNERS = this.constants_.makeOutsideCornersForRadius(radius)

    const defaultConstants = this.constants_

    try {
      this.constants_ = constants
      draw()
    } finally {
      this.constants_ = defaultConstants
    }
  }
}
