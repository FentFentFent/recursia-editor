/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Tests for collapsing a statement input. Folding the input away hides the
// blocks inside it and the fields on the input itself, so the button that
// unfolds it has to stay visible on the row above the input.
import * as Blockly from 'blockly/core'
import { afterAll, afterEach, assert, beforeAll, describe, expect, it } from 'vitest'
import { CollapsibleStatementInput } from '../../src/inputs/statement_input'
import '../../src/renderer/renderer'
import { ScratchMsgs } from '../../src/scratch_msgs'

const BLOCK_TYPES = ['test_collapsible_statement', 'test_collapsible_child']

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
      type: 'test_collapsible_statement',
      message0: 'statement %1',
      args0: [{ type: 'input_statement', name: 'BODY' }],
      previousStatement: null,
      nextStatement: null,
    },
    {
      type: 'test_collapsible_child',
      message0: 'child',
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
 * The collapsible statement input of a test block.
 * @param block The block to read the input from.
 * @returns The block's BODY input.
 */
function bodyInput(block: Blockly.BlockSvg): CollapsibleStatementInput {
  const input = block.getInput('BODY')
  assert(input instanceof CollapsibleStatementInput, 'BODY should be a collapsible statement input')
  return input
}

/**
 * Put a child block inside a collapsible statement input.
 * @param block The block with the statement input.
 * @returns The block inside the input.
 */
function addChild(block: Blockly.BlockSvg): Blockly.BlockSvg {
  const child = makeBlock('test_collapsible_child')
  assert(child.previousConnection, 'child should have a previousConnection')
  const body = bodyInput(block)
  assert(body.connection, 'BODY input should have a connection')
  body.connection.connect(child.previousConnection)
  child.render()
  block.render()
  return child
}

describe('collapsible statement input', () => {
  it('is created for statement inputs, with a button to collapse it', () => {
    const block = makeBlock('test_collapsible_statement')
    const input = bodyInput(block)

    expect(input.isCollapsed()).toBe(false)
    expect(input.toggleField.isVisible()).toBe(true)
    expect(input.toggleField.getValue()).toContain('collapse.svg')
  })

  it('keeps the button visible while collapsed', () => {
    const block = makeBlock('test_collapsible_statement')
    const child = addChild(block)
    const input = bodyInput(block)
    const expandedHeight = block.getHeightWidth().height

    input.toggleField.showEditor()

    expect(input.isCollapsed()).toBe(true)
    expect(input.isVisible()).toBe(false)
    expect(input.toggleField.isVisible()).toBe(true)
    expect(input.toggleField.getValue()).toContain('expand.svg')
    expect(child.getSvgRoot().style.display).toBe('none')
    expect(block.getHeightWidth().height).toBeLessThan(expandedHeight)
  })

  it('shows the input and its contents again when expanded', () => {
    const block = makeBlock('test_collapsible_statement')
    const child = addChild(block)
    const input = bodyInput(block)

    input.toggleField.showEditor()
    input.toggleField.showEditor()

    expect(input.isCollapsed()).toBe(false)
    expect(input.isVisible()).toBe(true)
    expect(input.toggleField.isVisible()).toBe(true)
    expect(input.toggleField.getValue()).toContain('collapse.svg')
    expect(child.getSvgRoot().style.display).toBe('block')
  })
})
