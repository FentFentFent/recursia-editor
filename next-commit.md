

Updated logo to point to https://fentfentfent.github.io/recursia-editor/ when clicked.


Update modules category to have a "Export reporter block ()" block to make exporting reporters easier.

Made sure warning for cloud variables is accurate, cloud variables are not supported at the moment.

Updated the primary color in dark-mode for module blocks, they accidentally shared the same dark-red as the custom blocks category. Fixed to be a dark purple primary color.

# Next commit log — GUI dark color mode

Rough work log for the next commit. Feature: selecting **Settings → Color Mode → Dark** now restyles the whole GUI, not just the block workspace.

## What the color mode did before

`colorMode` (default / dark / high-contrast) was only wired into the blocks half of the editor: `containers/blocks.jsx` builds `new ScratchBlocks.Theme(colorMode, getColorsForMode(colorMode))`, recolors extension categories, and passes `blocksMediaFolder`. Monitors read it too. The GUI chrome (menu bar, tabs, sprite/stage panes, modals, paint editor, sound editor) kept the light palette.

Reason: the chrome's palette was compile-time. `src/css/colors.css` defined `$ui-primary`-style variables that `postcss-simple-vars` inlined into every CSS module, and nothing put the color mode on the DOM. A runtime switch had nothing to switch.

## Approach

Turn the palette into real CSS custom properties and set the color mode on the document root, then let CSS modules read the variables at runtime.

### Palette

- `packages/scratch-gui/src/css/colors.css`: all 42 color variables are now custom properties on `:root` (light values), with overrides under `:root[data-color-mode='dark']`.
- New variables introduced during the conversion:
  - `--ui-surface` — the "white" that used to be written as `background: $ui-white` / `background: white`. Kept separate from `--ui-white` (which stays white because it is used for text and borders on colored buttons, e.g. the menu bar).
  - `--ui-shadow` — shadows and glows (`box-shadow`, `filter: drop-shadow`). Dark mode uses a stronger black; `--ui-black-transparent` would have become a white glow.
  - `--ui-focus-outline` — keyboard focus ring (`$ui-black` was used for `outline` only). White in dark mode.
  - `--ui-gray`, `--ui-blue-10percent`, `--ui-blue-25percent` — lifted out of `telemetry-modal.css` where they were local `$` variables, so that modal follows the mode too.
  - `:root[data-color-mode='dark']` also sets a `background-color` so the page never shows white behind/around the app.
- Dark values: neutral surfaces at `hsl(225, 18%, 11/14/17/19%)`, text `hsl(220, 15%, 85%)`, borders as white at 15%, darker modal overlays, dark alert/extensions tints.

### Wiring

- `packages/scratch-gui/src/components/gui/gui.jsx`: new `useEffect` sets `document.documentElement.setAttribute('data-color-mode', colorMode)` and removes it on unmount. It has to be the document root (not the GUI element) because menus/modals render in portals on `document.body`.
- `packages/scratch-gui/src/lib/settings/color-mode/persistence.js`: `DARK_MODE` added to `isValidColorMode`. Before this the settings menu offered Dark, but `persistColorMode` threw (`Invalid color mode: dark`) and the choice was dropped on reload; the comment there still said "Dark mode isn't enabled yet".

### CSS conversion (mechanical, 70 files)

Every color reference in the GUI's CSS modules became `var(--…)` (`$ui-*`, `$text-*`, `$motion-*`, `$looks-*`, `$red-*`, `$sound-*`, `$control-*`, `$data-*`, `$pen-*`, `$error-*`, `$extensions-*`, `$membership-*`, `$drop-*`). Rules used:

- `background` / `background-color` + `$ui-white` → `var(--ui-surface)`
- other `$ui-white` (text, borders) → `var(--ui-white)`
- `box-shadow` / `filter` + `$ui-black-transparent(-10)` → `var(--ui-shadow)`
- `outline` + `$ui-black` → `var(--ui-focus-outline)`
- literal `background: white` / `#fff` → `var(--ui-surface)` (14 files)
- `@import ".../colors.css"` removed from every module except `components/gui/gui.css`, so the palette is emitted once instead of 70 times.

