// oxlint JS plugin: colours and shadows belong in the tokens in src/index.css, which are defined for both themes.
// A literal in code looks right in whichever theme it was written against and wrong in the other.
const COLOUR = /(#[0-9a-fA-F]{3,8}\b|\brgba?\()/;
const MESSAGE = 'Use a design token from src/index.css (var(--color-…) / var(--shadow-…)) rather than a literal colour.';

export default {
  meta: { name: 'design-tokens' },
  rules: {
    'no-colour-literals': {
      meta: { type: 'problem', docs: { description: 'Disallow literal colours outside the design tokens' } },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value === 'string' && COLOUR.test(node.value)) context.report({ node, message: MESSAGE });
          },
          TemplateElement(node) {
            if (COLOUR.test(node.value.raw)) context.report({ node, message: MESSAGE });
          },
        };
      },
    },
  },
};
