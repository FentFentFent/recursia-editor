/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'

/**
 * Culling for the block workspace.
 *
 * A workspace normally builds the SVG for every block it loads, including
 * blocks far outside the viewport. A large project can hold thousands of those,
 * and creating their DOM and drawing their paths takes most of the time a
 * project takes to open. Blocks outside the viewport are instead created
 * without SVG and stay that way until scrolling brings them into view, at which
 * point their SVG is created like any other block's.
 *
 * Blocks without SVG still exist in the workspace: they serialize, they count
 * toward the scroll area (by their saved position), and their connections stay
 * intact. Only their drawing is postponed.
 */

/**
 * Rough width of a stack, in workspace units, used to decide whether an
 * unrendered stack would be visible. Deliberately generous: rendering a stack
 * that turns out to be off-screen wastes work, leaving a visible one unrendered
 * shows a hole.
 */
const ESTIMATED_STACK_WIDTH = 600

/** Rough height of one block, in workspace units, for the same estimate. */
const ESTIMATED_BLOCK_HEIGHT = 48

/** Space around the viewport that stays rendered, as a multiple of its size. */
const MARGIN_FRACTION = 1.2

/** Blocks whose SVG has been postponed, by workspace. */
const deferredByWorkspace = new WeakMap<Blockly.WorkspaceSvg, Set<Blockly.BlockSvg>>()

/**
 * The blocks whose SVG the import in progress should postpone, if any. Set
 * only while workspace XML is being imported.
 */
let deferredBlockIds: Set<string> | null = null

/** Workspaces with a culling pass already queued. */
const scheduledWorkspaces = new WeakSet<Blockly.WorkspaceSvg>()

// Each patched method keeps the method it replaces, so it can still be called.
/* eslint-disable @typescript-eslint/unbound-method -- preserved prototype methods */
const originalInitSvg = Blockly.BlockSvg.prototype.initSvg
const originalRender = Blockly.BlockSvg.prototype.render
const originalGetHeightWidth = Blockly.BlockSvg.prototype.getHeightWidth
/* eslint-enable @typescript-eslint/unbound-method */

Blockly.BlockSvg.prototype.initSvg = function (this: Blockly.BlockSvg) {
  if (deferredBlockIds?.has(this.id) || hasDeferredAncestor(this)) {
    const workspace = this.workspace
    let deferred = deferredByWorkspace.get(workspace)
    if (!deferred) {
      deferred = new Set()
      deferredByWorkspace.set(workspace, deferred)
    }
    deferred.add(this)
    return
  }
  originalInitSvg.call(this)
}

/**
 * Whether a block is inside a stack whose SVG is already postponed.
 * @param block The block to check.
 * @returns True if an ancestor's SVG is postponed.
 */
function hasDeferredAncestor(block: Blockly.BlockSvg): boolean {
  for (let parent = block.getParent(); parent; parent = parent.getParent()) {
    if (isBlockCulled(parent)) return true
  }
  return false
}

Blockly.BlockSvg.prototype.render = function (this: Blockly.BlockSvg) {
  if (deferredByWorkspace.get(this.workspace)?.has(this)) return
  originalRender.call(this)
}

// An unrendered block reports a negative height, which would make the
// workspace's content area collapse and leave its own stack unreachable by the
// scrollbars. Report the estimate the culling uses instead.
Blockly.BlockSvg.prototype.getHeightWidth = function (this: Blockly.BlockSvg) {
  if (isBlockCulled(this)) {
    return new Blockly.utils.Size(ESTIMATED_STACK_WIDTH, ESTIMATED_BLOCK_HEIGHT)
  }
  return originalGetHeightWidth.call(this)
}

/* eslint-disable @typescript-eslint/unbound-method -- preserved prototype methods */
const originalScroll = Blockly.WorkspaceSvg.prototype.scroll
Blockly.WorkspaceSvg.prototype.scroll = function (
  this: Blockly.WorkspaceSvg,
  ...args: Parameters<typeof originalScroll>
) {
  originalScroll.apply(this, args)
  scheduleBlockCulling(this)
}

const originalSetScale = Blockly.WorkspaceSvg.prototype.setScale
Blockly.WorkspaceSvg.prototype.setScale = function (
  this: Blockly.WorkspaceSvg,
  ...args: Parameters<typeof originalSetScale>
) {
  originalSetScale.apply(this, args)
  scheduleBlockCulling(this)
}

const originalResize = Blockly.WorkspaceSvg.prototype.resize
/* eslint-enable @typescript-eslint/unbound-method */
Blockly.WorkspaceSvg.prototype.resize = function (
  this: Blockly.WorkspaceSvg,
  ...args: Parameters<typeof originalResize>
) {
  originalResize.apply(this, args)
  scheduleBlockCulling(this)
}

/**
 * Whether a block's SVG has been postponed.
 * @param block The block to check.
 * @returns True if the block is waiting for its SVG to be created.
 */
export function isBlockCulled(block: Blockly.BlockSvg): boolean {
  return !!deferredByWorkspace.get(block.workspace)?.has(block)
}

/**
 * The area of a workspace that stays rendered: its viewport plus a margin.
 * @param workspace The workspace to measure.
 * @returns The area in workspace coordinates, or null if the workspace has no
 *     visible area.
 */
