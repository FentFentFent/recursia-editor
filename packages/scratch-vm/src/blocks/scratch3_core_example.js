const BlockType = require('../extension-support/block-type');
const ArgumentType = require('../extension-support/argument-type');
const StyleShape = require('../extension-support/style-type.js');
 
const blockIconURI = 'data:image/svg+xml,%3Csvg id="rotate-counter-clockwise" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cdefs%3E%3Cstyle%3E.cls-1%7Bfill:%233d79cc;%7D.cls-2%7Bfill:%23fff;%7D%3C/style%3E%3C/defs%3E%3Ctitle%3Erotate-counter-clockwise%3C/title%3E%3Cpath class="cls-1" d="M22.68,12.2a1.6,1.6,0,0,1-1.27.63H13.72a1.59,1.59,0,0,1-1.16-2.58l1.12-1.41a4.82,4.82,0,0,0-3.14-.77,4.31,4.31,0,0,0-2,.8,4.25,4.25,0,0,0-1.34,1.73,5.06,5.06,0,0,0,.54,4.62A5.58,5.58,0,0,0,12,17.74h0a2.26,2.26,0,0,1-.16,4.52A10.25,10.25,0,0,1,3.74,18,10.14,10.14,0,0,1,2.25,8.78,9.7,9.7,0,0,1,5.08,4.64,9.92,9.92,0,0,1,9.66,2.5a10.66,10.66,0,0,1,7.72,1.68l1.08-1.35a1.57,1.57,0,0,1,1.24-.6,1.6,1.6,0,0,1,1.54,1.21l1.7,7.37A1.57,1.57,0,0,1,22.68,12.2Z"/%3E%3Cpath class="cls-2" d="M21.38,11.83H13.77a.59.59,0,0,1-.43-1l1.75-2.19a5.9,5.9,0,0,0-4.7-1.58,5.07,5.07,0,0,0-4.11,3.17A6,6,0,0,0,7,15.77a6.51,6.51,0,0,0,5,2.92,1.31,1.31,0,0,1-.08,2.62,9.3,9.3,0,0,1-7.35-3.82A9.16,9.16,0,0,1,3.17,9.12,8.51,8.51,0,0,1,5.71,5.4,8.76,8.76,0,0,1,9.82,3.48a9.71,9.71,0,0,1,7.75,2.07l1.67-2.1a.59.59,0,0,1,1,.21L22,11.08A.59.59,0,0,1,21.38,11.83Z"/%3E%3C/svg%3E';

/**
 * An example core block implemented using the extension spec.
 * This is not loaded as part of the core blocks in the VM but it is provided
 * and used as part of tests.
 */
