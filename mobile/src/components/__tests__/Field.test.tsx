/**
 * The one input every screen uses.
 *
 * Three of these are regressions waiting to happen rather than features: a
 * wrapper that swallows the `onFocus` you passed it, a focus state that is one
 * low-contrast colour and nothing else, and text top-aligned in a box that is
 * taller than the text. All three were real, and all three are invisible to a
 * test that only checks the field renders.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { Field } from '../ui';
import { color } from '../../theme';

/** Style props arrive as arrays with nulls in them; this is the resolved truth. */
function flatten(style: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') Object.assign(out, node);
  };
  walk(style);
  return out;
}

const shellOf = (testID: string) => flatten(screen.getByTestId(`${testID}-box`).props.style);

describe('focus', () => {
  it('takes the exact border colour the owner asked for', () => {
    render(<Field label="Name" testID="f" />);

    fireEvent(screen.getByTestId('f'), 'focus');

    expect(shellOf('f').borderColor).toBe('#E1C4FF');
  });

  it('does not rely on that colour alone, because it is 1.55:1 on white', () => {
    render(<Field label="Name" testID="f" />);
    const resting = shellOf('f');

    fireEvent(screen.getByTestId('f'), 'focus');
    const focused = shellOf('f');

    // The weight is the companion cue. The fill and the outer ring were tried
    // and the owner asked for them to go — the border is the whole signal now,
    // so its change in weight is what has to survive for someone the hue does
    // not register for.
    expect(focused.borderWidth).toBeGreaterThan(Number(resting.borderWidth));
    expect(focused.backgroundColor).toBe(resting.backgroundColor);
  });

  it('goes back to a neutral edge on blur', () => {
    render(<Field label="Name" testID="f" />);

    fireEvent(screen.getByTestId('f'), 'focus');
    fireEvent(screen.getByTestId('f'), 'blur');

    expect(shellOf('f').borderColor).toBe(color.border);
  });

  it('still calls the handlers the caller passed', () => {
    // The wrapper needs these for its own state, and the easy version of that
    // is to take them and never pass them on.
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    render(<Field label="Name" testID="f" onFocus={onFocus} onBlur={onBlur} />);

    fireEvent(screen.getByTestId('f'), 'focus');
    fireEvent(screen.getByTestId('f'), 'blur');

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('keeps the error edge distinguishable from the focus edge', () => {
    render(<Field label="Name" invalid testID="f" />);

    expect(shellOf('f').borderColor).toBe(color.danger);
  });
});

describe('where the text sits', () => {
  it('centres a single line vertically without moving it horizontally', () => {
    render(<Field label="Name" testID="f" />);
    const input = flatten(screen.getByTestId('f').props.style);

    // The defect was text pressed against the top of a 44pt box. The fix is
    // vertical only — nothing here may centre the text across the field.
    expect(input.textAlignVertical).toBe('center');
    expect(input.includeFontPadding).toBe(false);
    expect(input.textAlign).toBeUndefined();
  });

  it('lets a composer start at the top and grow', () => {
    render(<Field label="About" multiline testID="f" />);

    // A paragraph floating in the vertical middle of a grown box is the
    // opposite defect, and applying one fix everywhere would cause it.
    expect(flatten(screen.getByTestId('f').props.style).textAlignVertical).toBe('top');
  });

  it('does not drop a style the caller passed', () => {
    render(<Field label="Name" testID="f" style={{ letterSpacing: 4 }} />);

    expect(flatten(screen.getByTestId('f').props.style).letterSpacing).toBe(4);
  });
});

describe('extras', () => {
  it('renders a prefix inside the box, before the text', () => {
    render(<Field label="Phone" testID="f" prefix={<Text>+90</Text>} />);

    expect(screen.getByText('+90')).toBeTruthy();
  });

  it('keeps the accessible name when the printed label is hidden', () => {
    render(<Field label="Name" hideLabel testID="f" />);

    expect(screen.queryByText('Name')).toBeNull();
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });
});
