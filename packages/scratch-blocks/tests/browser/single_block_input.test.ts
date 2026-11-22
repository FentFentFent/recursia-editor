/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Tests for the single-block input. It holds one block, which may be a stack
// block or a reporter. A stack block keeps its next connection so it renders
// normally, but nothing may connect through that connection. A reporter is
// measured and serialized as a value input.
import * as Blockly from 'blockly/core'
import { afterAll, afterEach, assert, beforeAll, describe, expect, it } from 'vitest'
import '../../src/blocks/vertical_extensions'
import { SingleBlockInput } from '../../src/inputs/single_block_input'
import '../../src/renderer/renderer'
import '../../src/scratch_connection_checker'
import { ScratchMsgs } from '../../src/scratch_msgs'

const BLOCK_TYPES = [
  'test_single_block',
  'test_single_block_child',
  'test_single_block_other',
  'test_single_block_reporter',
  'test_single_block_unchecked_reporter',
]

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
      type: 'test_single_block',
      message0: 'single %1',
      args0: [{ type: 'input_block_single', name: 'BODY' }],
      previousStatement: null,
      nextStatement: null,
    },
    {
      type: 'test_single_block_child',
      message0: 'child',
      previousStatement: null,
      nextStatement: null,
    },
    {
      type: 'test_single_block_other',
      message0: 'other',
      previousStatement: null,
      nextStatement: null,
    },
    {
      type: 'test_single_block_reporter',
      message0: 'reporter',
      output: 'Number',
    },
    {
      type: 'test_single_block_unchecked_reporter',
      message0: 'unchecked reporter',
      output: 'String',
    },
  ])
})

