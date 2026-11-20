
/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Blockly from 'blockly/core'
import InlineStatementInput from './inputs/inline_statement_input'

class ScratchInsertionMarkerPreviewer extends Blockly.InsertionMarkerPreviewer {
    private markerStyle: Blockly.Theme.BlockStyle | null = null

    override previewConnection(
        draggedConn: Blockly.RenderedConnection,
        staticConn: Blockly.RenderedConnection,
    ): void {
        const sourceBlock = staticConn.getSourceBlock()

        const input = sourceBlock.inputList.find(
            input => input.connection === staticConn,
        )

        this.markerStyle =
            input instanceof InlineStatementInput
                ? sourceBlock.style
                : null

        super.previewConnection(draggedConn,staticConn)

        this.applyMarkerStyle(staticConn)
    }

    override previewReplacement(
        draggedConn: Blockly.RenderedConnection,
        staticConn: Blockly.RenderedConnection,
        replacedBlock: Blockly.BlockSvg,
    ): void {
        this.markerStyle = null

        super.previewReplacement(draggedConn,staticConn,replacedBlock)
    }

    private applyMarkerStyle(
        staticConn: Blockly.RenderedConnection,
    ): void {
        if (!this.markerStyle) return

        const marker = staticConn.targetBlock()

        if (!marker?.isInsertionMarker()) return
        if (!(marker instanceof Blockly.BlockSvg)) return

        marker.pathObject.style = this.markerStyle
    }

    override hidePreview(): void {
        this.markerStyle = null
        super.hidePreview()
    }

    protected override serializeBlockToInsertionMarker(
        block: Blockly.BlockSvg,
    ): Blockly.serialization.blocks.State {
        const blockJson = Blockly.serialization.blocks.save(block,{
            addCoordinates: false,
            addInputBlocks: true,
            addNextBlocks: false,
            doFullSerialization: false,
        })

        if (!blockJson) {
            throw new Error(
                `Failed to serialize source block. ${ block.toDevString() }`,
            )
        }

        return blockJson
    }
}

Blockly.registry.register(
    Blockly.registry.Type.CONNECTION_PREVIEWER,
    Blockly.registry.DEFAULT,
    ScratchInsertionMarkerPreviewer,
    true,
)
