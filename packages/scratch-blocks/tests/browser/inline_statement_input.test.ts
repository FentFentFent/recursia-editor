/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// The inline statement input is a real statement input, laid out on the same
// row as the fields before it. Blocks using it have to serialize as statement
// blocks, place the connection where the input is drawn, and hold the connected
// stack on their own row.
import * as Blockly from 'blockly/core'
import { afterAll, afterEach, assert, beforeAll, expect, it } from 'vitest'
import '../../src/index'
import InlineStatementMeasurable from '../../src/renderer/inline_statement_measurable'

const BLOCK_TYPE = 'test_inline_statement_block'
const CHILD_TYPE = 'test_inline_statement_child'

let container: HTMLElement
let workspace: Blockly.WorkspaceSvg

beforeAll(() => {
  container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  workspace = Blockly.inject(container, { renderer: 'scratch_classic' })

  Blockly.defineBlocksWithJsonArray([
    {
      type: BLOCK_TYPE,
      message0: 'inline statement',
      message1: '%1',
      args1: [{ type: 'inline_statement', name: 'BODY' }],
      previousStatement: null,
      nextStatement: null,
    },
    {
      type: CHILD_TYPE,
      message0: 'child',
      previousStatement: null,
      nextStatement: null,
    },
  ])
})

afterAll(() => {
  delete Blockly.Blocks[BLOCK_TYPE]
  delete Blockly.Blocks[CHILD_TYPE]
  workspace.dispose()
  container.remove()
})

afterEach(() => {
  workspace.clear()
})

/**
 * Create and render a block in the test workspace.
 * @param type The block type to create.
 * @returns The rendered block.
 */
function makeBlock(type: string): Blockly.BlockSvg {
  const block = workspace.newBlock(type)
  block.initSvg()
  block.render()
  return block
}

/**
 * The connection of the inline statement input.
 * @param block The block to read the connection from.
 * @returns The rendered connection of the block's BODY input.
 */
function bodyConnection(block: Blockly.BlockSvg): Blockly.RenderedConnection {
  const connection = block.getInput('BODY')?.connection
  assert(connection instanceof Blockly.RenderedConnection, 'BODY should be a statement connection')
  return connection
}

it('serializes its input as a statement', () => {
  const block = makeBlock(BLOCK_TYPE)
  const input = block.getInput('BODY')
  expect(input?.type).toBe(Blockly.inputs.inputTypes.STATEMENT)

  const child = makeBlock(CHILD_TYPE)
  bodyConnection(block).connect(child.previousConnection)

  const xml = Blockly.Xml.blockToDom(block) as Element
  expect(xml.querySelector('statement[name="BODY"]')).not.toBeNull()
})

it('places its connection within the block, where the input is drawn', () => {
  const block = makeBlock(BLOCK_TYPE)
  const offset = bodyConnection(block).getOffsetInBlock()
  const size = block.getHeightWidth()

  expect(offset.x).toBeGreaterThan(0)
  expect(offset.x).toBeLessThan(size.width)
  expect(offset.y).toBeGreaterThanOrEqual(0)
  expect(offset.y).toBeLessThan(size.height)
})

it('draws the empty input as a slot', () => {
  const block = makeBlock(BLOCK_TYPE)
  const slot = block.getSvgRoot().querySelector('.blocklyOutlinePath')

  expect(slot?.getAttribute('d')).toMatch(/^ M .+ z$/)

  const child = makeBlock(CHILD_TYPE)
  bodyConnection(block).connect(child.previousConnection)
  child.render()
  block.render()

  // A connected stack covers the slot, so it is no longer drawn.
  expect(block.getSvgRoot().querySelector('.blocklyOutlinePath')).toBeNull()
})

it('insets the slot and any connected stack by the input padding', () => {
  const block = makeBlock(BLOCK_TYPE)
  const renderer = block.workspace.getRenderer() as unknown as {
    makeRenderInfo_: (block: Blockly.BlockSvg) => Blockly.blockRendering.RenderInfo
  }
  const info = renderer.makeRenderInfo_(block)
  info.measure()

  const row = info.rows.find((row) => row.hasInlineInput)
  assert(row)
  const slot = row.elements.find((element) => element instanceof InlineStatementMeasurable)
  assert(slot instanceof InlineStatementMeasurable)

  // The placeholder and a stack dropped on it both sit inside the padding,
  // instead of being flush with the top of the input's space.
  expect(slot.connectionOffsetY).toBe(slot.paddingY)
  expect(slot.height).toBe(slot.paddingY * 2 + slot.placeholderHeight)

  const outline = block.getSvgRoot().querySelector('.blocklyOutlinePath')
  const startY = Number(/M\s*[\d.]+,\s*([\d.-]+)/.exec(outline?.getAttribute('d') ?? '')?.[1])
  expect(startY).toBeCloseTo(row.yPos + slot.paddingY, 1)
})

it('holds the connected stack on its own row', () => {
  const block = makeBlock(BLOCK_TYPE)
  const child = makeBlock(CHILD_TYPE)
  bodyConnection(block).connect(child.previousConnection)

  const grandchild = makeBlock(CHILD_TYPE)
  assert(child.nextConnection)
  child.nextConnection.connect(grandchild.previousConnection)
  grandchild.render()
  child.render()
  block.render()

  const blockXY = block.getRelativeToSurfaceXY()
  const childXY = child.getRelativeToSurfaceXY()
  const connection = bodyConnection(block).getOffsetInBlock()
  assert(child.previousConnection)
  const childConnection = child.previousConnection.getOffsetInBlock()

  expect(childXY.y - blockXY.y + childConnection.y).toBeCloseTo(connection.y, 0)
  expect(childXY.x - blockXY.x + childConnection.x).toBeCloseTo(connection.x, 0)

  // The block's body wraps the whole stack, not just the first block of it.
  const size = block.getHeightWidth()
  const stackSize = child.getHeightWidth()
  expect(size.height).toBeGreaterThanOrEqual(connection.y + stackSize.height)
  expect(size.height).toBeGreaterThanOrEqual(childXY.y - blockXY.y + stackSize.height)
  expect(size.width).toBeGreaterThanOrEqual(childXY.x - blockXY.x + stackSize.width)
})
