/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// A flyout workspace is built from its own options, which do not carry the
// host's media path. The collapse button on a block in the flyout has to use
// the media path of the workspace the flyout serves, or it renders no image.
import * as Blockly from 'blockly/core'
import { afterAll, beforeAll, assert, describe, expect, it } from 'vitest'
import { inject } from '../../src/index'
import { CollapsibleStatementInput } from '../../src/inputs/statement_input'
import { ScratchMsgs } from '../../src/scratch_msgs'

const MEDIA_PATH = 'media/'

const TOOLBOX_XML = `
<xml>
  <category name="Test" toolboxitemid="testextension" colour="#9966ff" secondaryColour="#774dcb">
    <block type="test_flyout_statement"></block>
  </category>
</xml>
`

let container: HTMLElement
let workspace: Blockly.WorkspaceSvg

beforeAll(() => {
  ScratchMsgs.setLocale('en')
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'test_flyout_statement',
      message0: 'statement %1',
      args0: [{ type: 'input_statement', name: 'BODY' }],
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
  workspace = inject(container, { theme, media: MEDIA_PATH, sounds: false, toolbox: TOOLBOX_XML })
})

afterAll(() => {
  workspace.dispose()
  container.remove()
  delete Blockly.Blocks.test_flyout_statement
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

describe('collapse button in a toolbox flyout', () => {
  it('uses the media path of the workspace the flyout serves', () => {
    const [block] = flyoutBlocks()
    assert(block, 'flyout should contain the test block')
    const input = block.getInput('BODY')
    assert(input instanceof CollapsibleStatementInput, 'BODY should be a collapsible statement input')

    expect(input.toggleField.getValue()).toBe(`${MEDIA_PATH}collapse.svg`)
    expect(input.toggleField.isVisible()).toBe(true)
  })
})