Non-color variables (`$space`, `$grid-unit`, `$z-index-*`, `$menu-bar-height`, …) still go through `postcss-simple-vars` and were left alone.

### Hand fixes needed after the conversion

- `components/forms/input.css` — `.input-form` had no background of its own (it relied on the browser default white), so every text field in the GUI stayed white with light text. Added `background-color: var(--ui-surface)`.
- `components/sprite-info/sprite-info.css` — dark background/color for the rotation `<select>`; dark-mode `invert(1) hue-rotate(180deg)` on `.icon` (x/y icons are drawn in the light theme's text color).
- `components/stage-header/stage-header.css` — the fullscreen header overlay was a hardcoded `rgb(232, 237, 241)` → `var(--ui-primary)`; same icon filter for `.stage-button-icon` (fullscreen/large/small/thumbnail).
- `components/sound-editor/sound-editor.css` — icon filter for `.tool-button img` (copy/paste/delete/trim etc.).
- `components/library-item/library-item.css` — icon filter for the Bluetooth/Internet requirement icons.
- `components/question/question.css` — icon filter for the "enter" submit button.
- `components/alerts/alert.css` — message text `#555` → `var(--text-primary)`.
- `components/asset-panel/selector.css` — bottom fade gradient gets a dark override (it faded to a hardcoded light blue).
- `components/cards/card.css` — tutorial step images (`#F9F9F9` / `#ddd`) get a dark override.
- `components/connection-modal/connection-modal.css` — signal-strength bars (`#DBDBDB`) get a dark override.
- `components/debug-modal/debug-modal.css` — active topic (`#D1FAEE`) gets a dark override.
- `components/telemetry-modal/telemetry-modal.css` — local `$ui-gray`/`$ui-blue-*` removed, now palette variables.

### Paint editor (separate package)

`@scratch/scratch-paint` is resolved from its `dist/` build, so the same conversion had to be done there.

- `packages/scratch-paint/src/css/colors.css`: palette as custom properties, prefixed `--paint-*`, light `:root` + `:root[data-color-mode='dark']` overrides (it inherits the attribute from the GUI because the DOM is shared).
- 14 CSS files converted from `$ui-pane-border` etc. to `var(--paint-…)`.
- New `--paint-ui-surface` for form fields/sliders/color pickers; `paper-canvas.css` background `#D9E3F2` → `var(--paint-ui-background-blue)`; color-picker borders `#ddd` → `var(--paint-ui-pane-border)`; text colors → `var(--paint-text-primary)`; `paint-editor.css` border `#e8edf1` → `var(--paint-form-border)`; `forms/input.css` gets `background-color: var(--paint-ui-surface)`.

**Note:** `packages/scratch-paint/dist` is gitignored. It was rebuilt with `npm run build` in that package. Anyone checking out this change needs to rebuild scratch-paint (or the GUI keeps the old paint CSS).

### Transparency checkerboard

The checkerboard behind the costume is not CSS: `helper/layer.js` draws it with Paper.js (`_makeBackgroundPaper`), so it kept its light colors after the mode switch. It now reads its colors from the palette too.

- New palette entries: `--paint-checker-base` (the "white" squares), `--paint-checker-square` (the tinted squares) and `--paint-workspace-bounds` (the solid area around the artboard). Light values are the old hardcoded `#fff` / `#D9E3F2` / `#ECF1F9`; dark values are `hsla(225, 18%, 17%)`, `hsla(260, 24%, 28%)` and `hsla(225, 18%, 12%)` — the squares are pulled toward the looks accent hue (260).
- `_cssColor(name, fallback)` in `helper/layer.js` reads a property off `document.documentElement`'s computed style, falling back to the light color when there is no DOM (tests).
- New `refreshBackgroundColors()` recolors the existing `vectorBackground` / `bitmapBackground` groups and the workspace bounds from the current palette.
- `containers/paper-canvas.jsx` observes `data-color-mode` on the document root (`MutationObserver`, disconnected on unmount) and calls `refreshBackgroundColors()`, so switching mode with the Costumes tab open redraws the checkerboard immediately instead of waiting for a tab/costume change.

## Verification done

- `npm start` in `packages/scratch-gui`: webpack compiles with no errors.
- Looked at the running editor in both modes:
  - Light: unchanged (blocks, workspace, chrome, sprite info, paint editor all look like the stock light theme).
  - Dark: menu bar, tabs, toolbox, workspace, sprite/stage panes, sprite info fields, backpack, settings menus, library modal, costume/paint editor, sound editor, monitor area.
- Switched Default → Dark → Default → Dark through Settings → Color Mode; the checkmark follows and the DOM attribute updates; the cookie persists the choice (`scratchtheme=dark`), so it survives a reload.
- Checkerboard: verified dark in the costume editor (both the artboard check and the workspace area around it when zoomed out), and verified that picking Original / Dark with the Costumes tab open redraws it in place, in both directions.
- `npx jest test/unit/util/color-modes.test.js test/unit/components/menu-bar.test.jsx` → 14/14 pass.
- `npm run build` in `packages/scratch-paint` → exit 0.
- No `$`-color variables left in GUI or paint CSS (only the palette file itself); CSS brace balance checked on every file.

## Not verified / follow-ups

- Not every modal, popover and prompt was opened in dark mode (connection modal, record modal, extension modal, custom-procedures modal, tutorial cards, feature callouts): they use the same palette and should follow, but they were not eyeballed.
- High Contrast mode was not re-checked; it only ever changed block colors, and the new `--ui-*` defaults are still the light ones for it.
- Icon treatment is a `filter` on the few monochrome icon sets that would otherwise be invisible. Icons that are multi-colored or white-on-accent were left alone. A proper pass would give the mono icons a `currentColor` variant instead.
- Browser-native scrollbars and `<select>` popups keep the OS/browser colors.

## Files touched

<!-- generated below -->
```
packages/scratch-gui/src/components/action-menu/action-menu.css
packages/scratch-gui/src/components/alerts/alert.css
packages/scratch-gui/src/components/alerts/inline-message.css
packages/scratch-gui/src/components/asset-panel/asset-panel.css
packages/scratch-gui/src/components/asset-panel/selector.css
packages/scratch-gui/src/components/audio-trimmer/audio-trimmer.css
packages/scratch-gui/src/components/backpack/backpack.css
packages/scratch-gui/src/components/blocks/blocks.css
packages/scratch-gui/src/components/browser-modal/browser-modal.css
packages/scratch-gui/src/components/cards/card.css
packages/scratch-gui/src/components/close-button/close-button.css
packages/scratch-gui/src/components/coming-soon/coming-soon.css
packages/scratch-gui/src/components/confirmation-prompt/confirmation-prompt.css
packages/scratch-gui/src/components/connection-modal/connection-modal.css
packages/scratch-gui/src/components/context-menu/context-menu.css
packages/scratch-gui/src/components/crash-message/crash-message.css
packages/scratch-gui/src/components/custom-procedures/custom-procedures.css
packages/scratch-gui/src/components/debug-modal/debug-modal.css
packages/scratch-gui/src/components/delete-button/delete-button.css
packages/scratch-gui/src/components/delete-confirmation-prompt/delete-confirmation-prompt.css
packages/scratch-gui/src/components/direction-picker/dial.css
packages/scratch-gui/src/components/divider/divider.css
packages/scratch-gui/src/components/drag-layer/drag-layer.css
packages/scratch-gui/src/components/extension-button/extension-button.css
packages/scratch-gui/src/components/feature-callout-popover/feature-callout-popover.css
packages/scratch-gui/src/components/filter/filter.css
packages/scratch-gui/src/components/forms/input.css
packages/scratch-gui/src/components/forms/label.css
packages/scratch-gui/src/components/green-flag/green-flag.css
packages/scratch-gui/src/components/gui/gui.css
packages/scratch-gui/src/components/gui/gui.jsx
packages/scratch-gui/src/components/icon-button/icon-button.css
packages/scratch-gui/src/components/language-selector/language-selector.css
packages/scratch-gui/src/components/library-item/library-item.css
packages/scratch-gui/src/components/library/library.css
packages/scratch-gui/src/components/loader/loader.css
packages/scratch-gui/src/components/loupe/loupe.css
packages/scratch-gui/src/components/menu-bar/account-menu.css
packages/scratch-gui/src/components/menu-bar/author-info.css
packages/scratch-gui/src/components/menu-bar/community-button.css
packages/scratch-gui/src/components/menu-bar/menu-bar.css
packages/scratch-gui/src/components/menu-bar/project-title-input.css
packages/scratch-gui/src/components/menu-bar/share-button.css
packages/scratch-gui/src/components/menu-bar/user-avatar.css
packages/scratch-gui/src/components/menu/menu.css
packages/scratch-gui/src/components/meter/meter.css
packages/scratch-gui/src/components/modal/modal.css
packages/scratch-gui/src/components/monitor/monitor.css
packages/scratch-gui/src/components/play-button/play-button.css
packages/scratch-gui/src/components/progress-ring/progress-ring.css
packages/scratch-gui/src/components/prompt/prompt.css
packages/scratch-gui/src/components/question/question.css
packages/scratch-gui/src/components/record-modal/record-modal.css
packages/scratch-gui/src/components/slider-prompt/slider-prompt.css
packages/scratch-gui/src/components/sound-editor/sound-editor.css
packages/scratch-gui/src/components/spinner/spinner.css
packages/scratch-gui/src/components/sprite-info/sprite-info.css
packages/scratch-gui/src/components/sprite-selector-item/sprite-selector-item.css
packages/scratch-gui/src/components/sprite-selector/sprite-selector.css
packages/scratch-gui/src/components/stage-header/stage-header.css
packages/scratch-gui/src/components/stage-selector/stage-selector.css
packages/scratch-gui/src/components/stage-wrapper/stage-wrapper.css
packages/scratch-gui/src/components/stage/stage.css
packages/scratch-gui/src/components/stop-all/stop-all.css
packages/scratch-gui/src/components/tag-button/tag-button.css
packages/scratch-gui/src/components/telemetry-modal/telemetry-modal.css
packages/scratch-gui/src/components/toggle-buttons/toggle-buttons.css
packages/scratch-gui/src/components/turbo-mode/turbo-mode.css
packages/scratch-gui/src/components/waveform/waveform.css
packages/scratch-gui/src/components/webgl-modal/webgl-modal.css
packages/scratch-gui/src/css/colors.css
packages/scratch-gui/src/lib/settings/color-mode/persistence.js
packages/scratch-paint/src/components/button/button.css
packages/scratch-paint/src/components/color-button/color-button.css
packages/scratch-paint/src/components/color-picker/color-picker.css
packages/scratch-paint/src/components/coming-soon/coming-soon.css
packages/scratch-paint/src/components/dropdown/dropdown.css
packages/scratch-paint/src/components/fixed-tools/fixed-tools.css
packages/scratch-paint/src/components/font-dropdown/font-dropdown.css
packages/scratch-paint/src/components/forms/input.css
packages/scratch-paint/src/components/forms/slider.css
packages/scratch-paint/src/components/mode-tools/mode-tools.css
packages/scratch-paint/src/components/paint-editor/paint-editor.css
packages/scratch-paint/src/components/tool-select-base/tool-select-base.css
packages/scratch-paint/src/containers/paper-canvas.css
packages/scratch-paint/src/css/colors.css
```

