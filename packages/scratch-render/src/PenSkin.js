const twgl = require('twgl.js');

const RenderConstants = require('./RenderConstants');
const Skin = require('./Skin');

const ShaderManager = require('./ShaderManager');

/**
 * Attributes to use when drawing with the pen
 * @typedef {object} PenSkin#PenAttributes
 * @property {number} [diameter] - The size (diameter) of the pen.
 * @property {Array<number>} [color4f] - The pen color as an array of [r,g,b,a], each component in the range [0,1].
 */

/**
 * The pen attributes to use when unspecified.
 * @type {PenSkin#PenAttributes}
 * @memberof PenSkin
 * @private
 * @constant
 */
const DefaultPenAttributes = {
    color4f: [0, 0, 1, 1],
    diameter: 1
};

/**
 * Corner coordinates (x, y) of the two triangles which make up one pen line quad.
 * @type {Array<number>}
 * @constant
 */
const LINE_QUAD_POSITIONS = [1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1];

/**
 * Number of vertices in one pen line quad.
 * @type {int}
 * @constant
 */
const VERTICES_PER_LINE = LINE_QUAD_POSITIONS.length / 2;

/**
 * Number of lines the vertex buffers have room for when first allocated.
 * @type {int}
 * @constant
 */
const INITIAL_LINE_CAPACITY = 128;

/**
 * Multiplier applied to the pen layer's display resolution when high-quality rendering is enabled. The extra texels
 * supersample the layer, which antialiases pen lines and stamps when it's scaled down for display.
 * @type {int}
 * @constant
 */
const HIGH_QUALITY_TEXTURE_SCALE = 2;

class PenSkin extends Skin {
    /**
     * Create a Skin which implements a Scratch pen layer.
     * @param {int} id - The unique ID for this Skin.
     * @param {RenderWebGL} renderer - The renderer which will use this Skin.
     * @param {boolean} [highQuality] - Whether to render the pen layer at a higher resolution than the stage.
     * @augments Skin
     * @listens RenderWebGL#event:NativeSizeChanged
     */
    constructor (id, renderer, highQuality = false) {
        super(id);

        /**
         * @private
         * @type {RenderWebGL}
         */
        this._renderer = renderer;

        /**
         * Whether this pen layer is drawn at a higher resolution than the stage.
         * @type {boolean}
         * @private
         */
        this._highQuality = highQuality;

        /** @type {Array<number>} - the size of the pen layer in stage units */
        this._size = null;

        /** @type {Array<number>} - the size of the pen layer's texture, in texels */
        this._textureSize = null;

        /** @type {WebGLFramebuffer} */
        this._framebuffer = null;

        /** @type {boolean} */
        this._silhouetteDirty = false;

        /** @type {Uint8Array} */
        this._silhouettePixels = null;

        /** @type {ImageData} */
        this._silhouetteImageData = null;

        /** @type {object} */
        this._lineOnBufferDrawRegionId = {
            enter: () => this._enterDrawLineOnBuffer(),
            exit: () => this._exitDrawLineOnBuffer()
        };

        /** @type {object} */
        this._usePenBufferDrawRegionId = {
            enter: () => this._enterUsePenBuffer(),
            exit: () => this._exitUsePenBuffer()
        };

        /** @type {int} */
        this._lineCapacity = 0;

        /** @type {int} - number of lines queued for the next flush */
        this._lineCount = 0;

        /** @type {?twgl.BufferInfo} */
        this._lineBufferInfo = null;

        /** @type {?Float32Array} */
        this._linePositions = null;

        /** @type {?Float32Array} */
        this._linePenPoints = null;

        /** @type {?Float32Array} */
        this._lineLengths = null;

        /** @type {?Float32Array} */
        this._lineThicknesses = null;

        /** @type {?Float32Array} */
        this._lineColors = null;

        /** @type {?twgl.BufferInfo} - geometry for copying the layer into a texture of a different size */
        this._copyBufferInfo = null;

        const NO_EFFECTS = 0;
        /**
         * Shader for queued pen lines, which takes its per-line values as vertex attributes.
         * @type {twgl.ProgramInfo}
         */
        this._lineShader = this._renderer._shaderManager.getShader(ShaderManager.DRAW_MODE.lineBatch, NO_EFFECTS);

        this.onNativeSizeChanged = this.onNativeSizeChanged.bind(this);
        this._renderer.on(RenderConstants.Events.NativeSizeChanged, this.onNativeSizeChanged);

        this._setCanvasSize(renderer.getNativeSize());
    }