afterAll(() => {
  for (const type of BLOCK_TYPES) {
    delete Blockly.Blocks[type]
  }
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
 * The connection of a test block's BODY input.
 * @param block The block to read the input from.
 * @returns The input's connection.
 */
function bodyConnection(block: Blockly.BlockSvg): Blockly.Connection {
  const input = block.getInput('BODY')
  assert(input, 'block should have a BODY input')
  assert(input.connection, 'BODY input should have a connection')
  return input.connection
}

describe('single-block input', () => {
  it('is a statement input while it is empty', () => {
    const block = makeBlock('test_single_block')
    const input = block.getInput('BODY')

    assert(input, 'block should have a BODY input')
    expect(input).toBeInstanceOf(SingleBlockInput)
    expect(input.type).toBe(Blockly.inputs.inputTypes.STATEMENT)
    expect(input.connection?.type).toBe(Blockly.ConnectionType.NEXT_STATEMENT)
  })

  it('accepts a single stack block', () => {
    const block = makeBlock('test_single_block')
    const child = makeBlock('test_single_block_child')
    assert(child.previousConnection, 'child should have a previousConnection')

    expect(bodyConnection(block).connect(child.previousConnection)).toBe(true)
    expect(bodyConnection(block).targetBlock()).toBe(child)
  })

  it('refuses to add a second block below the block inside it', () => {
    const block = makeBlock('test_single_block')
    const child = makeBlock('test_single_block_child')
    const other = makeBlock('test_single_block_other')
    assert(child.previousConnection, 'child should have a previousConnection')
    assert(child.nextConnection, 'child should have a nextConnection')
    assert(other.previousConnection, 'other should have a previousConnection')

    bodyConnection(block).connect(child.previousConnection)

    expect(child.nextConnection.connect(other.previousConnection)).toBe(false)
    expect(child.nextConnection.targetBlock()).toBeNull()
  })

  it('accepts a reporter', () => {
    const block = makeBlock('test_single_block')
    const reporter = makeBlock('test_single_block_reporter')
    assert(reporter.outputConnection, 'reporter should have an outputConnection')

    expect(bodyConnection(block).connect(reporter.outputConnection)).toBe(true)
    expect(bodyConnection(block).targetBlock()).toBe(reporter)
  })

  it('is found by a dragged reporter', () => {
    const block = makeBlock('test_single_block')
    const reporter = makeBlock('test_single_block_reporter')
    assert(reporter.outputConnection, 'reporter should have an outputConnection')

    // Blockly searches for drop targets from the position the dragged
    // connection would land at, so put the reporter's connection on the slot.
    const body = bodyConnection(block)
    reporter.moveBy(body.x - reporter.outputConnection.x, body.y - reporter.outputConnection.y)

    const { connection } = reporter.outputConnection.closest(100, new Blockly.utils.Coordinate(0, 0))
    expect(connection).toBe(body)
  })

  it('is a value input while it holds a reporter', () => {
    const block = makeBlock('test_single_block')
    const reporter = makeBlock('test_single_block_reporter')
    assert(reporter.outputConnection, 'reporter should have an outputConnection')

    const body = bodyConnection(block)
    body.connect(reporter.outputConnection)

    const input = block.getInput('BODY')
    assert(input instanceof SingleBlockInput, 'BODY should be a single-block input')
    expect(input.holdsReporter()).toBe(true)
    expect(input.type).toBe(Blockly.inputs.inputTypes.VALUE)
  })

  it('lays a reporter out inside the block', () => {
    const block = makeBlock('test_single_block')
    const reporter = makeBlock('test_single_block_reporter')
    assert(reporter.outputConnection, 'reporter should have an outputConnection')

    bodyConnection(block).connect(reporter.outputConnection)
    block.render()

    const blockBounds = block.getBoundingRectangle()
    const reporterBounds = reporter.getBoundingRectangle()
    // The reporter sits in the slot between the block's top and bottom edges
    // rather than hanging above it as a stack's previous connection would put
    // it.
    expect(reporterBounds.top).toBeGreaterThanOrEqual(blockBounds.top - 1)
    expect(reporterBounds.bottom).toBeLessThanOrEqual(blockBounds.bottom + 1)
  })

  it('places a reporter with no output check in the slot', () => {
    const block = makeBlock('test_single_block')
    const reporter = makeBlock('test_single_block_unchecked_reporter')
    // A block laid out from a mutation sets its output from its shape alone,
    // without a check, which is how extension blocks with a mutator do it.
    reporter.setOutput(true)
    reporter.render()
    assert(reporter.outputConnection, 'reporter should have an outputConnection')

    const body = bodyConnection(block)
    body.connect(reporter.outputConnection)
    block.render()

    const blockBounds = block.getBoundingRectangle()
    const reporterBounds = reporter.getBoundingRectangle()
    // The reporter sits in the slot. A slot measured from the input's statement
    // connection puts the reporter past the block's right edge and above its
    // top edge.
    expect(reporterBounds.left).toBeGreaterThanOrEqual(blockBounds.left)
    expect(reporterBounds.right).toBeLessThanOrEqual(blockBounds.right)
    expect(reporterBounds.top).toBeGreaterThanOrEqual(blockBounds.top)
    expect(reporterBounds.bottom).toBeLessThanOrEqual(blockBounds.bottom)
    expect(reporter.outputConnection.x).toBeCloseTo(body.x, 5)
    expect(reporter.outputConnection.y).toBeCloseTo(body.y, 5)
  })

  it('moves more than once', () => {
    const block = makeBlock('test_single_block')
    const body = bodyConnection(block)

    // Blocks are laid out again every time a flyout shows, so connections are
    // moved repeatedly.
    body.moveTo(10, 10)
    body.moveTo(20, 20)
    body.moveTo(30, 30)

    expect(body.getOffsetInBlock()).toBeTruthy()
  })

  it('serializes a reporter as a value input', () => {
    const block = makeBlock('test_single_block')
    const reporter = makeBlock('test_single_block_reporter')
    assert(reporter.outputConnection, 'reporter should have an outputConnection')

    bodyConnection(block).connect(reporter.outputConnection)

    const dom = Blockly.Xml.blockToDom(block)
    const container = dom.querySelector('value[name="BODY"]')
    assert(container, 'the reporter should be serialized as a value input')
    expect(container.querySelector('block')?.getAttribute('type')).toBe('test_single_block_reporter')
    expect(dom.querySelector('statement[name="BODY"]')).toBeNull()
  })

  it('serializes a stack block as a statement input', () => {
    const block = makeBlock('test_single_block')
    const child = makeBlock('test_single_block_child')
    assert(child.previousConnection, 'child should have a previousConnection')

    bodyConnection(block).connect(child.previousConnection)

    const dom = Blockly.Xml.blockToDom(block)
    const container = dom.querySelector('statement[name="BODY"]')
    assert(container, 'the stack block should be serialized as a statement input')
    expect(container.querySelector('block')?.getAttribute('type')).toBe('test_single_block_child')
    expect(dom.querySelector('value[name="BODY"]')).toBeNull()
  })

  it('loads a reporter back from its XML', () => {
    const block = makeBlock('test_single_block')
    const reporter = makeBlock('test_single_block_reporter')
    assert(reporter.outputConnection, 'reporter should have an outputConnection')

    bodyConnection(block).connect(reporter.outputConnection)
    const xml = Blockly.utils.xml.createElement('xml')
    xml.appendChild(Blockly.Xml.blockToDom(block))
    workspace.clear()
    Blockly.Xml.domToWorkspace(xml, workspace)

    const loaded = workspace.getTopBlocks(false)[0]
    assert(loaded, 'the block should load back')
    expect(loaded.getInputTargetBlock('BODY')?.type).toBe('test_single_block_reporter')
  })

  it('is a statement input again once the reporter is removed', () => {
    const block = makeBlock('test_single_block')
    const reporter = makeBlock('test_single_block_reporter')
    assert(reporter.outputConnection, 'reporter should have an outputConnection')

    bodyConnection(block).connect(reporter.outputConnection)
    reporter.unplug()

    const input = block.getInput('BODY')
    assert(input instanceof SingleBlockInput, 'BODY should be a single-block input')
    expect(input.holdsReporter()).toBe(false)
    expect(input.type).toBe(Blockly.inputs.inputTypes.STATEMENT)
  })
})
