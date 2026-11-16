/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Rendering tests for the scratch renderer's support for per-block padding
// styles. A block using the style_extrapadded extension must be laid out with
// extra space around its content while identical blocks without it are
// unaffected.
import * as Blockly from 'blockly/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import '../../src/blocks/vertical_extensions'
// Registering the scratch renderer is what makes RenderInfo apply padding.
import '../../src/renderer/renderer'
import { ScratchMsgs } from '../../src/scratch_msgs'
import { getBlockPadding } from '../../src/style/block_padding'
import { EXTRA_PADDED } from '../../src/style/style_extrapadded'

let container: HTMLElement
let workspace: Blockly.WorkspaceSvg

beforeAll(() => {
  ScratchMsgs.setLocale('en')
  container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  // Inject once: ConstantProvider.setTheme mutates the shared Blockly default
  // theme, so re-injecting in each test causes "Invalid colour" failures.
  workspace = Blockly.inject(container, { renderer: 'scratch_classic' })

  Blockly.defineBlocksWithJsonArray([
    {
      type: 'test_padded_command',
      message0: 'say %1 for %2 seconds',
      previousStatement: null,
      nextStatement: null,
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      extensions: ['style_extrapadded'],
      style: 'looks_blocks',
    },
    {
      type: 'test_minimally_padded_command',
      message0: 'say %1 for %2 seconds',
      previousStatement: null,
      nextStatement: null,
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      extensions: ['style_minimalpadding'],
      style: 'looks_blocks',
    },
    {
      type: 'test_plain_command',
      message0: 'say %1 for %2 seconds',
      previousStatement: null,
      nextStatement: null,
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      style: 'looks_blocks',
    },
  ])
})

afterAll(() => {
  workspace.dispose()
  container.remove()
  delete Blockly.Blocks.test_padded_command
  delete Blockly.Blocks.test_minimally_padded_command
  delete Blockly.Blocks.test_plain_command
})

afterEach(() => {
  workspace.clear()
})

function renderBlock(type: string): Blockly.BlockSvg {
  const block = workspace.newBlock(type)
  block.initSvg()
  block.render()
  return block
}

describe('extra padded block rendering — scratch renderer', () => {
  it('renders taller than the same block without the extension', () => {
    const plain = renderBlock('test_plain_command')
    const padded = renderBlock('test_padded_command')

    // Vertical padding is added above and below the block's one content row.
    expect(padded.height).toBe(plain.height + 2 * EXTRA_PADDED.vertical)
  })

  it('renders wider than the same block without the extension', () => {
    const plain = renderBlock('test_plain_command')
    const padded = renderBlock('test_padded_command')

    expect(padded.width).toBeGreaterThan(plain.width)
  })

  it('does not change the layout of blocks without the extension', () => {
    const plain = renderBlock('test_plain_command')

    expect(getBlockPadding(plain).vertical).toBe(0)
    // The unpadded block keeps Blockly's baseline single-row height, which the
    // surrounding renderer tests also rely on.
    expect(plain.height).toBeLessThan(renderBlock('test_padded_command').height)
  })

  it('keeps the previous and next notches at the same horizontal position for every padding style', () => {
    const notchXOffsets = (type: string) => {
      const block = renderBlock(type)
      return {
        previous: block.previousConnection.getOffsetInBlock().x,
        next: block.nextConnection.getOffsetInBlock().x,
      }
    }
    const plain = notchXOffsets('test_plain_command')

    // Padding styles change the space around the block's content, not where its
    // notches sit, so padded and unpadded blocks still line up when stacked.
    expect(notchXOffsets('test_padded_command')).toEqual(plain)
    expect(notchXOffsets('test_minimally_padded_command')).toEqual(plain)
  })

  it('keeps padding and block height when the style is reapplied', () => {
    const padded = renderBlock('test_padded_command')
    const height = padded.height

    // Loading an extension or switching color mode makes Blockly call setStyle()
    // on every block; padding must survive that.
    padded.setStyle('looks_blocks')
    padded.render()

    expect(getBlockPadding(padded)).toBe(EXTRA_PADDED)
    expect(padded.height).toBe(height)
  })
})
