/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Rendering tests for per-block corner styles. A block with a corners style
// draws its outline with that radius; a block without one keeps the renderer's
// default (medium) radius.
import * as Blockly from 'blockly/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import '../../src/blocks/vertical_extensions'
// Registering the scratch renderer is what applies the corner styles.
import '../../src/renderer/renderer'
import { ScratchMsgs } from '../../src/scratch_msgs'

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
      type: 'test_corners_default',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_none',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      extensions: ['style_noroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_medium',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      extensions: ['style_mediumroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_big',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      extensions: ['style_bigroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_extreme',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      extensions: ['style_extremeroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_stack_none',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      extensions: ['style_noroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_stack_small',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      extensions: ['style_smallroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_stack_medium',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      extensions: ['style_mediumroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_stack_big',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      extensions: ['style_bigroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_stack_extreme',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      extensions: ['style_extremeroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_reporter',
      message0: 'value',
      output: 'String',
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_big_reporter',
      message0: 'value',
      output: 'String',
      extensions: ['style_bigroundedcorners'],
      style: 'looks_blocks',
    },
    {
      type: 'test_corners_big_extra_padded',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'hello' },
        { type: 'field_number', name: 'SECONDS', value: 1 },
      ],
      extensions: ['style_bigroundedcorners', 'style_extrapadded'],
      style: 'looks_blocks',
    },
  ])
})

afterAll(() => {
  workspace.dispose()
  container.remove()
  for (const type of [
    'test_corners_default',
    'test_corners_none',
    'test_corners_medium',
    'test_corners_big',
    'test_corners_extreme',
    'test_corners_stack_none',
    'test_corners_stack_small',
    'test_corners_stack_medium',
    'test_corners_stack_big',
    'test_corners_stack_extreme',
    'test_corners_reporter',
    'test_corners_big_reporter',
    'test_corners_big_extra_padded',
  ]) {
    delete Blockly.Blocks[type]
  }
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

/**
 * The outline portion of a block's path. Blockly appends the inline inputs'
 * paths after the outline, and those already draw rounded connection shapes.
 * @param block The block to read the outline of.
 * @returns The block's outline path.
 */
function outlinePath(block: Blockly.BlockSvg): string {
  return (block.pathObject.svgPath.getAttribute('d') ?? '').split('\n')[0]
}

/**
 * Distance from a block's left edge to where its top outline starts drawing the
 * previous connection notch.
 * @param block The block to measure.
 * @returns The notch's horizontal offset, in workspace units.
 */
function topEdgeNotchOffset(block: Blockly.BlockSvg): number {
  const path = outlinePath(block).trim()
  // The top edge starts at the top-left corner: either a rounded corner arc or
  // the straight edge of a square corner, followed by the gap before the notch.
  const rounded = /^m 0,0\s+m 0,(\d+(?:\.\d+)?)\s+a \1 \1 0 0,1 \1,-\1\s+h (-?\d+(?:\.\d+)?)/.exec(path)
  if (rounded) return Number(rounded[1]) + Number(rounded[2])

  const square = /^m 0,0\s+h (-?\d+(?:\.\d+)?)/.exec(path)
  if (!square) throw new Error(`Unexpected outline start: ${path.slice(0, 80)}`)
  return Number(square[1])
}

describe('rounded corner rendering — scratch renderer', () => {
  it('draws the default medium corners on blocks without a corners style', () => {
    expect(outlinePath(renderBlock('test_corners_default'))).toMatch(/a 4 4/)
  })

  it('draws square corners when the no-rounded-corners style is applied', () => {
    const noCorners = renderBlock('test_corners_none')

    expect(outlinePath(noCorners)).not.toMatch(/a 4 4/)
    // Corners do not add space to the block, so the layout is unchanged.
    expect(noCorners.height).toBe(renderBlock('test_corners_default').height)
  })

  it('treats an explicit medium style the same as the default', () => {
    const medium = renderBlock('test_corners_medium')

    expect(outlinePath(medium)).toMatch(/a 4 4/)
    expect(medium.height).toBe(renderBlock('test_corners_default').height)
  })

  it('grows the block as the corner radius grows', () => {
    const defaultHeight = renderBlock('test_corners_default').height
    const big = renderBlock('test_corners_big')
    const extreme = renderBlock('test_corners_extreme')

    expect(outlinePath(big)).toMatch(/a 8 8/)
    expect(outlinePath(extreme)).toMatch(/a 16 16/)
    expect(big.height).toBeGreaterThan(defaultHeight)
    expect(extreme.height).toBeGreaterThan(big.height)
  })

  it('draws the previous notch at the same offset for every corner style', () => {
    for (const type of [
      'test_corners_stack_none',
      'test_corners_stack_small',
      'test_corners_stack_medium',
      'test_corners_stack_big',
      'test_corners_stack_extreme',
    ]) {
      // The notch sits three grid units from the block's edge in every style.
      expect(topEdgeNotchOffset(renderBlock(type)), type).toBeCloseTo(12)
    }
  })

  it('caps a stack block corner at the notch offset', () => {
    // Extreme corners are 16 wide, but a stack block only has room for 12
    // before its notch.
    expect(outlinePath(renderBlock('test_corners_stack_extreme'))).toMatch(/a 12 12/)
  })

  it('leaves flat-edged reporter blocks unchanged', () => {
    const reporter = renderBlock('test_corners_reporter')
    const bigReporter = renderBlock('test_corners_big_reporter')

    expect(bigReporter.height).toBe(reporter.height)
    expect(outlinePath(bigReporter)).not.toMatch(/a 8 8/)
  })

  it('draws big corners on a block that also has a padding style', () => {
    const padded = renderBlock('test_corners_big_extra_padded')

    expect(outlinePath(padded)).toMatch(/a 8 8/)
    expect(padded.height).toBeGreaterThan(renderBlock('test_corners_big').height)
  })
})
