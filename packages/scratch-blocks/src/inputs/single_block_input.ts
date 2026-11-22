/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'
import { SingleStatementInput } from './single_statement_input'

/**
 * The `args0` type name for a single-block input.
 */
export const SINGLE_BLOCK_INPUT_TYPE = 'input_block_single'

// Blockly types these connections as non-null, but blocks that do not have them
// carry null at runtime. This type corrects that so null checks work.
type BlockWithNullableConnections = Omit<Blockly.Block, 'outputConnection' | 'previousConnection'> & {
  outputConnection: Blockly.Connection | null
  previousConnection: Blockly.Connection | null
}

/** The part of a connection database this connection updates. */
interface ConnectionDatabase {
  addConnection: (connection: Blockly.RenderedConnection, y: number) => void
  removeConnection: (connection: Blockly.RenderedConnection, y: number) => void
}

/**
 * The connection of a single-block input.
 *
 * Blockly searches for drop targets only in the database of the connection
 * type opposite the dragged connection, so a connection that accepts both a
 * stack block and a reporter has to be in both the next-statement database and
 * the value-connection database. Blockly keeps the former up to date; this
 * connection also keeps itself in the latter.
 */
class SingleBlockConnection extends Blockly.RenderedConnection {
  private readonly valueDb: ConnectionDatabase

  private inValueDb = false

  constructor(block: Blockly.BlockSvg, type: Blockly.ConnectionType) {
    super(block, type)
    this.valueDb = block.workspace.connectionDBList[Blockly.ConnectionType.INPUT_VALUE]
  }

  override moveTo(x: number, y: number): boolean {
    // A connection database finds a connection by its current position, so the
    // connection has to be removed before its position changes.
    if (this.inValueDb) this.valueDb.removeConnection(this, this.y)
    const moved = super.moveTo(x, y)
    if (moved) {
      this.valueDb.addConnection(this, y)
    }
    this.inValueDb = moved
    return moved
  }

  override setTracking(tracking: boolean): void {
    super.setTracking(tracking)
    // Flyout blocks are not drop targets, so their connections stay untracked.
    const tracked = tracking && !this.getSourceBlock().isInFlyout
    if (tracked === this.inValueDb) return
    if (tracked) {
      this.valueDb.addConnection(this, this.y)
    } else {
      this.valueDb.removeConnection(this, this.y)
    }
    this.inValueDb = tracked
  }

  override dispose(): void {
    if (this.inValueDb) {
      this.valueDb.removeConnection(this, this.y)
      this.inValueDb = false
    }
    super.dispose()
  }
}

/**
 * An input that holds one block, which may be a stack block or a reporter.
 *
 * A stack block connects through the input's next-statement connection and
 * renders as it does in a statement input. A reporter also connects through
 * that connection, using its output connection; while it is there the input
 * measures and serializes as a value input, so the reporter sits in a
 * reporter-shaped slot instead of being laid out as a stack.
 */
export class SingleBlockInput extends SingleStatementInput {
  constructor(name: string, block: Blockly.Block) {
    super(name, block)

    // The input is a statement input while it is empty or holds a stack, and a
    // value input while it holds a reporter. Serialization reads `type` to
    // choose between a <statement> and a <value> element, so it has to follow
    // what is connected.
    Object.defineProperty(this, 'type', {
      get(this: SingleBlockInput) {
        return this.holdsReporter() ? Blockly.inputs.inputTypes.VALUE : Blockly.inputs.inputTypes.STATEMENT
      },
    })
  }

  protected override makeConnection(type: Blockly.ConnectionType): Blockly.Connection {
    const block = this.getSourceBlock()
    if (block instanceof Blockly.BlockSvg) return new SingleBlockConnection(block, type)
    return super.makeConnection(type)
  }

  /**
   * Whether the block in this input is a reporter rather than a stack block.
   * @returns True if the connected block reports a value instead of running.
   */
  holdsReporter(): boolean {
    const occupant = this.connection?.targetBlock() as BlockWithNullableConnections | null
    return Boolean(occupant?.outputConnection && !occupant.previousConnection)
  }
}

Blockly.registry.register(Blockly.registry.Type.INPUT, SINGLE_BLOCK_INPUT_TYPE, SingleBlockInput)
