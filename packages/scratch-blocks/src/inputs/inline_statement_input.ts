import * as Blockly from 'blockly/core'

/**
 * A statement input laid out on the same row as the fields before it instead
 * of as an indented C-shape.
 *
 * It is an ordinary statement input: it carries a next-statement connection, so
 * a stack can be connected to it and it is serialized as one.
 */
class InlineStatementInput extends Blockly.inputs.Input {
  constructor(name: string, block: Blockly.Block) {
    super(name, block)
    // Blockly's renderer and XML serialization only know statement and value
    // inputs, so an input carrying a next-statement connection has to report
    // itself as a statement input.
    ;(this as { type: Blockly.inputs.inputTypes }).type = Blockly.inputs.inputTypes.STATEMENT

    this.connection = this.makeConnection(Blockly.ConnectionType.NEXT_STATEMENT)
  }
}

Blockly.registry.register(Blockly.registry.Type.INPUT, 'inline_statement', InlineStatementInput)

export default InlineStatementInput
