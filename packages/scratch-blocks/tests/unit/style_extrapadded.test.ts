/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '../../src/blocks/vertical_extensions'
import { BlockPadding, getBlockPadding } from '../../src/style/block_padding'
import { EXTRA_PADDED } from '../../src/style/style_extrapadded'

let workspace: Blockly.Workspace

beforeEach(() => {
  workspace = new Blockly.Workspace()
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'test_extra_padded_block',
      message0: 'extra padded',
      extensions: ['style_extrapadded'],
      style: 'motion_blocks',
    },
    {
      type: 'test_unpadded_block',
      message0: 'unpadded',
      style: 'motion_blocks',
    },
  ])
})

afterEach(() => {
  workspace.dispose()
  delete Blockly.Blocks.test_extra_padded_block
  delete Blockly.Blocks.test_unpadded_block
})

describe('style_extrapadded extension', () => {
  it('is registered by the vertical extensions module', () => {
    expect(Blockly.Extensions.isRegistered('style_extrapadded')).toBe(true)
  })

  it('applies extra padding to the block that requests it', () => {
    const block = workspace.newBlock('test_extra_padded_block')

    expect(getBlockPadding(block)).toBe(EXTRA_PADDED)
    expect(getBlockPadding(block).vertical).toBeGreaterThan(0)
    expect(getBlockPadding(block).horizontal).toBeGreaterThan(0)
  })

  it('leaves blocks without the extension unpadded', () => {
    const block = workspace.newBlock('test_unpadded_block')

    expect(getBlockPadding(block)).toBe(BlockPadding.NONE)
    expect(getBlockPadding(block).vertical).toBe(0)
    expect(getBlockPadding(block).horizontal).toBe(0)
  })

  it('keeps padding on the padded block when other blocks are created', () => {
    const padded = workspace.newBlock('test_extra_padded_block')
    workspace.newBlock('test_unpadded_block')

    expect(getBlockPadding(padded)).toBe(EXTRA_PADDED)
  })
})