function getRenderedArea(workspace: Blockly.WorkspaceSvg): Blockly.utils.Rect | null {
  const metrics = workspace.getMetrics()
  if (metrics.viewWidth <= 0 || metrics.viewHeight <= 0) return null

  const margin = Math.max(metrics.viewWidth, metrics.viewHeight) * MARGIN_FRACTION
  return new Blockly.utils.Rect(
    metrics.viewTop - margin,
    metrics.viewTop + metrics.viewHeight + margin,
    metrics.viewLeft - margin,
    metrics.viewLeft + metrics.viewWidth + margin,
  )
}

/**
 * Estimate the area a stack covers on the workspace.
 * @param block Top block of the stack.
 * @returns The estimated area in workspace coordinates.
 */
function estimateArea(block: Blockly.BlockSvg): Blockly.utils.Rect {
  const origin = block.getRelativeToSurfaceXY()
  const height = (1 + block.getChildren(false).length) * ESTIMATED_BLOCK_HEIGHT
  return new Blockly.utils.Rect(origin.y, origin.y + height, origin.x, origin.x + ESTIMATED_STACK_WIDTH)
}

/**
 * How deeply a block is nested, so a stack can be initialized from its top
 * block down: a block needs its parent's size to be positioned.
 * @param block The block to measure.
 * @returns The number of ancestors the block has.
 */
function nestingDepth(block: Blockly.BlockSvg): number {
  let depth = 0
  for (let parent = block.getParent(); parent; parent = parent.getParent()) depth++
  return depth
}

/**
 * Create the SVG of a postponed stack.
 * @param deferred Blocks of the workspace whose SVG is postponed.
 * @param top Top block of the stack.
 */
function initializeStack(deferred: Set<Blockly.BlockSvg>, top: Blockly.BlockSvg): void {
  const stack = [top, ...top.getChildren(false)]
  stack.sort((a, b) => nestingDepth(a) - nestingDepth(b))

  for (const block of stack) {
    if (!deferred.delete(block)) continue
    originalInitSvg.call(block)
    originalRender.call(block)
  }
}

/**
 * Create the SVG of postponed stacks that the viewport has reached.
 * @param workspace The workspace to update.
 */
export function updateBlockCulling(workspace: Blockly.WorkspaceSvg): void {
  const deferred = deferredByWorkspace.get(workspace)
  if (!deferred || deferred.size === 0 || !workspace.rendered) return

  const area = getRenderedArea(workspace)
  // A workspace that is not laid out has no viewport to cull against.
  if (!area || workspace.isDragging()) return

  let initialized = false
  for (const top of workspace.getTopBlocks(false)) {
    if (!deferred.has(top)) continue
    if (!estimateArea(top).intersects(area)) continue
    initializeStack(deferred, top)
    initialized = true
  }

  // The rendered blocks can be taller than estimated, so the scroll area grew.
  if (initialized) workspace.resize()
}

/**
 * Queue a culling pass after the current layout work.
 * @param workspace The workspace to update.
 */
export function scheduleBlockCulling(workspace: Blockly.WorkspaceSvg): void {
  if (scheduledWorkspaces.has(workspace)) return
  scheduledWorkspaces.add(workspace)
  requestAnimationFrame(() => {
    scheduledWorkspaces.delete(workspace)
    updateBlockCulling(workspace)
  })
}

/**
 * Start culling imported blocks in a workspace.
 *
 * The workspace renders the stacks in and near its viewport and postpones the
 * rest. Call once per workspace, after it is created.
 * @param workspace The workspace to cull.
 */
export function installBlockCulling(workspace: Blockly.WorkspaceSvg): void {
  workspace.addChangeListener((event: Blockly.Events.Abstract) => {
    if (event.type === String(Blockly.Events.VIEWPORT_CHANGE)) {
      scheduleBlockCulling(workspace)
    }
  })
}

/**
 * Drop the postponed blocks of a workspace, for a workspace that is about to
 * be cleared.
 * @param workspace The workspace to reset.
 */
export function resetBlockCulling(workspace: Blockly.WorkspaceSvg): void {
  deferredByWorkspace.delete(workspace)
}

/**
 * Load workspace XML, postponing the SVG of stacks outside the viewport.
 *
 * Blocks are still created and connected as usual, so the workspace remains
 * complete; only their drawing waits until scrolling reaches them.
 * @param xml Workspace XML to load.
 * @param workspace Workspace to load it into.
 * @returns Ids of the top-level blocks that were created.
 */
export function importBlocksWithCulling(xml: Element, workspace: Blockly.WorkspaceSvg): string[] {
  const area = getRenderedArea(workspace)
  const ids = new Set<string>()

  if (area) {
    for (const element of Array.from(xml.children)) {
      if (element.tagName !== 'block' && element.tagName !== 'shadow') continue
      const x = Number(element.getAttribute('x') ?? 0)
      const y = Number(element.getAttribute('y') ?? 0)
      const height = (1 + element.querySelectorAll('block, shadow').length) * ESTIMATED_BLOCK_HEIGHT
      const stackArea = new Blockly.utils.Rect(y, y + height, x, x + ESTIMATED_STACK_WIDTH)
      if (stackArea.intersects(area)) continue

      for (const node of [element, ...Array.from(element.querySelectorAll('[id]'))]) {
        const id = node.getAttribute('id')
        if (id) ids.add(id)
      }
    }
  }

  const previous = deferredBlockIds
  deferredBlockIds = ids
  try {
    return Blockly.Xml.domToWorkspace(xml, workspace)
  } finally {
    deferredBlockIds = previous
  }
}
