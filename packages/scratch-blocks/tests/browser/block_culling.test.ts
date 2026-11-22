/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
// Blocks outside the viewport are loaded without SVG and drawn when scrolling
// reaches them. The workspace still holds every block the whole time.
import * as Blockly from 'blockly/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installBlockCulling, isBlockCulled, resetBlockCulling, updateBlockCulling } from '../../src/block_culling'
import '../../src/index'
import { ScratchMsgs } from '../../src/scratch_msgs'
import { clearWorkspaceAndLoadFromXml } from '../../src/xml'

let container: HTMLElement
let workspace: Blockly.WorkspaceSvg

beforeAll(() => {
  ScratchMsgs.setLocale('en')
  container = document.createElement('div')
  container.style.width = '1200px'
  container.style.height = '800px'
  document.body.appendChild(container)
  workspace = Blockly.inject(container, {
    renderer: 'scratch_classic',
    move: { scrollbars: true, drag: true, wheel: true },
  })
  installBlockCulling(workspace)
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
  delete Blockly.Blocks.test_collapsible_statement
  delete Blockly.Blocks.test_collapsible_child
  workspace.dispose()
  container.remove()
})

beforeEach(() => {
  workspace.clear()
  resetBlockCulling(workspace)
})

function chainXml(remaining: number): string {
  if (remaining <= 0) return ''
  return (
    '<block type="motion_movesteps">' +
    '<value name="STEPS">' +
    '<shadow type="math_number"><field name="NUM">10</field></shadow>' +
    '</value>' +
    '<next>' +
    chainXml(remaining - 1) +
    '</next>' +
    '</block>'
  )
}

function scriptXml(id: string, x: number, y: number, chain: number): string {
  return (
    `<block type="event_whenflagclicked" id="${id}" x="${x}" y="${y}">` +
    `<next>${chainXml(chain)}</next>` +
    '</block>'
  )
}

function load(...scripts: string[]): void {
  clearWorkspaceAndLoadFromXml(Blockly.utils.xml.textToDom(`<xml>${scripts.join('')}</xml>`), workspace)
}

/**
 * Find a block in the workspace.
 * @param id Id of the block to look up.
 * @returns The block with that id.
 */
function block(id: string): Blockly.BlockSvg {
  const found = workspace.getBlockById(id)
  if (!found) throw new Error(`missing block ${id}`)
  return found
}

/**
 * Whether a stack has had its SVG created.
 * @param id Id of the stack's top block.
 * @returns True if the stack is drawn.
 */
function isDrawn(id: string): boolean {
  return !isBlockCulled(block(id))
}

/**
 * Move the viewport so that (x, y) is its top-left corner, the way the editor
 * restores a target's scroll position.
 * @param x Left edge in workspace coordinates.
 * @param y Top edge in workspace coordinates.
 */
function scrollTo(x: number, y: number): void {
  workspace.scrollX = -x
  workspace.scrollY = -y
  workspace.resize()
}

async function waitForDrawn(id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (isDrawn(id)) return true
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  return isDrawn(id)
}

describe('block culling', () => {
  it('does not draw stacks outside the viewport', () => {
    load(scriptXml('near', 0, 0, 2), scriptXml('far', 20000, 20000, 2))

    expect(isDrawn('near')).toBe(true)
    expect(isDrawn('far')).toBe(false)
  })

  it('keeps every block in the workspace and in the serialized XML', () => {
    load(scriptXml('near', 0, 0, 2), scriptXml('far', 20000, 20000, 2))

    expect(workspace.getAllBlocks(false)).toHaveLength(10)
    const xml = Blockly.Xml.workspaceToDom(workspace).outerHTML
    expect(xml).toContain('id="near"')
    expect(xml).toContain('id="far"')
  })

  it('draws a postponed stack when scrolling reaches it', async () => {
    load(scriptXml('near', 0, 0, 2), scriptXml('far', 20000, 20000, 2))
    expect(isDrawn('far')).toBe(false)

    scrollTo(20000, 20000)

    expect(await waitForDrawn('far')).toBe(true)
    expect(block('far').getSvgRoot().childElementCount).toBeGreaterThan(0)
  })

  it('does not draw postponed blocks when something renders them', () => {
    load(scriptXml('near', 0, 0, 2), scriptXml('far', 20000, 20000, 2))

    block('far').render()

    expect(isDrawn('far')).toBe(false)
  })

  it('keeps a collapsed input collapsed when its stack is drawn', () => {
    load(
      scriptXml('near', 0, 0, 2),
      '<block type="test_collapsible_statement" id="collapsed" x="20000" y="20000" ' +
        'collapsedinputs="BODY">' +
        '<statement name="BODY">' +
        '<block type="test_collapsible_child" id="child"></block>' +
        '</statement>' +
        '</block>',
    )

    expect(isDrawn('collapsed')).toBe(false)
    scrollTo(20000, 20000)
    updateBlockCulling(workspace)

    expect(isDrawn('collapsed')).toBe(true)
    expect(block('child').getSvgRoot().style.display).toBe('none')
  })

  it('draws each stack once', () => {
    load(scriptXml('near', 0, 0, 2), scriptXml('far', 20000, 20000, 2))

    updateBlockCulling(workspace)
    updateBlockCulling(workspace)

    expect(isDrawn('far')).toBe(false)
    scrollTo(20000, 20000)
    updateBlockCulling(workspace)
    expect(isDrawn('far')).toBe(true)
    const children = block('far').getSvgRoot().childElementCount
    updateBlockCulling(workspace)
    expect(block('far').getSvgRoot().childElementCount).toBe(children)
  })
})
