/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// A flyout is laid out from scratch every time the toolbox updates, which moves
// the connections of the blocks it holds. A single-block input keeps its
// connection in two connection databases, so it has to follow the layout
// without leaving either database stale.
import * as Blockly from 'blockly/core'
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest'
import { inject } from '../../src/index'
import { ScratchMsgs } from '../../src/scratch_msgs'

const TOOLBOX_XML = `
<xml>
  <category name="Test" toolboxitemid="testextension" colour="#9966ff" secondaryColour="#774dcb">
    <block type="test_flyout_single_block"></block>
  </category>
</xml>
`

let container: HTMLElement
let workspace: Blockly.WorkspaceSvg

beforeAll(() => {
  ScratchMsgs.setLocale('en')
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'test_flyout_single_block',
      message0: 'single %1',
      args0: [{ type: 'input_block_single', name: 'BODY' }],
      previousStatement: null,
      nextStatement: null,
      style: 'looks_blocks',
    },
  ])

  container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)

  const theme = new Blockly.Theme('default', {
    looks_blocks: {
      colourPrimary: '#9966ff',
      colourSecondary: '#855cd6',
      colourTertiary: '#774dcb',
      colourQuaternary: '#774dcb',
    },
  })
  workspace = inject(container, { theme, sounds: false, toolbox: TOOLBOX_XML })
})

afterAll(() => {
  workspace.dispose()
  container.remove()
  delete Blockly.Blocks.test_flyout_single_block
})

/**
 * The blocks currently shown in the toolbox flyout.
 * @returns The rendered flyout blocks.
 */
function flyoutBlocks(): Blockly.BlockSvg[] {
  const flyout = workspace.getFlyout()
  assert(flyout, 'workspace should have a flyout')
  return flyout
    .getContents()
    .filter((item) => item.getType() === 'block')
    .map((item) => item.getElement())
}

describe('single-block input in a toolbox flyout', () => {
  it('lays out again when the flyout is shown again', () => {
    const flyout = workspace.getFlyout()
    assert(flyout, 'workspace should have a flyout')
    const definition = [{ kind: 'block', type: 'test_flyout_single_block' }]

    // Showing the flyout again recycles its blocks, which moves them back to
    // the origin, and then lays out the new blocks.
    flyout.show(definition)
    flyout.show(definition)

    const blocks = flyoutBlocks()
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].getInput('BODY')).not.toBeNull()
  })
})