    /**
     * Dispose of this object. Do not use it after calling this method.
     */
    dispose () {
        this._renderer.removeListener(RenderConstants.Events.NativeSizeChanged, this.onNativeSizeChanged);
        this._renderer.gl.deleteFramebuffer(this._framebuffer.framebuffer);
        this._framebuffer = null;
        this._renderer.gl.deleteTexture(this._texture);
        this._texture = null;
        this._deleteLineBuffers();
        this._deleteCopyBuffer();
        this._lineCount = 0;
        super.dispose();
    }

    /**
     * @returns {Array<number>} the "native" size, in texels, of this skin. [width, height]
     */
    get size () {
        return this._size;
    }

    /**
     * The number of texels this skin has per stage unit on each axis. The pen layer is rendered at the resolution it's
     * displayed at, so pen marks are as sharp as the sprites around them. High-quality rendering doubles that
     * resolution, which supersamples the layer for extra antialiasing.
     * @returns {Array<number>} the resolution of this skin's texture relative to the stage, on each axis.
     */
    get textureScale () {
        const canvas = this._renderer.gl.canvas;
        const quality = this._highQuality ? HIGH_QUALITY_TEXTURE_SCALE : 1;
        return [
            Math.max(1, canvas.width / this._size[0]) * quality,
            Math.max(1, canvas.height / this._size[1]) * quality
        ];
    }

    /**
     * Enable or disable high-quality rendering of this pen layer. The layer keeps its contents when this setting
     * changes.
     * @param {boolean} enabled - Whether to render the pen layer at a higher resolution than it's displayed at.
     */
    setHighQuality (enabled) {
        enabled = !!enabled;
        if (enabled === this._highQuality) return;

        this._highQuality = enabled;
        this.updateTexture();
    }

    useNearest(scale) {
        // Use nearest-neighbor interpolation when the pen skin is drawn at its texture resolution or larger, where
        // each texel maps to at least one screen pixel. Below that, use linear interpolation so the antialiasing
        // baked into the texture isn't lost.
        const textureScale = this.textureScale;
        return Math.max(scale[0] / textureScale[0], scale[1] / textureScale[1]) >= 100;
    }
    /**
     * @param {Array<number>} scale The X and Y scaling factors to be used, as percentages of this skin's "native" size.
     * @returns {WebGLTexture} The GL texture representation of this skin when drawing at the given size.
     */
    // eslint-disable-next-line no-unused-vars
    getTexture (scale) {
        return this._texture;
    }

    /**
     * Clear the pen layer.
     */
    clear () {
        // Queued lines belong to the layer being cleared, so drop them instead of drawing them first.
        this._lineCount = 0;

        this._renderer.enterDrawRegion(this._usePenBufferDrawRegionId);

        /* Reset framebuffer to transparent black */
        const gl = this._renderer.gl;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        this._silhouetteDirty = true;
    }

    /**
     * Draw a point on the pen layer.
     * @param {PenAttributes} penAttributes - how the point should be drawn.
     * @param {number} x - the X coordinate of the point to draw.
     * @param {number} y - the Y coordinate of the point to draw.
     */
    drawPoint (penAttributes, x, y) {
        this.drawLine(penAttributes, x, y, x, y);
    }

    /**
     * Queue a line to be drawn on the pen layer.
     * @param {PenAttributes} penAttributes - how the line should be drawn.
     * @param {number} x0 - the X coordinate of the beginning of the line.
     * @param {number} y0 - the Y coordinate of the beginning of the line.
     * @param {number} x1 - the X coordinate of the end of the line.
     * @param {number} y1 - the Y coordinate of the end of the line.
     */
    drawLine (penAttributes, x0, y0, x1, y1) {
        // For compatibility with Scratch 2.0, offset pen lines of width 1 and 3 so they're pixel-aligned.
        // See https://github.com/LLK/scratch-render/pull/314
        const diameter = penAttributes.diameter || DefaultPenAttributes.diameter;
        const offset = (diameter === 1 || diameter === 3) ? 0.5 : 0;

        this._drawLineOnBuffer(
            penAttributes,
            x0 + offset, y0 + offset,
            x1 + offset, y1 + offset
        );

        this._silhouetteDirty = true;
    }

