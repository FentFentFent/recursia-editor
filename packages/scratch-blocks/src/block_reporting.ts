import * as Blockly from 'blockly/core'
import { Colours } from './colours'
import { getBlockSvgById,getRequiredMainWorkspaceSvg } from './workspace_block_lookup'

/**
 * The first field on a block, which is where a reported value hangs from.
 *
 * @param block Block to search.
 * @returns The field, or null for a block made only of inputs.
 */
function firstField(block: Blockly.BlockSvg): Blockly.Field | null {
    for (const input of block.inputList) {
        for (const field of input.fieldRow) {
            return field
        }
    }
    return null
}

/**
 * A stand-in field for a block that has no field, such as "join" or a reporter from an extension.
 * Placing a value against it puts the bubble against the edge of the block.
 *
 * @param block Block the value belongs to.
 * @returns An anchor the drop-down reads its block from.
 */
function blockAnchor(block: Blockly.BlockSvg): Blockly.Field {
    return {
        getSourceBlock: () => block
    } as unknown as Blockly.Field
}

export function reportValue(id: string,value: string) {
    const mainWorkspace = getRequiredMainWorkspaceSvg()
    const flyout = mainWorkspace.getFlyout()
    const flyoutBlock = flyout ? getBlockSvgById(flyout.getWorkspace(),id) : null
    const block = getBlockSvgById(mainWorkspace,id) ?? flyoutBlock
    if (!block) {
        throw new Error('Tried to report value on block that does not exist.')
    }

    const anchor = firstField(block) ?? blockAnchor(block)

    // A clicked reporter keeps reporting while its thread runs, so each value replaces the previous one
    // instead of stacking in the bubble. The bubble takes no focus, which would make the next report throw.
    Blockly.DropDownDiv.hideWithoutAnimation()
    Blockly.DropDownDiv.clearContent()
    const contentDiv = Blockly.DropDownDiv.getContentDiv()
    const valueReportBox = document.createElement('div')
    valueReportBox.setAttribute('class','valueReportBox')
    valueReportBox.innerText = value
    contentDiv.appendChild(valueReportBox)
    Blockly.DropDownDiv.setColour(Colours.valueReportBackground,Colours.valueReportBorder)
    Blockly.DropDownDiv.showPositionedByBlock(anchor,block,undefined,undefined,false)
}
