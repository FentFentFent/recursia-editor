/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '../../src/blocks/vertical_extensions'
import { getBlockCorners } from '../../src/style/block_corners'
import { getBlockPadding } from '../../src/style/block_padding'
import { EXTRA_PADDED } from '../../src/style/style_extrapadded'
import {
  BIG_ROUNDED_CORNERS,
  EXTREME_ROUNDED_CORNERS,
  MEDIUM_ROUNDED_CORNERS,
  NO_ROUNDED_CORNERS,
  SMALL_ROUNDED_CORNERS,
} from '../../src/style/style_roundedcorners'

let workspace: Blockly.Workspace

beforeEach(() => {
  workspace = new Blockly.Workspace()
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'test_no_rounded_corners',
      message0: 'square',
      extensions: ['style_noroundedcorners'],
      style: 'motion_blocks',
    },
    {
      type: 'test_small_rounded_corners',
      message0: 'small corners',
      extensions: ['style_smallroundedcorners'],
      style: 'motion_blocks',
    },
    {
      type: 'test_medium_rounded_corners',
      message0: 'medium corners',
      extensions: ['style_mediumroundedcorners'],
      style: 'motion_blocks',
    },
    {
      type: 'test_big_rounded_corners',
      message0: 'big corners',
      extensions: ['style_bigroundedcorners'],
      style: 'motion_blocks',
    },
    {
      type: 'test_extreme_rounded_corners',
      message0: 'extreme corners',
      extensions: ['style_extremeroundedcorners'],
      style: 'motion_blocks',
    },
    {
      type: 'test_big_corners_extra_padded',
      message0: 'corner and padding styles',
      extensions: ['style_bigroundedcorners', 'style_extrapadded'],
      style: 'motion_blocks',
    },
    {
      type: 'test_default_corners',
      message0: 'default corners',
      style: 'motion_blocks',
    },
  ])
})

afterEach(() => {
  workspace.dispose()
  for (const type of [
    'test_no_rounded_corners',
    'test_small_rounded_corners',
    'test_medium_rounded_corners',
    'test_big_rounded_corners',
    'test_extreme_rounded_corners',
    'test_big_corners_extra_padded',
    'test_default_corners',
  ]) {
    delete Blockly.Blocks[type]
  }
})

function cornersOf(type: string) {
  return getBlockCorners(workspace.newBlock(type))
}

describe('rounded corners style extensions', () => {
  it('registers an extension for every corners style', () => {
    expect(Blockly.Extensions.isRegistered('style_noroundedcorners')).toBe(true)
    expect(Blockly.Extensions.isRegistered('style_smallroundedcorners')).toBe(true)
    expect(Blockly.Extensions.isRegistered('style_mediumroundedcorners')).toBe(true)
    expect(Blockly.Extensions.isRegistered('style_bigroundedcorners')).toBe(true)
    expect(Blockly.Extensions.isRegistered('style_extremeroundedcorners')).toBe(true)
  })

  it('applies the radius of the requested style', () => {
    expect(cornersOf('test_no_rounded_corners')).toBe(NO_ROUNDED_CORNERS)
    expect(cornersOf('test_small_rounded_corners')).toBe(SMALL_ROUNDED_CORNERS)
    expect(cornersOf('test_medium_rounded_corners')).toBe(MEDIUM_ROUNDED_CORNERS)
    expect(cornersOf('test_big_rounded_corners')).toBe(BIG_ROUNDED_CORNERS)
    expect(cornersOf('test_extreme_rounded_corners')).toBe(EXTREME_ROUNDED_CORNERS)
  })

  it('keeps the radius of each style distinct and ordered', () => {
    expect(NO_ROUNDED_CORNERS.radius).toBe(0)
    expect(SMALL_ROUNDED_CORNERS.radius).toBeLessThan(MEDIUM_ROUNDED_CORNERS.radius)
    expect(MEDIUM_ROUNDED_CORNERS.radius).toBeLessThan(BIG_ROUNDED_CORNERS.radius)
    expect(BIG_ROUNDED_CORNERS.radius).toBeLessThan(EXTREME_ROUNDED_CORNERS.radius)
  })

  it('leaves blocks without a corners style on the renderer default', () => {
    expect(cornersOf('test_default_corners')).toBeNull()
  })

  it('combines a corners style with a padding style', () => {
    const block = workspace.newBlock('test_big_corners_extra_padded')

    expect(getBlockCorners(block)).toBe(BIG_ROUNDED_CORNERS)
    expect(getBlockPadding(block)).toBe(EXTRA_PADDED)
  })
})