    /**
     * Add one line to the batch of lines waiting to be drawn.
     * @param {PenAttributes} penAttributes - how the line should be drawn.
     * @param {number} x0 - the X coordinate of the beginning of the line.
     * @param {number} y0 - the Y coordinate of the beginning of the line.
     * @param {number} x1 - the X coordinate of the end of the line.
     * @param {number} y1 - the Y coordinate of the end of the line.
     * @private
     */
    _drawLineOnBuffer (penAttributes, x0, y0, x1, y1) {
        this._ensureLineCapacity(this._lineCount + 1);

        // Premultiply pen color by pen transparency
        const penColor = penAttributes.color4f || DefaultPenAttributes.color4f;
        const alpha = penColor[3];
        const red = penColor[0] * alpha;
        const green = penColor[1] * alpha;
        const blue = penColor[2] * alpha;

        const thickness = penAttributes.diameter || DefaultPenAttributes.diameter;

        // Fun fact: Doing this calculation in the shader has the potential to overflow the floating-point range.
        // 'mediump' precision is only required to have a range up to 2^14 (16384), so any lines longer than 2^7 (128)
        // can overflow that, because you're squaring the operands, and they could end up as "infinity".
        // Even GLSL's `length` function won't save us here:
        // https://asawicki.info/news_1596_watch_out_for_reduced_precision_normalizelength_in_opengl_es
        const lineDiffX = x1 - x0;
        const lineDiffY = y1 - y0;
        const lineLength = Math.sqrt((lineDiffX * lineDiffX) + (lineDiffY * lineDiffY));

        const lineIndex = this._lineCount;
        const firstVertex = lineIndex * VERTICES_PER_LINE;

        for (let vertex = 0; vertex < VERTICES_PER_LINE; vertex++) {
            const positionOffset = ((firstVertex + vertex) * 2);
            this._linePositions[positionOffset] = LINE_QUAD_POSITIONS[vertex * 2];
            this._linePositions[positionOffset + 1] = LINE_QUAD_POSITIONS[(vertex * 2) + 1];

            const penPointOffset = ((firstVertex + vertex) * 4);
            this._linePenPoints[penPointOffset] = x0;
            this._linePenPoints[penPointOffset + 1] = -y0;
            this._linePenPoints[penPointOffset + 2] = lineDiffX;
            this._linePenPoints[penPointOffset + 3] = -lineDiffY;

            this._lineLengths[firstVertex + vertex] = lineLength;
            this._lineThicknesses[firstVertex + vertex] = thickness;

            const colorOffset = ((firstVertex + vertex) * 4);
            this._lineColors[colorOffset] = red;
            this._lineColors[colorOffset + 1] = green;
            this._lineColors[colorOffset + 2] = blue;
            this._lineColors[colorOffset + 3] = alpha;
        }

        this._lineCount++;
    }

    /**
     * Draw all queued lines on the pen layer in a single draw call.
     */
    flushLines () {
        if (this._lineCount === 0) return;

        const gl = this._renderer.gl;
        const vertexCount = this._lineCount * VERTICES_PER_LINE;

        if (!this._lineBufferInfo) {
            this._lineBufferInfo = this._createLineBufferInfo();
        }

        this._renderer.enterDrawRegion(this._lineOnBufferDrawRegionId);

        gl.useProgram(this._lineShader.program);

        const attribs = this._lineBufferInfo.attribs;
        twgl.setAttribInfoBufferFromArray(gl, attribs.a_position, this._linePositions.subarray(0, vertexCount * 2));
        twgl.setAttribInfoBufferFromArray(gl, attribs.a_penPoint, this._linePenPoints.subarray(0, vertexCount * 4));
        twgl.setAttribInfoBufferFromArray(gl, attribs.a_lineLength, this._lineLengths.subarray(0, vertexCount));
        twgl.setAttribInfoBufferFromArray(gl, attribs.a_lineThickness, this._lineThicknesses.subarray(0, vertexCount));
        twgl.setAttribInfoBufferFromArray(gl, attribs.a_lineColor, this._lineColors.subarray(0, vertexCount * 4));

        twgl.setBuffersAndAttributes(gl, this._lineShader, this._lineBufferInfo);
        twgl.setUniforms(this._lineShader, {
            u_skin: this._texture,
            // Lines are queued in stage units regardless of the texture's resolution, so the shader scales them to
            // fill the whole texture rather than the stage's native size.
            u_stageSize: this._size
        });
        twgl.drawBufferInfo(gl, this._lineBufferInfo, gl.TRIANGLES, vertexCount);

        this._lineCount = 0;
    }

