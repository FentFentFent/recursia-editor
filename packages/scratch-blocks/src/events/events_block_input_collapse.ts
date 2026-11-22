/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'

/**
 * A statement input that can fold its contents away.
 */
interface CollapsibleInput extends Blockly.inputs.Input {
  isCollapsed(): boolean
  setCollapsed(collapsed: boolean, opt_fireEvent?: boolean): void
}

/**
 * Whether the given input can be folded away.
 * @param input The input to check.
 * @returns True if the input has a collapsed state.
 */
function isCollapsibleInput(input: Blockly.inputs.Input | null): input is CollapsibleInput {
  return !!input && typeof (input as CollapsibleInput).setCollapsed === 'function'
}

/**
 * Event fired when a collapsible statement input is folded away or unfolded.
 */
export class BlockInputCollapse extends Blockly.Events.BlockBase {
  inputName!: string
  newCollapsed!: boolean
  oldCollapsed!: boolean

  constructor(block?: Blockly.Block, inputName?: string, collapsed?: boolean, oldCollapsed?: boolean) {
    super(block)
    this.type = 'block_input_collapse'
    if (inputName !== undefined) this.inputName = inputName
    if (collapsed !== undefined) this.newCollapsed = collapsed
    if (oldCollapsed !== undefined) this.oldCollapsed = oldCollapsed
  }

  toJson(): BlockInputCollapseJson {
    return {
      ...super.toJson(),
      inputName: this.inputName,
      collapsed: this.newCollapsed,
      oldCollapsed: this.oldCollapsed,
    }
  }

  static fromJson(
    json: BlockInputCollapseJson,
    workspace: Blockly.Workspace,
    event?: Blockly.Events.Abstract,
  ): BlockInputCollapse {
    const newEvent = super.fromJson(json, workspace, event ?? new BlockInputCollapse()) as BlockInputCollapse
    newEvent.inputName = json.inputName
    newEvent.newCollapsed = json.collapsed
    newEvent.oldCollapsed = json.oldCollapsed

    return newEvent
  }

  run(forward: boolean) {
    if (!this.blockId) return
    const workspace = this.getEventWorkspace_()
    const block = workspace.getBlockById(this.blockId)
    if (!block) {
      console.warn('BlockInputCollapse.run: block not found', this.blockId, this.workspaceId)
      return
    }
    const input = block.getInput(this.inputName)
    if (!isCollapsibleInput(input)) {
      console.warn('BlockInputCollapse.run: input not found', this.inputName, this.blockId)
      return
    }
    input.setCollapsed(forward ? this.newCollapsed : this.oldCollapsed)
  }
}

interface BlockInputCollapseJson extends Blockly.Events.BlockBaseJson {
  inputName: string
  collapsed: boolean
  oldCollapsed: boolean
}

Blockly.registry.register(Blockly.registry.Type.EVENT, 'block_input_collapse', BlockInputCollapse)
