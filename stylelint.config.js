// Stylelint config. Prettier owns formatting (via the prettier/prettier rule);
// Stylelint owns correctness/consistency rules. See AGENTS.md for the bar.
import standard from 'stylelint-config-standard';
import stylelintPrettier from 'stylelint-prettier';

export default {
  plugins: [stylelintPrettier],
  extends: [standard],
  rules: {
    // Delegate all formatting to Prettier so the two tools never disagree.
    'prettier/prettier': true,

    // Rules deliberately relaxed to match the existing stylesheet's intent
    // without churning it for no behavioral gain:

    // We order selectors by visual hierarchy, not specificity.
    'no-descending-specificity': null,

    // Class names use kebab-case with BEM-style --modifiers; keep as-is.
    'selector-class-pattern': null,

    // We keep explicit -webkit-/-moz- vendor prefixes for cross-browser support.
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,

    // color-mix() / light-dark() can trip the hex shorthand rule.
    'color-hex-length': null,

    // custom-properties are used heavily; long names are fine.
    'custom-property-pattern': null,

    // keyframes/animation names are written kebab-case already.
    'keyframes-name-pattern': null,

    // Inline comments for section notes are intentional.
    'no-invalid-position-at-import-rule': null,

    // Keep legacy color/alpha notation (rgba(), 0.1). Modern syntax
    // (rgb(r g b / 10%)) is less broadly supported and would churn every color.
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'alpha-value-notation': null,

    // Custom properties are grouped with blank lines by category on purpose
    // (colors, spacing, radius...) — readability over "no blank lines".
    'custom-property-empty-line-before': null,

    // Font family names (Monaco, Consolas) are proper nouns; currentColor is
    // the conventional camelCase keyword. Don't force lowercase.
    'value-keyword-case': null,

    // (max-width: 900px) is universally supported and more readable than the
    // modern range notation.
    'media-feature-range-notation': null,

    // Comments are placed intentionally for section notes.
    'comment-empty-line-before': null
  },
  ignoreFiles: [
    'src/bundles/**',
    'web-ext-artifacts/**',
    'coverage/**',
    'playwright-report/**',
    'node_modules/**'
  ]
};
