/* global render, ImageData */
const {chromium} = require('playwright-chromium');
const test = require('tap').test;
const path = require('path');

const indexHTML = path.resolve(__dirname, 'index.html');

// immediately invoked async function to let us wait for each test to finish before starting the next.
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(`file://${indexHTML}`);

    await test('SVG skin size set properly', async t => {
        t.plan(1);
        const skinSize = await page.evaluate(async () => {
            const skinID = await render.createSVGSkin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 100"></svg>`);
            return render.getSkinSize(skinID);
        });
        t.same(skinSize, [50, 100]);
    });

    await test('Bitmap skin size set correctly', async t => {
        t.plan(1);
        const skinSize = await page.evaluate(() => {
            // Bitmap costumes are double resolution, so double the ImageData size
            const skinID = render.createBitmapSkin(new ImageData(100, 200), 2);
            return render.getSkinSize(skinID);
        });
        t.same(skinSize, [50, 100]);
    });

    await test('Pen skin size set correctly', async t => {
        t.plan(1);
        const skinSize = await page.evaluate(() => {
            const skinID = render.createPenSkin();
            return render.getSkinSize(skinID);
        });
        const nativeSize = await page.evaluate(() => render.getNativeSize());
        t.same(skinSize, nativeSize);
    });

    await test('Pen skin honors the high quality pen setting', async t => {
        t.plan(3);
        const result = await page.evaluate(() => {
            render.setHighQualityPen(true);
            const skinID = render.createPenSkin();
            const skinSize = render.getSkinSize(skinID);
            const enabled = render.getHighQualityPen();
            render.setHighQualityPen(false);
            return {skinSize, enabled};
        });
        const nativeSize = await page.evaluate(() => render.getNativeSize());
        t.same(result.skinSize, nativeSize, 'a high quality pen layer still covers the stage');
        t.equal(result.enabled, true, 'the renderer reports the setting as enabled');
        t.equal(await page.evaluate(() => render.getHighQualityPen()), false, 'the setting can be turned back off');
    });

    await test('High quality pen layer has more texels for the same marks and stamps', async t => {
        t.plan(2);
        const inked = await page.evaluate(() => {
            const countInkedTexels = skinID => {
                const skin = render._allSkins[skinID];
                const gl = render.gl;
                const [width, height] = skin._textureSize;
                const pixels = new Uint8Array(width * height * 4);
                gl.bindFramebuffer(gl.FRAMEBUFFER, skin._framebuffer.framebuffer);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                let count = 0;
                for (let i = 3; i < pixels.length; i += 4) {
                    if (pixels[i] > 0) count++;
                }
                return count;
            };
            const measure = (highQuality, draw) => {
                render.setHighQualityPen(highQuality);
                const penSkinID = render.createPenSkin();
                draw(penSkinID);
                render.draw();
                return countInkedTexels(penSkinID);
            };

            const stampData = new ImageData(50, 50);
            for (let i = 0; i < stampData.data.length; i += 4) {
                stampData.data[i] = 255;
                stampData.data[i + 3] = 255;
            }
            const stampDrawableID = render.createDrawable('sprite');
            render.updateDrawableProperties(stampDrawableID, {skinId: render.createBitmapSkin(stampData, 1)});

            const inked = {
                lineLow: measure(false, penSkinID =>
                    render.penLine(penSkinID, {color4f: [0, 0, 0, 1], diameter: 4}, -100, -100, 100, 100)),
                lineHigh: measure(true, penSkinID =>
                    render.penLine(penSkinID, {color4f: [0, 0, 0, 1], diameter: 4}, -100, -100, 100, 100)),
                stampLow: measure(false, penSkinID => render.penStamp(penSkinID, stampDrawableID)),
                stampHigh: measure(true, penSkinID => render.penStamp(penSkinID, stampDrawableID))
            };

            render.setHighQualityPen(false);
            render.destroyDrawable(stampDrawableID, 'sprite');
            return inked;
        });

        const aboutFourTimes = (low, high) => high > low * 3 && high < low * 5;
        t.ok(
            aboutFourTimes(inked.lineLow, inked.lineHigh),
            `the same line covers about four times as many texels at high quality ` +
                `(${inked.lineLow} at default quality, ${inked.lineHigh} at high quality)`
        );
        t.ok(
            aboutFourTimes(inked.stampLow, inked.stampHigh),
            `the same stamp covers about four times as many texels at high quality ` +
                `(${inked.stampLow} at default quality, ${inked.stampHigh} at high quality)`
        );
    });

    await test('Pen layer matches the canvas resolution and keeps its marks when resized', async t => {
        t.plan(4);
        const result = await page.evaluate(() => {
            const measureInk = skinID => {
                const skin = render._allSkins[skinID];
                const gl = render.gl;
                const [width, height] = skin._textureSize;
                const pixels = new Uint8Array(width * height * 4);
                gl.bindFramebuffer(gl.FRAMEBUFFER, skin._framebuffer.framebuffer);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                let count = 0;
                let sumX = 0;
                let sumY = 0;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        if (pixels[(((y * width) + x) * 4) + 3] > 0) {
                            count++;
                            sumX += x;
                            sumY += y;
                        }
                    }
                }
                return {
                    count,
                    centerX: count ? sumX / count / width : 0,
                    centerY: count ? sumY / count / height : 0
                };
            };

            render.resize(960, 720);
            const penSkinID = render.createPenSkin();
            const skin = render._allSkins[penSkinID];
            const textureSize = skin._textureSize.slice();

            // Draw only in the lower left to make an accidental flip visible.
            render.penLine(penSkinID, {color4f: [0, 0, 0, 1], diameter: 4}, -200, -150, -100, -50);
            render.draw();
            const inkBefore = measureInk(penSkinID);

            render.resize(640, 480);
            const resizedTextureSize = skin._textureSize.slice();
            const inkAfter = measureInk(penSkinID);

            render.resize(480, 360);
            return {textureSize, resizedTextureSize, inkBefore, inkAfter};
        });

        t.same(result.textureSize, [960, 720], 'the pen layer is rendered at the canvas resolution');
        t.same(result.resizedTextureSize, [640, 480], 'the pen layer follows canvas resizes');
        t.ok(
            result.inkBefore.count > 0 && result.inkAfter.count > 0,
            `marks survive a resize (${result.inkBefore.count} texels before, ${result.inkAfter.count} after)`
        );
        t.ok(
            Math.abs(result.inkBefore.centerX - result.inkAfter.centerX) < 0.02 &&
                Math.abs(result.inkBefore.centerY - result.inkAfter.centerY) < 0.02,
            `marks stay in place across a resize (center ` +
                `${result.inkBefore.centerX.toFixed(3)}, ${result.inkBefore.centerY.toFixed(3)} before; ` +
                `${result.inkAfter.centerX.toFixed(3)}, ${result.inkAfter.centerY.toFixed(3)} after)`
        );
    });

    await test('Text bubble skin size set correctly', async t => {
        t.plan(1);
        const skinSize = await page.evaluate(() => {
            const skinID = render.createTextSkin('say', 'Hello', false);
            return render.getSkinSize(skinID);
        });
        // The subtleties in font rendering may cause the size of the text bubble to vary, so just make sure it's not 0
        t.notSame(skinSize, [0, 0]);
    });

    // close the browser window we used
    await browser.close();
})().catch(err => {
    // Handle promise rejections by exiting with a nonzero code to ensure that tests don't erroneously pass
     
    console.error(err.message);
    process.exit(1);
});
