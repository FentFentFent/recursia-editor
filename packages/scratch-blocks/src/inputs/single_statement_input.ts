/**
 * Copyright 2026 Scratch Foundation
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'
import InlineStatementInput from './inline_statement_input'

/**
 * The `args0` type name for a single-statement input.
 */
export const SINGLE_STATEMENT_INPUT_TYPE = 'input_statement_single'

/**
 * A statement input whose sub-stack holds at most one block.
 *
 * It is still an ordinary statement input: it renders the same C-shape, and the
 * block inside it keeps its previous and next connections so that block renders
 * exactly as it does anywhere else. `ScratchConnectionChecker` is what rejects
 * connections that would put a second block into the stack, including a whole
 * stack dropped into the input and anything connected below the block inside it.
 */
export class SingleStatementInput extends InlineStatementInput {}

Blockly.registry.register(Blockly.registry.Type.INPUT, SINGLE_STATEMENT_INPUT_TYPE, SingleStatementInput)