    /**
     * Build the buffers which hold queued lines.
     * @returns {twgl.BufferInfo} The new buffer info.
     * @private
     */
    _createLineBufferInfo () {
        return twgl.createBufferInfoFromArrays(this._renderer.gl, {
            a_position: {
                numComponents: 2,
                data: this._linePositions
            },
            a_penPoint: {
                numComponents: 4,
                data: this._linePenPoints
            },
            a_lineLength: {
                numComponents: 1,
                data: this._lineLengths
            },
            a_lineThickness: {
                numComponents: 1,
                data: this._lineThicknesses
            },
            a_lineColor: {
                numComponents: 4,
                data: this._lineColors
            }
        });
    }

    /**
     * Make sure the line buffers can hold at least the given number of lines.
     * @param {int} lineCount - the number of lines the buffers must hold.
     * @private
     */
    _ensureLineCapacity (lineCount) {
        if (lineCount <= this._lineCapacity) return;

        let capacity = Math.max(INITIAL_LINE_CAPACITY, this._lineCapacity * 2);
        while (capacity < lineCount) {
            capacity *= 2;
        }

        const vertexCount = capacity * VERTICES_PER_LINE;
        const positions = new Float32Array(vertexCount * 2);
        const penPoints = new Float32Array(vertexCount * 4);
        const lengths = new Float32Array(vertexCount);
        const thicknesses = new Float32Array(vertexCount);
        const colors = new Float32Array(vertexCount * 4);

        if (this._lineCount > 0) {
            const usedVertices = this._lineCount * VERTICES_PER_LINE;
            positions.set(this._linePositions.subarray(0, usedVertices * 2));
            penPoints.set(this._linePenPoints.subarray(0, usedVertices * 4));
            lengths.set(this._lineLengths.subarray(0, usedVertices));
            thicknesses.set(this._lineThicknesses.subarray(0, usedVertices));
            colors.set(this._lineColors.subarray(0, usedVertices * 4));
        }

        this._linePositions = positions;
        this._linePenPoints = penPoints;
        this._lineLengths = lengths;
        this._lineThicknesses = thicknesses;
        this._lineColors = colors;
        this._lineCapacity = capacity;

        // The GL buffers are sized from the arrays, so they have to be rebuilt for the new ones.
        this._deleteLineBuffers();
    }

    /**
     * Delete the GL buffers which hold queued lines, if they have been created.
     * @private
     */
    _deleteLineBuffers () {
        if (!this._lineBufferInfo) return;

        const gl = this._renderer.gl;
        for (const attribName in this._lineBufferInfo.attribs) {
            gl.deleteBuffer(this._lineBufferInfo.attribs[attribName].buffer);
        }
        this._lineBufferInfo = null;
    }

    /**
     * Delete the GL buffers used for copying the pen layer between texture sizes, if they have been created.
     * @private
     */
    _deleteCopyBuffer () {
        if (!this._copyBufferInfo) return;

        const gl = this._renderer.gl;
        for (const attribName in this._copyBufferInfo.attribs) {
            gl.deleteBuffer(this._copyBufferInfo.attribs[attribName].buffer);
        }
        this._copyBufferInfo = null;
    }

    /**
     * Prepare to draw lines in the _lineOnBufferDrawRegionId region.
     */
    _enterDrawLineOnBuffer () {
        const gl = this._renderer.gl;

        twgl.bindFramebufferInfo(gl, this._framebuffer);

        gl.viewport(0, 0, this._textureSize[0], this._textureSize[1]);
    }

    /**
     * Return to a base state from _lineOnBufferDrawRegionId.
     */
    _exitDrawLineOnBuffer () {
        const gl = this._renderer.gl;

        twgl.bindFramebufferInfo(gl, null);
    }

    /**
     * Prepare to do things with this PenSkin's framebuffer
     */
    _enterUsePenBuffer () {
        twgl.bindFramebufferInfo(this._renderer.gl, this._framebuffer);
    }

    /**
     * Return to a base state
     */
    _exitUsePenBuffer () {
        twgl.bindFramebufferInfo(this._renderer.gl, null);
    }

    /**
     * React to a change in the renderer's native size.
     * @param {object} event - The change event.
     */
    onNativeSizeChanged (event) {
        this._setCanvasSize(event.newSize);
    }

    /**
     * Set the size of the pen layer in stage units.
     * @param {Array<int>} canvasSize - the new width and height for the layer.
     * @private
     */
    _setCanvasSize(canvasSize) {
        const [width,height] = canvasSize;

        this._size = canvasSize;
        this._rotationCenter[0] = width / 2;
        this._rotationCenter[1] = height / 2;

        this.updateTexture();
    }

