/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Regression test for the reported "Missing statement row or input for bowler
// hat block" error. The exception was thrown while an extension category was
// shown in the flyout, because measuring a bowler hat block assumed the shape of
// a procedure definition (a statement input holding the prototype). A plain
// bowler hat block has no statement row and must render its own content.
import * as Blockly from 'blockly/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import '../../src/blocks/vertical_extensions'
import { inject } from '../../src/index'
import { ScratchMsgs } from '../../src/scratch_msgs'

let container: HTMLElement
let workspace: Blockly.WorkspaceSvg

const TOOLBOX_XML = `
<xml>
  <category name="Test Extension" toolboxitemid="testextension" colour="#9966ff" secondaryColour="#774dcb">
    <block type="test_bowler_hat_flyout"></block>
  </category>
</xml>
`

beforeAll(() => {
  ScratchMsgs.setLocale('en')
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'test_bowler_hat_flyout',
      message0: 'bowler hat',
      // The VM adds both extensions when a HAT block requests the bowler hat style.
      extensions: ['shape_hat', 'shape_bowler_hat'],
      style: 'looks_blocks',
    },
  ])

  container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)

  // The scratch renderer expects themes with complete block styles, the way the
  // GUI's color modes provide them.
  const theme = new Blockly.Theme('default', {
    looks_blocks: {
      colourPrimary: '#9966ff',
      colourSecondary: '#855cd6',
      colourTertiary: '#774dcb',
      colourQuaternary: '#774dcb',
    },
  })

  workspace = inject(container, { toolbox: TOOLBOX_XML, theme })
})

afterAll(() => {
  workspace.dispose()
  container.remove()
  delete Blockly.Blocks.test_bowler_hat_flyout
})

describe('bowler hat block in the flyout', () => {
  it('renders a bowler hat block with no statement row without throwing', () => {
    const flyoutBlocks = workspace
      .getFlyout()
      ?.getContents()
      .filter((item) => item.getType() === 'block')
      .map((item) => item.getElement() as Blockly.BlockSvg)
    const block = flyoutBlocks?.find((candidate) => candidate.type === 'test_bowler_hat_flyout')

    expect(block).toBeDefined()
    expect(block.width).toBeGreaterThan(0)
    // The hat band plus the text row: the text is displayed on the block, not
    // swallowed by the hat.
    expect(block.height).toBeGreaterThan(20)
    expect(block.pathObject.svgPath.getAttribute('d') ?? '').toContain('a20,20')
  })
})
