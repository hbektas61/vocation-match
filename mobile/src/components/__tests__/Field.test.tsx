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
  it('draws focus in the brand coral on a white interior (owner, 2026-08-05)', () => {
    // The dark-ringed, wash-filled focus box read as a different control from
    // every other input on the screen; the owner asked for a coral ring and a
    // white interior. Coral is 2.99:1 on white, which is why the next test —
    // weight carrying the state alongside colour — is the accepted trade.
    render(<Field label="Name" testID="f" />);

    fireEvent(screen.getByTestId('f'), 'focus');

    expect(shellOf('f').borderColor).toBe(color.accent);
    expect(shellOf('f').backgroundColor).toBe(color.surface);
  });

  it('does not rely on that colour alone', () => {
    render(<Field label="Name" testID="f" />);
    const resting = shellOf('f');

    fireEvent(screen.getByTestId('f'), 'focus');
    const focused = shellOf('f');

    // Coral alone clears neither 3:1 on white nor everyone's eyes: the border
    // thickening from 1.5 to 2.5 is the cue that has to survive the colour.
    expect(focused.borderWidth).toBeGreaterThan(Number(resting.borderWidth));
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
