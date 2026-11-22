/**
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'
import { getBlockCorners } from '../style/block_corners'
import { getBlockPadding } from '../style/block_padding'
import { BowlerHat } from './bowler_hat'
import { ConstantProvider } from './constants'
import InlineReporterMeasurable from './inline_reporter_measurable'
import InlineStatementInput from '../inputs/inline_statement_input'
import InlineStatementMeasurable from './inline_statement_measurable'
import { SingleBlockInput } from '../inputs/single_block_input'
import { SingleStatementInput } from '../inputs/single_statement_input'

// Blockly's BlockSvg types previousConnection and nextConnection as non-null,
// but blocks without those connectors have them as null at runtime. This type
// corrects that so null checks are recognized instead of suppressed.
type BlockSvgWithNullableConnections = Omit<Blockly.BlockSvg, 'previousConnection' | 'nextConnection'> & {
  previousConnection: Blockly.RenderedConnection | null
  nextConnection: Blockly.RenderedConnection | null
}

export class RenderInfo extends Blockly.zelos.RenderInfo {
  declare constants_: ConstantProvider

  override populateTopRow_() {
    if (this.isBowlerHatBlock()) {
      const bowlerHat = this.makeBowlerHat()
      this.topRow.elements.push(new Blockly.blockRendering.SquareCorner(this.constants_))
      this.topRow.elements.push(bowlerHat)
      this.topRow.elements.push(new Blockly.blockRendering.SquareCorner(this.constants_))
      this.topRow.minHeight = 0
      this.topRow.capline = bowlerHat.ascenderHeight
    } else {
      super.populateTopRow_()
      if (this.hasRoundedOutline()) {
        this.applyCornerRadius_(this.topRow)
        this.topRow.minHeight = Math.max(this.topRow.minHeight, this.getCornerRadius())
      }
    }
  }

  override populateBottomRow_() {
    super.populateBottomRow_()
    if (this.hasRoundedOutline()) {
      this.applyCornerRadius_(this.bottomRow)
    }
    const minHeight = this.isBowlerHatBlock() ? this.constants_.MEDIUM_PADDING : 0
    this.bottomRow.minHeight = Math.max(
      this.bottomRow.minHeight,
      minHeight,
      this.hasRoundedOutline() ? this.getCornerRadius() : 0,
    )
  }

  override computeBounds_() {
    super.computeBounds_()
    if (!this.isBowlerHatBlock()) return

    // The hat spans the widest part of the block. A procedure definition keeps
    // its prototype in a statement input, so its hat stretches over the
    // statement row and anything plugged into it. Hat blocks without a
    // statement have no row wider than the block itself, so the width that
    // super.computeBounds_() already calculated is the right one.
    const statementRow = this.rows.find((row) => row.hasStatement)
    const statementInput = statementRow?.elements.find((e) => Blockly.blockRendering.Types.isInput(e))
    if (statementRow && statementInput) {
      this.width = statementRow.widthWithConnectedBlocks - statementInput.width + this.constants_.MEDIUM_PADDING
    }

    // The bowler hat's width is the same as the block's width, so it can't be
    // derived from the constants like a normal hat and has to be set here.
    // populateTopRow_ always adds a hat element for bowler hat blocks.
    const hat = this.topRow.elements.find((e) => Blockly.blockRendering.Types.isHat(e))
    if (!hat) {
      throw new Error('[renderer/render_info] Missing hat measurable for bowler hat block')
    }
    hat.width = this.width
    this.topRow.measure()
  }
    override addInput_(
        input: Blockly.Input,
        activeRow: Blockly.blockRendering.Row,
    ) {
        // A single-block input holding a reporter is laid out like a value
        // input, which puts the reporter in the slot instead of positioning it
        // as if it were a stack.
        if (input instanceof SingleBlockInput && input.holdsReporter()) {
            activeRow.elements.push(
                new InlineReporterMeasurable(this.constants_,input),
            )

            activeRow.hasInlineInput = true

            activeRow.align ??= input.align;

            return
        }

        if (input instanceof InlineStatementInput || input instanceof SingleStatementInput) {
            activeRow.elements.push(
                new InlineStatementMeasurable(this.constants_,input),
            )

            activeRow.hasInlineInput = true

            activeRow.align ??= input.align;

            return
        }

        super.addInput_(input,activeRow)
    }
    override shouldStartNewRow_(
        currInput: Blockly.Input,
        prevInput: Blockly.Input,
    ): boolean {
        if (currInput instanceof InlineStatementInput || currInput instanceof SingleStatementInput) {
            return false
        }

        return super.shouldStartNewRow_(currInput,prevInput)
    }
  override getInRowSpacing_(
    prev: Blockly.blockRendering.Measurable | null,
    next: Blockly.blockRendering.Measurable | null,
  ): number {
    if (
      this.isBowlerHatBlock() &&
      ((prev && Blockly.blockRendering.Types.isHat(prev)) || (next && Blockly.blockRendering.Types.isHat(next)))
    ) {
      // Bowler hat rows have no spacing/gaps, just the hat.
      return 0
    }

    const Types = Blockly.blockRendering.Types
    if (
      prev !== null &&
      Types.isLeftRoundedCorner(prev) &&
      next !== null &&
      (Types.isPreviousConnection(next) || Types.isNextConnection(next))
    ) {
      // The notch follows the rounded corner, so its gap is whatever the notch
      // offset leaves once the block's corner has taken its share. The corner's
      // width depends on the block's corner style, not on the renderer's
      // default radius, and the notch must stay put for every style.
      return Math.max(0, this.constants_.NOTCH_OFFSET_LEFT - this.getCornerRadius())
    }

    return this.applyHorizontalPadding_(super.getInRowSpacing_(prev, next), prev, next)
  }

  override getSpacerRowHeight_(prev: Blockly.blockRendering.Row, next: Blockly.blockRendering.Row): number {
    const height = this.isBowlerHatBlock() && prev === this.topRow ? 0 : super.getSpacerRowHeight_(prev, next)
    return Math.max(0, height + getBlockPadding(this.block_).vertical * this.getSpacerRowPaddingFactor_(prev, next))
  }

  override getElemCenterline_(row: Blockly.blockRendering.Row, elem: Blockly.blockRendering.Measurable): number {
    if (this.isBowlerHatBlock() && Blockly.blockRendering.Types.isField(elem)) {
      return row.yPos + row.height / 2
    } else if (
      'isScratchExtension' in this.block_ &&
      this.block_.isScratchExtension &&
      Blockly.blockRendering.Types.isField(elem) &&
      elem.field instanceof Blockly.FieldImage &&
      elem.field === this.block_.inputList[0].fieldRow[0] &&
      // Hat-style extension blocks have no previousConnection and use their
      // own centering; only offset stack-style extensions.
      (this.block_ as BlockSvgWithNullableConnections).previousConnection
    ) {
      // Vertically center the icon on extension blocks.
      return super.getElemCenterline_(row, elem) + this.constants_.GRID_UNIT
    }
    return super.getElemCenterline_(row, elem)
  }

  /**
   * Reserves the space the block's rounded corners take in a row.
   *
   * Blockly's corner measurables always have the renderer's default radius, but
   * the outline draws the block's own radius. The row has to reserve the width
   * that is actually drawn, or every element after the corner, the connection
   * notch included, is laid out at the wrong place.
   * @param row The top or bottom row whose corners to resize.
   */
  applyCornerRadius_(row: Blockly.blockRendering.Row) {
    const radius = this.getCornerRadius()
    const Types = Blockly.blockRendering.Types
    for (const elem of row.elements) {
      if (Types.isLeftRoundedCorner(elem) || Types.isRightRoundedCorner(elem)) {
        elem.width = radius
      }
    }
  }

  /**
   * Adds the block's horizontal padding to the gap between two elements.
   *
   * Only the ordinary gap between two content elements is padded. A gap next to
   * a previous or next connection is not: it positions the block's notch, which
   * must stay at the same horizontal position whatever the padding, or blocks
   * with different padding styles no longer line up when stacked. The notch gap
   * happens to equal the ordinary gap in size, so it cannot be recognized by
   * its size alone. Every other spacing Blockly reports is derived from the
   * block's geometry (corners, statement inputs, dynamic output shapes) and is
   * left alone as well.
   * @param spacing The spacing computed for the gap between two elements.
   * @param prev The element before the gap, if any.
   * @param next The element after the gap, if any.
   * @returns The spacing to use.
   */
  applyHorizontalPadding_(
    spacing: number,
    prev: Blockly.blockRendering.Measurable | null,
    next: Blockly.blockRendering.Measurable | null,
  ): number {
    if (spacing !== this.constants_.MEDIUM_PADDING) return spacing

    const Types = Blockly.blockRendering.Types
    const bordersNotch =
      (prev !== null && (Types.isPreviousConnection(prev) || Types.isNextConnection(prev))) ||
      (next !== null && (Types.isPreviousConnection(next) || Types.isNextConnection(next)))
    if (bordersNotch) return spacing

    return Math.max(0, spacing + getBlockPadding(this.block_).horizontal)
  }

  /**
   * The number of content rows a spacer row sits between.
   *
   * Vertical padding is applied above and below each content row, so a spacer
   * next to the block's top or bottom row receives it once, while a spacer
   * between two content rows receives it twice. Spacers that are not adjacent
   * to any content row are not padded.
   * @param prev The row before the spacer.
   * @param next The row after the spacer.
   * @returns The number of content rows the spacer is adjacent to.
   */
  getSpacerRowPaddingFactor_(prev: Blockly.blockRendering.Row, next: Blockly.blockRendering.Row): number {
    let factor = 2
    if (Blockly.blockRendering.Types.isTopRow(prev)) factor--
    if (Blockly.blockRendering.Types.isBottomRow(next)) factor--
    return factor
  }

  isBowlerHatBlock() {
    return this.block_.hat === 'bowler'
  }

  /**
   * The radius of this block's outside corners: the radius its corners style
   * asks for, or the renderer's default (medium) radius when it has no style.
   *
   * A block with a previous or next connection caps its radius at the notch
   * offset. A larger corner would cover the notch, and moving the notch out of
   * its way would misalign the block with every other block.
   * @returns The corner radius, in workspace units.
   */
  getCornerRadius(): number {
    const radius = getBlockCorners(this.block_)?.radius ?? this.constants_.CORNER_RADIUS
    const connections = this.block_ as BlockSvgWithNullableConnections
    if (connections.previousConnection || connections.nextConnection) {
      return Math.min(radius, this.constants_.NOTCH_OFFSET_LEFT)
    }
    return radius
  }

  /**
   * Whether this block's outline is drawn with outside corners. Blocks with a
   * dynamic output connection are drawn with flat top and bottom edges instead,
   * so a corner radius does not apply to them.
   * @returns True if the block's corner radius shapes its outline.
   */
  hasRoundedOutline(): boolean {
    return !(this.outputConnection?.isDynamicShape && !this.hasStatementInput && !this.block_.nextConnection)
  }

  makeBowlerHat() {
    return new BowlerHat(this.constants_)
  }
}
