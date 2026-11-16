import { prettierConfigScratch } from 'eslint-config-scratch'

export default {
  ...prettierConfigScratch.recommended,
  // Recursia-authored style modules use tab indentation; see STYLE-GUIDE.md.
  overrides: [{ files: ['src/style/**'], options: { useTabs: true } }],
}
