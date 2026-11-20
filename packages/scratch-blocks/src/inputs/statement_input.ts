import * as Blockly from 'blockly/core'

/** Size, in workspace units, of the button that collapses and expands a statement input. */
const TOGGLE_ICON_SIZE = 16

/** The button image while the input is expanded. Clicking it folds the input away. */
const COLLAPSE_ICON = 'collapse.svg'

/** The button image while the input is collapsed. Clicking it unfolds the input. */
const EXPAND_ICON = 'expand.svg'

/** The button's description while the input is expanded. */
const COLLAPSE_LABEL = 'Collapse statement'

/** The button's description while the input is collapsed. */
const EXPAND_LABEL = 'Expand statement'

/**
 * The folder holding block images for a block.
 *
 * A flyout workspace is built from its own options, which do not carry the
 * host's media path, so a block in the flyout has to use the path of the
 * workspace that flyout serves.
 * @param block The block whose media folder to find.
 * @returns The media folder path, with a trailing slash.
 */
function getMediaPath(block: Blockly.Block): string {
  const workspace = block.workspace
  if (workspace instanceof Blockly.WorkspaceSvg && workspace.isFlyout && workspace.targetWorkspace) {
    return workspace.targetWorkspace.options.pathToMedia
  }
  return workspace.options.pathToMedia
}

/**
 * A statement input whose contents can be folded away.
 *
 * Collapsing hides the input and everything inside it, which is what Blockly's
 * input visibility does: the input's fields are hidden, its connections stop
 * being tracked and the blocks inside it are hidden. Hiding the input also
 * hides any field placed on it, so the button that unfolds the input lives on
 * the block row above it, which is always visible.
 */
export class CollapsibleStatementInput extends Blockly.inputs.StatementInput {
  /** The button that folds this input's contents away and back again. */
  readonly toggleField: Blockly.FieldImage

  private collapsed_ = false

  private readonly media_: string

  constructor(name: string, block: Blockly.Block) {
    super(name, block)

    this.media_ = getMediaPath(block)
    this.toggleField = new Blockly.FieldImage(
      this.media_ + COLLAPSE_ICON,
      TOGGLE_ICON_SIZE,
      TOGGLE_ICON_SIZE,
      COLLAPSE_LABEL,
      () => this.setCollapsed(!this.collapsed_),
    )
  }

  /**
   * Whether this input's contents are folded away.
   * @returns True if collapsed.
   */
  isCollapsed(): boolean {
    return this.collapsed_
  }

  /**
   * Fold or unfold the input's contents and update the button to match.
   * @param collapsed True to fold the contents away.
   */
  setCollapsed(collapsed: boolean): void {
    if (collapsed === this.collapsed_) {
      return
    }
    this.collapsed_ = collapsed

    this.toggleField.setValue(this.media_ + (collapsed ? EXPAND_ICON : COLLAPSE_ICON))
    this.toggleField.setAlt(collapsed ? EXPAND_LABEL : COLLAPSE_LABEL)

    this.renderBlocks_(this.setVisible(!collapsed))

    const sourceBlock = this.getSourceBlock()
    if (sourceBlock instanceof Blockly.BlockSvg) {
      sourceBlock.render()
    }
  }

  /**
   * Render the blocks whose connections changed tracking state.
   * @param blocks The blocks to render.
   */
  private renderBlocks_(blocks: Blockly.BlockSvg[]): void {
    for (const block of blocks) {
      block.render()
    }
  }
}

Blockly.Block.prototype.appendStatementInput = function (this: Blockly.Block, name: string): Blockly.Input {
  const input = new CollapsibleStatementInput(name, this)
  // The renderer counts statement inputs to decide whether a block draws a
  // statement mouth, so the count has to include this input.
  this.statementInputCount++

  // The button has to stay visible while the input is hidden, so it goes on
  // the last row before the input instead of on the input itself.
  const rowBefore = this.inputList[this.inputList.length - 1] ?? this.appendDummyInput()
  rowBefore.appendField(input.toggleField)

  this.appendInput(input)
  return input
}
