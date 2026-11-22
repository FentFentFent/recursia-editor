/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Tests for the bubble a clicked reporter shows its value in. Blocks that are only
// inputs, such as an extension's reporter, have no field to line the bubble up with,
// and a clicked reporter reports again while its thread runs, so the second value has
// to replace the first rather than arrive without a bubble or stack up beside it.
import * as Blockly from 'blockly/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { reportValue } from '../../src/block_reporting'
import '../../src/renderer/renderer'
import { ScratchMsgs } from '../../src/scratch_msgs'

const NO_FIELD_BLOCK = 'test_report_inputs_only'
const FIELD_BLOCK = 'test_report_with_field'

let container: HTMLElement
let workspace: Blockly.WorkspaceSvg

beforeAll(() => {
  ScratchMsgs.setLocale('en')
  container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  workspace = Blockly.inject(container, { renderer: 'scratch_classic' })

  Blockly.defineBlocksWithJsonArray([
    {
      type: NO_FIELD_BLOCK,
      message0: '%1 %2',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'input_value', name: 'B' },
      ],
      output: 'Number',
    },
    {
      type: FIELD_BLOCK,
      message0: 'field %1',
      args0: [{ type: 'field_label', name: 'LABEL', text: 'value' }],
      output: 'Number',
    },
  ])
})

afterAll(() => {
  delete Blockly.Blocks[NO_FIELD_BLOCK]
  delete Blockly.Blocks[FIELD_BLOCK]
  workspace.dispose()
  container.remove()
})

afterEach(() => {
  Blockly.DropDownDiv.hideWithoutAnimation()
  Blockly.DropDownDiv.clearContent()
  workspace.clear()
})

/**
 * Create and render a block at a fixed position in the test workspace.
 * @param type The block type to create.
 * @returns The created block.
 */
function createBlock(type: string): Blockly.BlockSvg {
  const block = workspace.newBlock(type) as Blockly.BlockSvg
  block.initSvg()
  block.render()
  return block
}

/**
 * The values the open bubble is showing.
 * @returns Text of each value box in the bubble.
 */
function reportedValues(): string[] {
  return Array.from(
    Blockly.DropDownDiv.getContentDiv().querySelectorAll('.valueReportBox'),
  ).map((box) => box.textContent ?? '')
}

describe('reporting a value', () => {
  it('shows the value of a block that has no field', () => {
    const block = createBlock(NO_FIELD_BLOCK)

    reportValue(block.id, '3')

    expect(Blockly.DropDownDiv.isVisible()).toBe(true)
    expect(reportedValues()).toEqual(['3'])
  })

  it('shows the value of a block that has a field', () => {
    const block = createBlock(FIELD_BLOCK)

    reportValue(block.id, '7')

    expect(Blockly.DropDownDiv.isVisible()).toBe(true)
    expect(reportedValues()).toEqual(['7'])
  })

  it('replaces the value when the block reports again', () => {
    const block = createBlock(NO_FIELD_BLOCK)

    reportValue(block.id, '3')
    reportValue(block.id, '4')

    expect(Blockly.DropDownDiv.isVisible()).toBe(true)
    expect(reportedValues()).toEqual(['4'])
  })
})
