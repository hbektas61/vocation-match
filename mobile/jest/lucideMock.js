/**
 * Lucide's real bundle re-exports ~1500 icons and cost each jest worker ~40s
 * to parse — and a self-referential Proxy version of this mock overflowed
 * tsc's inference. So: a plain factory, a concrete default, no cycles. Any
 * named or default import resolves to a tiny component carrying the props.
 */
const React = require('react');
const { View } = require('react-native');

function makeIcon(name) {
  const Icon = (props) => React.createElement(View, { ...props, accessibilityRole: 'image' });
  Icon.displayName = String(name);
  return Icon;
}

const base = { __esModule: true, default: makeIcon('LucideIcon') };

module.exports = new Proxy(base, {
  get: (target, name) => (name in target ? target[name] : makeIcon(name)),
});
