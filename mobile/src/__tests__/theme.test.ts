/**
 * The palette, checked rather than described.
 *
 * Comments in `theme.ts` claim a contrast ratio next to almost every value.
 * Those claims rot the moment somebody nudges a hex, and a rotted claim is
 * worse than none — it is the reason a reviewer stops checking. So the ratios
 * are computed here from the actual tokens.
 *
 * The second half is about the brand colours specifically (the owner's
 * "rendevuu" trial, D-043): neither pink can carry body text on white, and
 * the gold end of the gradient cannot carry white at all — which is why the
 * navy does the reading and every label on the gradient is ink.
 */
import { color, gradient, palette, roomTone } from '../theme';

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (pair: string) => {
    const c = parseInt(pair, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(value.slice(0, 2));
  const g = channel(value.slice(2, 4));
  const b = channel(value.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const GROUND = '#12162E';

describe('the owner’s palette', () => {
  it('uses exactly the rendevuu hexes that were specified (D-043/D-044)', () => {
    // Not "about these colours". The owner gave the hexes; drifting off one
    // by a shade to win a contrast argument would answer a different brief.
    expect(palette.navy).toBe('#0F1B3D');
    expect(palette.inkDark).toBe('#1A1A2E');
    expect(palette.gold).toBe('#FBBF24');
    expect(palette.goldLight).toBe('#FCD34D');
    expect(palette.coral).toBe('#FB7185');
    expect(palette.pink).toBe('#EC4899');
    expect(palette.pinkLight).toBe('#F472B6');
    expect(gradient.primary).toEqual(['#FBBF24', '#FB7185', '#EC4899']);
    expect(gradient.primaryPressed).toEqual(['#FCD34D', '#FB7185', '#F472B6']);
  });

  it('has no lavender, sand, sea or ocean left anywhere in it', () => {
    const retired = [
      '#E1C4FF', '#7B4FA8', '#F3E9FF', '#9678BE', '#8A5FD6',
      '#E6CF9D', '#FAF2DF', '#176B7A', '#70C7D8', '#DDF3F7', '#F1FAFB', '#17343C',
    ];
    const inUse = Object.values(palette).map((v) => v.toUpperCase());
    for (const gone of retired) {
      expect(inUse).not.toContain(gone);
    }
  });

  it('puts the night navy under everything (D-044)', () => {
    expect(color.background).toBe('#12162E');
    expect(color.surface).toBe('#1C2242');
  });
});

describe('what the pinks are allowed to do at night', () => {
  it('the light pink reads as accent text on the ground', () => {
    expect(contrast(color.accentDeep, GROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it('the strong pink clears a control edge on the ground', () => {
    expect(contrast(palette.pink, GROUND)).toBeGreaterThanOrEqual(3);
  });

  it('never carries white text on the fill, and the gradient label is the dark ink', () => {
    expect(color.onAccent).toBe(palette.inkDark);
    expect(contrast(color.onAccent, color.accent)).toBeGreaterThanOrEqual(4.5);
    // The label must survive the gradient's WORST stop, not its average.
    for (const stop of gradient.primary) {
      expect(contrast(palette.inkDark, stop)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('text and edges against the ground they are used on', () => {
  it('reads at body-text contrast on the night ground', () => {
    expect(contrast(color.ink, GROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.inkMuted, GROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.ink, color.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('marks where a control starts at 3:1', () => {
    // WCAG 1.4.11. `rule` is exempt on purpose: it divides paragraphs and is
    // never the edge of anything you can operate.
    expect(contrast(color.border, GROUND)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the error colour readable both ways round', () => {
    expect(contrast(color.danger, GROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.onDanger, color.danger)).toBeGreaterThanOrEqual(4.5);
  });

  it('reads on a selected surface', () => {
    expect(contrast(color.ink, color.accentSoft)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the two rooms', () => {
  it('does not separate them by colour alone', () => {
    // Same reasoning as the badge and the ribbon: the word is first, the mark
    // is second, the fill is third. If both tones ever became solid, the fill
    // would be doing work nothing else backs up.
    expect(roomTone.HERE_NOW.solid).not.toBe(roomTone.UPCOMING.solid);
  });

  it('keeps both labels readable on their own fill', () => {
    expect(contrast(roomTone.HERE_NOW.text, roomTone.HERE_NOW.fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(roomTone.UPCOMING.text, roomTone.UPCOMING.fill)).toBeGreaterThanOrEqual(4.5);
  });
});
