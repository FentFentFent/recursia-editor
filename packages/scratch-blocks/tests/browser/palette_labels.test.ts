/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Verification that the flyout item XML the VM emits for LABEL and XML palette
// entries is actually displayed. Those entries are not blocks: a label becomes a
// flyout label, and an XML entry's markup is inflated into the flyout as-is.
import * as Blockly from 'blockly/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inject } from '../../src/index'
import { ScratchMsgs } from '../../src/scratch_msgs'

let container: HTMLElement
let workspace: Blockly.WorkspaceSvg

const TOOLBOX_XML = `
<xml>
  <category name="Test Extension" toolboxitemid="testextension" colour="#9966ff" secondaryColour="#774dcb">
    <label text="First group"></label>
    <block type="test_flyout_block"></block>
    <sep gap="36"></sep>
    <label text="Second group"></label>
  </category>
</xml>
`

beforeAll(() => {
  ScratchMsgs.setLocale('en')
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'test_flyout_block',
      message0: 'flyout block',
      style: 'looks_blocks',
    },
  ])
  container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  // The scratch renderer expects themes with complete block styles, the way the
  // GUI's color modes provide them. Blockly's built-in themes only define a
  // colourPrimary hue, which the renderer can't derive its styles from.
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
  delete Blockly.Blocks.test_flyout_block
})

function flyoutContents(): Blockly.FlyoutItem[] {
  return workspace.getFlyout().getContents()
}

describe('extension palette labels and XML entries', () => {
  it('displays labels from the category in the flyout', () => {
    const labels = flyoutContents().filter((item) => item.getType() === 'label')
    const labelTexts = labels.map((item) => (item.getElement() as Blockly.FlyoutButton).info.text)

    expect(labelTexts).toContain('First group')
    expect(labelTexts).toContain('Second group')
  })

  it('lays out labels inside the flyout', () => {
    const label = flyoutContents()
      .filter((item) => item.getType() === 'label')
      .map((item) => item.getElement() as Blockly.FlyoutButton)
      .find((element) => element.info.text === 'First group')

    expect(label).toBeDefined()
    const bounds = label.getBoundingRectangle()
    expect(bounds.getWidth()).toBeGreaterThan(0)
    expect(bounds.getHeight()).toBeGreaterThan(0)
  })

  it('inflates XML blocks into the flyout', () => {
    const blocks = flyoutContents().filter((item) => item.getType() === 'block')
    const blockTypes = blocks.map((item) => (item.getElement() as Blockly.BlockSvg).type)

    expect(blockTypes).toContain('test_flyout_block')
  })

  it('keeps the category contents in order', () => {
    const contents = flyoutContents()
    const indexOfLabel = (text: string) =>
      contents.findIndex(
        (item) => item.getType() === 'label' && (item.getElement() as Blockly.FlyoutButton).info.text === text,
      )
    const indexOfBlock = contents.findIndex((item) => item.getType() === 'block')

    expect(indexOfLabel('First group')).toBeLessThan(indexOfBlock)
    expect(indexOfBlock).toBeLessThan(indexOfLabel('Second group'))
  })
})