    /**
     * Match this skin's texture to the resolution at which the pen layer is displayed, keeping the marks already on
     * the layer. The texture follows the renderer's canvas so that pen output is rasterized at display resolution
     * instead of being upscaled from the stage's native resolution. The renderer calls this when its canvas resizes.
     */
    updateTexture () {
        const gl = this._renderer.gl;
        const [scaleX, scaleY] = this.textureScale;
        const textureWidth = Math.round(this._size[0] * scaleX);
        const textureHeight = Math.round(this._size[1] * scaleY);

        if (this._textureSize && this._textureSize[0] === textureWidth && this._textureSize[1] === textureHeight) {
            return;
        }

        const previousTexture = this._texture;
        const previousFramebuffer = this._framebuffer;
        this._textureSize = [textureWidth, textureHeight];

        this._texture = twgl.createTexture(
            gl,
            {
                mag: gl.NEAREST,
                min: gl.NEAREST,
                wrap: gl.CLAMP_TO_EDGE,
                width: textureWidth,
                height: textureHeight
            }
        );

        // A new framebuffer is needed here: `resizeFramebufferInfo` keeps the texture it already has rather than
        // attaching the one passed to it.
        this._framebuffer = twgl.createFramebufferInfo(
            gl,
            [
                {
                    format: gl.RGBA,
                    attachment: this._texture
                }
            ],
            textureWidth,
            textureHeight
        );

        // Queued lines were laid out for the old texture and are dropped by the resize.
        this._lineCount = 0;

        this._renderer.enterDrawRegion(this._lineOnBufferDrawRegionId);
        twgl.bindFramebufferInfo(gl, this._framebuffer);
        gl.viewport(0, 0, textureWidth, textureHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (previousTexture) {
            this._copyTexture(previousTexture);

            if (previousFramebuffer) {
                gl.deleteFramebuffer(previousFramebuffer.framebuffer);
            }
            gl.deleteTexture(previousTexture);
        }

        this._silhouettePixels = new Uint8Array(Math.floor(textureWidth * textureHeight * 4));
        this._silhouetteImageData = new ImageData(textureWidth,textureHeight);

        this._silhouetteDirty = true;
    }

    /**
     * Draw one of this skin's previous textures over the current one, scaled to fill it. This keeps pen marks on the
     * layer when its resolution changes.
     * @param {WebGLTexture} sourceTexture - the texture to copy from.
     * @private
     */
    _copyTexture (sourceTexture) {
        const gl = this._renderer.gl;
        const program = this._renderer._shaderManager.getShader(ShaderManager.DRAW_MODE.default, 0);

        if (!this._copyBufferInfo) {
            this._copyBufferInfo = twgl.createBufferInfoFromArrays(gl, {
                a_position: {
                    numComponents: 2,
                    data: [
                        -0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
                        -0.5, 0.5, 0.5, -0.5, 0.5, 0.5
                    ]
                },
                a_texCoord: {
                    numComponents: 2,
                    data: [
                        0, 0, 1, 0, 0, 1,
                        0, 1, 1, 0, 1, 1
                    ]
                }
            });
        }

        gl.useProgram(program.program);
        twgl.setBuffersAndAttributes(gl, program, this._copyBufferInfo);
        twgl.setTextureParameters(gl, sourceTexture, {minMag: gl.LINEAR});
        twgl.setUniforms(program, {
            u_projectionMatrix: twgl.m4.scaling([2, 2, 1]),
            u_modelMatrix: twgl.m4.identity(),
            u_skin: sourceTexture
        });
        twgl.drawBufferInfo(gl, this._copyBufferInfo, gl.TRIANGLES);
    }

    /**
     * If there have been pen operations that have dirtied the canvas, update
     * now before someone wants to use our silhouette.
     */
    updateSilhouette () {
        if (this._silhouetteDirty) {
            this.flushLines();

            this._renderer.enterDrawRegion(this._usePenBufferDrawRegionId);
            // Sample the framebuffer's pixels into the silhouette instance
            const gl = this._renderer.gl;
            gl.readPixels(
                0, 0,
                this._textureSize[0], this._textureSize[1],
                gl.RGBA, gl.UNSIGNED_BYTE, this._silhouettePixels
            );

            this._silhouetteImageData.data.set(this._silhouettePixels);
            this._silhouette.update(this._silhouetteImageData, true /* isPremultiplied */);

            this._silhouetteDirty = false;
        }
    }
}

module.exports = PenSkin;
