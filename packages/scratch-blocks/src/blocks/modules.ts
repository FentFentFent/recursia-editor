
import * as Blockly from 'blockly/core'



Blockly.Blocks.modules_single_export = {
    init: function (this: Blockly.BlockSvg) {
        this.jsonInit({
            message0: Blockly.Msg.MODULES_EXPORTSINGULAR,
            message1: '%1',
            args1: [
                {
                    type: 'input_statement_single',
                    name: 'EXPORT', 
                },
            ],
            extensions: ['colours_modules','shape_bowler_hat','shape_hat','shape_meta'],
        })
    }
}
//
Blockly.Blocks.modules_export = {
    init: function (this: Blockly.BlockSvg) {
        this.jsonInit({
            message0: Blockly.Msg.MODULES_EXPORTSMULTIPLE,
            message1: '%1',
            args1: [
                {
                    type: 'input_statement',
                    name: 'EXPORT',
                },
            ],
            extensions: ['colours_modules','shape_hat', 'shape_meta'],
        })
    }
}