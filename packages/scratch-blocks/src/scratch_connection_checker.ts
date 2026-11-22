/**
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'
import { SingleBlockInput } from './inputs/single_block_input'
import { SingleStatementInput } from './inputs/single_statement_input'

/**
 * Whether this connection belongs to a single-statement input.
 * @param connection The connection to check.
 * @returns True if the connection is a single-statement input's connection.
 */
function isSingleStatementInputConnection(connection: Blockly.Connection | null): boolean {
  return connection?.getParentInput() instanceof SingleStatementInput
}

/**
 * Whether this connection is the next connection of the block inside a
 * single-statement input.
 * @param connection The connection to check.
 * @returns True if connecting here would add a block to a single-statement
 *     input's stack.
 */
function isSingleStatementChildNextConnection(connection: Blockly.Connection | null): boolean {
  if (connection?.type !== Blockly.ConnectionType.NEXT_STATEMENT || connection.isConnected()) return false
  const child = connection.getSourceBlock()
  // Insertion markers are transient previews, not real occupants of the slot.
  if (child?.isInsertionMarker?.()) return false
  return isSingleStatementInputConnection(child.previousConnection?.targetConnection ?? null)
}

/**
 * The single-block input a connection belongs to, if any.
 * @param connection The connection to check.
 * @returns The input, or null if the connection belongs to another kind of input.
 */
function getSingleBlockInput(connection: Blockly.Connection | null): SingleBlockInput | null {
  const input = connection?.getParentInput()
  return input instanceof SingleBlockInput ? input : null
}

/**
 * Custom connection checker to restrict which blocks can be connected.
 */
class ScratchConnectionChecker extends Blockly.ConnectionChecker {
  override canConnectWithReason(
    a: Blockly.Connection | null,
    b: Blockly.Connection | null,
    isDragging: boolean,
    opt_distance?: number,
  ): number {
    // The prototype's next connection is visual-only and should not accept any connections.
    const isPrototypeNextConn = (c: Blockly.Connection | null) =>
      c?.type === Blockly.ConnectionType.NEXT_STATEMENT && c.getSourceBlock().type === 'procedures_prototype'
    if (isPrototypeNextConn(a) || isPrototypeNextConn(b)) {
      return Blockly.Connection.REASON_CHECKS_FAILED
    }

    // A single-block input also takes a reporter, which connects through its
    // output connection. Blockly pairs each connection type with exactly one
    // opposite type, so the slot is checked as though it were a value input
    // while a reporter is offered to it.
    const singleBlockInput = getSingleBlockInput(a) ?? getSingleBlockInput(b)
    if (singleBlockInput) {
      const otherConnection = singleBlockInput.connection === a ? b : a
      if (otherConnection?.type === Blockly.ConnectionType.OUTPUT_VALUE) {
        const connection = singleBlockInput.connection as { type: Blockly.ConnectionType }
        const type = connection.type
        connection.type = Blockly.ConnectionType.INPUT_VALUE
        try {
          return super.canConnectWithReason(a, b, isDragging, opt_distance)
        } finally {
          connection.type = type
        }
      }
    }

    // A single-statement input takes exactly one block. Reject anything that
    // would add a second one: a multi-block stack dropped into the input, a
    // block inserted above the one already inside it, or a block connected
    // below that block. The block inside keeps its next connection so it keeps
    // rendering its notch; only the connection itself is refused.
    if (isSingleStatementInputConnection(a) || isSingleStatementInputConnection(b)) {
      const inputConnection = isSingleStatementInputConnection(a) ? a : b
      const otherConnection = inputConnection === a ? b : a
      if (inputConnection && otherConnection) {
        // An insertion marker (drag preview) sitting in the input does not
        // count as the slot being occupied: it is transient and will be
        // replaced, so rejecting on its account makes the preview flicker in
        // and out every frame. Only a real block occupying the slot blocks a
        // new connection.
        const targetBlock = inputConnection.targetBlock()
        const occupiedByRealBlock =
          inputConnection.isConnected() && !targetBlock?.isInsertionMarker?.()
        if (
          inputConnection.targetConnection !== otherConnection &&
          (occupiedByRealBlock || otherConnection.getSourceBlock().getNextBlock())
        ) {
          return Blockly.Connection.REASON_CHECKS_FAILED
        }
      }
    }
    if (isSingleStatementChildNextConnection(a) || isSingleStatementChildNextConnection(b)) {
      return Blockly.Connection.REASON_CHECKS_FAILED
    }

    return super.canConnectWithReason(a, b, isDragging, opt_distance)
  }

  /**
   * Returns whether or not the two connections should be allowed to connect.
   * @param a One of the connections to check.
   * @param b The other connection to check.
   * @param distance The maximum allowable distance between connections.
   * @returns True if the connections should be allowed to connect.
   */
  doDragChecks(a: Blockly.RenderedConnection, b: Blockly.RenderedConnection, distance: number): boolean {
    // This check prevents dragging a block into the slot occupied by the
    // procedure caller example block in a procedure definition block.
    if (b.getSourceBlock().type === 'procedures_definition' && b.getParentInput()?.name === 'custom_block') {
      return false
    }

    // Prevent dragging any block into a procedures_prototype input. Argument
    // reporters inside the prototype are managed programmatically and should
    // not be displaceable by user drag-and-drop.
    if (b.getSourceBlock().type === 'procedures_prototype') {
      return false
    }

    // Blockly's base doDragChecks rejects inserting a block with no
    // nextConnection into the middle of a stack (NEXT_STATEMENT case) because
    // it assumes the displaced blocks have nowhere to go. Our
    // getConnectionForOrphanedConnection patch routes displaced blocks into
    // statement inputs, so we allow the connection when a suitable statement
    // input exists on the dragging block.
    const bType: Blockly.ConnectionType = b.type
    if (
      bType === Blockly.ConnectionType.NEXT_STATEMENT &&
      b.isConnected() &&
      !(a.getSourceBlock() as Blockly.Block).nextConnection
    ) {
      const orphan = b.targetBlock()
      const orphanPrev = (orphan as Blockly.Block | null)?.previousConnection
      if (orphan && !orphan.isShadow() && orphanPrev) {
        const canWrap = !!Blockly.Connection.getConnectionForOrphanedConnection(a.getSourceBlock(), orphanPrev)
        if (canWrap) {
          // Skip the base class NEXT_STATEMENT check (which would reject
          // this) but still apply the other generic guards it uses.
          if ('distanceFrom' in a && a.distanceFrom(b) > distance) return false
          if (b.getSourceBlock().isInsertionMarker()) return false
          if (Blockly.common.draggingConnections.includes(b)) return false
          return true
        }
      }
    }

    return super.doDragChecks(a, b, distance)
  }
}

Blockly.registry.register(
  Blockly.registry.Type.CONNECTION_CHECKER,
  Blockly.registry.DEFAULT,
  ScratchConnectionChecker,
  true,
)
