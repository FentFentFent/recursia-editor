/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Tests for the single-statement input. It renders like a statement input and
// accepts exactly one block. The block inside keeps its next connection so it
// renders normally, but nothing may connect through that connection.
import * as Blockly from 'blockly/core'
import { afterAll, afterEach, assert, beforeAll, describe, expect, it } from 'vitest'
import '../../src/blocks/vertical_extensions'
import { SingleStatementInput } from '../../src/inputs/single_statement_input'
import '../../src/renderer/renderer'
import '../../src/scratch_connection_checker'
import { ScratchMsgs } from '../../src/scratch_msgs'

const BLOCK_TYPES = ['test_single_statement', 'test_single_child', 'test_single_other']

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
      type: 'test_single_statement',
      message0: 'single %1',
      args0: [{ type: 'input_statement_single', name: 'BODY' }],
      previousStatement: null,
      nextStatement: null,
    },
    {
      type: 'test_single_child',
      message0: 'child',
      previousStatement: null,
      nextStatement: null,
    },
    {
      type: 'test_single_other',
      message0: 'other',
      previousStatement: null,
      nextStatement: null,
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

describe('single-statement input', () => {
  it('is a statement input', () => {
    const block = makeBlock('test_single_statement')
    const input = block.getInput('BODY')

    assert(input, 'block should have a BODY input')
    expect(input).toBeInstanceOf(SingleStatementInput)
    expect(input.connection?.type).toBe(Blockly.ConnectionType.NEXT_STATEMENT)
  })

  it('accepts a single block', () => {
    const block = makeBlock('test_single_statement')
    const child = makeBlock('test_single_child')
    assert(child.previousConnection, 'child should have a previousConnection')

    const body = bodyConnection(block)
    expect(body.connect(child.previousConnection)).toBe(true)
    expect(body.targetBlock()).toBe(child)
  })

  it('refuses to add a second block below the block inside it', () => {
    const block = makeBlock('test_single_statement')
    const child = makeBlock('test_single_child')
    const other = makeBlock('test_single_other')
    assert(child.previousConnection, 'child should have a previousConnection')
    assert(child.nextConnection, 'child should have a nextConnection')
    assert(other.previousConnection, 'other should have a previousConnection')

    bodyConnection(block).connect(child.previousConnection)

    expect(child.nextConnection.connect(other.previousConnection)).toBe(false)
    expect(child.nextConnection.targetBlock()).toBeNull()
  })

  it('renders the block inside it with its next connection', () => {
    const block = makeBlock('test_single_statement')
    const child = makeBlock('test_single_child')
    assert(child.previousConnection, 'child should have a previousConnection')

    bodyConnection(block).connect(child.previousConnection)
    child.render()

    // The next connection is still present and the block draws the same
    // outline, including the notch below it, as it does on its own.
    expect(child.nextConnection).not.toBeNull()
    expect(child.pathObject.svgPath.getAttribute('d')).toBe(
      makeBlock('test_single_child').pathObject.svgPath.getAttribute('d'),
    )
  })

  it('refuses a multi-block stack', () => {
    const block = makeBlock('test_single_statement')
    const top = makeBlock('test_single_child')
    const bottom = makeBlock('test_single_other')
    assert(top.previousConnection, 'top should have a previousConnection')
    assert(top.nextConnection, 'top should have a nextConnection')
    assert(bottom.previousConnection, 'bottom should have a previousConnection')

    top.nextConnection.connect(bottom.previousConnection)

    const body = bodyConnection(block)
    expect(body.connect(top.previousConnection)).toBe(false)
    expect(body.targetBlock()).toBeNull()
  })

  it('refuses to insert a block above the block inside it', () => {
    const block = makeBlock('test_single_statement')
    const child = makeBlock('test_single_child')
    const other = makeBlock('test_single_other')
    assert(child.previousConnection, 'child should have a previousConnection')
    assert(other.previousConnection, 'other should have a previousConnection')

    const body = bodyConnection(block)
    body.connect(child.previousConnection)

    // connect() reports whether the connection ends up connected, which stays
    // true for the block already there, so check that the input did not change.
    body.connect(other.previousConnection)
    expect(body.targetBlock()).toBe(child)
    expect(other.previousConnection.isConnected()).toBe(false)
  })

  it('accepts a new block after the block inside is removed', () => {
    const block = makeBlock('test_single_statement')
    const child = makeBlock('test_single_child')
    const other = makeBlock('test_single_other')
    assert(child.previousConnection, 'child should have a previousConnection')
    assert(other.previousConnection, 'other should have a previousConnection')

    const body = bodyConnection(block)
    body.connect(child.previousConnection)
    child.unplug()

    expect(body.connect(other.previousConnection)).toBe(true)
    expect(body.targetBlock()).toBe(other)
  })
})