class Scratch3CoreExample {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'coreExample',
            name: 'CoreEx', // This string does not need to be translated as this extension is only used as an example.
            blocks: [
                {
                    func: 'MAKE_A_VARIABLE',
                    blockType: BlockType.BUTTON,
                    text: 'make a variable (CoreEx)'
                },
                {
                    blockType: BlockType.LABEL,
                    text: "Test Label",
                },
                {
                    opcode: 'exampleOpcode',
                    blockType: BlockType.REPORTER,
                    text: 'example block',
                    style: StyleShape.ExtraPadded,
                    compile: context =>
                        `(runtime.getTargetForStage() ? runtime.getTargetForStage().getName() : ${
                            context.quote('no stage yet')
                        })`
                },
                {
                    blockType: BlockType.XML,
                    xml: `<block type="coreExample_exampleOpcode"></block>`
                },
                {
                    opcode: 'exampleWithInlineImage',
                    blockType: BlockType.COMMAND,
                    text: 'block with image [CLOCKWISE] inline',
                    arguments: {
                        CLOCKWISE: {
                            type: ArgumentType.IMAGE,
                            dataURI: blockIconURI
                        }
                    }
                },
                {
                    opcode: 'exampleWithNewInputs',
                    blockType: BlockType.COMMAND,
                    text: 'block with inline-stack: [INLINESTACK] and single-block: [SINGLEBLOCK] inputs',
                    arguments: {
                        INLINESTACK: {
                            type: ArgumentType.INLINE_STACK
                        },
                        SINGLEBLOCK: {
                            type: ArgumentType.SINGLE_BLOCK
                        },
                    }
                },
                {
                    blockType: BlockType.LABEL,
                    text: 'Style shapes'
                },
                {
                    opcode: 'extraPadded',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'extra padded',
                    style: StyleShape.ExtraPadded
                },
                {
                    opcode: 'minimalPadding',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'minimal padding',
                    style: StyleShape.MinimalPadding
                },
                {
                    opcode: 'noRoundedCorners',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'no rounded corners',
                    style: StyleShape.NoRoundedCorners
                },
                {
                    opcode: 'smallRoundedCorners',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'small rounded corners',
                    style: StyleShape.SmallRoundedCorners
                },
                {
                    opcode: 'mediumRoundedCorners',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'medium rounded corners',
                    style: StyleShape.MediumRoundedCorners
                },
                {
                    opcode: 'bigRoundedCorners',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'big rounded corners',
                    style: StyleShape.BigRoundedCorners
                },
                {
                    opcode: 'extremeRoundedCorners',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'extreme rounded corners',
                    style: StyleShape.ExtremeRoundedCorners
                },
                {
                    opcode: 'classicalHat',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.HAT,
                    text: 'classical hat',
                    style: StyleShape.ClassicalHat
                },
                {
                    opcode: 'bowlerHat',
                    func: 'exampleStyleBlock',
                    blockType: BlockType.HAT,
                    text: 'bowler hat',
                    style: StyleShape.BowlerHat
                },
                {
                    blockType: BlockType.LABEL,
                    text: 'Color styles'
                },
                {
                    opcode: 'extendedColorStyle',
                    func: 'exampleColorStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'motion colors',
                    colorStyle: {
                        base: 'motion'
                    }
                },
                {
                    opcode: 'customColorStyle',
                    func: 'exampleColorStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'own colors in every color mode',
                    colorStyle: {
                        default: {color1: '#FF8C1A', color2: '#DB6E00', color3: '#FFE5CC'},
                        dark: {color1: '#331C05', color2: '#EE7A3C', color3: '#FFE5CC'},
                        'high-contrast': {color1: '#FFA54C', color2: '#FFE5CC', color3: '#DB6E00'},
                        'cherry-light': {color1: '#EE7A3C', color2: '#C2541C', color3: '#AF3B18'},
                        'cherry-dark': {color1: '#331B0F', color2: '#EE7A3C', color3: '#E05A32'}
                    }
                },
                {
                    opcode: 'mixedColorStyle',
                    func: 'exampleColorStyleBlock',
                    blockType: BlockType.COMMAND,
                    text: 'pen colors, overridden per color mode',
                    colorStyle: {
                        base: 'pen',
                        dark: 'sensing',
                        'cherry-dark': {color1: '#33121B', color2: '#E8456B'}
                    }
                }
            ]
        };
    }

    /**
     * Example opcode just returns the name of the stage target.
     * @returns {string} The name of the first target in the project.
     */
    exampleOpcode () {
        const stage = this.runtime.getTargetForStage();
        return stage ? stage.getName() : 'no stage yet';
    }
    /**
     * Example block with a single block input and an inline stack input. The
     * blocks connected to an input only run when the implementation asks for
     * them, so this block runs both inputs.
     * @param {object} args Block arguments.
     * @param {BlockUtility} util Block utility.
     */
    exampleWithNewInputs (args, util) {
        // Only one of these will run, the one that does is the one that is connected, or the first available if both are.
        util.startBlockInput(args.SINGLEBLOCK);
        util.startBlockInput(args.INLINESTACK);
    }
    exampleWithInlineImage () {
        return;
    }

    /**
     * Shared no-op implementation for the blocks that demonstrate block styles.
     */
    exampleStyleBlock () {
        return;
    }

    /**
     * Shared no-op implementation for the blocks that demonstrate block color styles.
     */
    exampleColorStyleBlock () {
        return;
    }

}

module.exports = Scratch3CoreExample;
