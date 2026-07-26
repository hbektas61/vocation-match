/**
 * The palette, checked rather than described.
 *
 * Comments in `theme.ts` claim a contrast ratio next to almost every value.
 * Those claims rot the moment somebody nudges a hex, and a rotted claim is
 * worse than none — it is the reason a reviewer stops checking. So the ratios
 * are computed here from the actual tokens.
 *
 * The second half is about the brand colour specifically. `#E1C4FF` is 1.55:1
 * on white, which means it cannot be the only thing marking a control, a state
 * or a piece of text. Every rule below exists to stop it quietly becoming that.
 */
import { color, palette, roomTone } from '../theme';

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

const WHITE = '#FFFFFF';

describe('the owner’s palette', () => {
  it('uses exactly the lavender that was specified', () => {
    // Not "about this colour". The owner gave a hex; drifting off it by a
    // shade to win a contrast argument would be answering a different brief.
    expect(palette.lavender).toBe('#E1C4FF');
    expect(color.accent).toBe('#E1C4FF');
  });

  it('has no sand, sea or ocean left anywhere in it', () => {
    const retired = ['#E6CF9D', '#FAF2DF', '#176B7A', '#70C7D8', '#DDF3F7', '#F1FAFB', '#17343C'];
    const inUse = Object.values(palette).map((v) => v.toUpperCase());
    for (const gone of retired) {
      expect(inUse).not.toContain(gone);
    }
  });

  it('puts white under everything', () => {
    expect(color.background).toBe(WHITE);
    expect(color.surface).toBe(WHITE);
  });
});

describe('what the lavender is allowed to do', () => {
  it('is not strong enough to be a boundary on its own, and the file says so', () => {
    // This is the fact the whole palette is arranged around. If it ever stops
    // being true the arrangement can be simplified — but it will not, because
    // the hex is fixed.
    expect(contrast(palette.lavender, WHITE)).toBeLessThan(3);
  });

  it('has a darker sibling that can do the jobs it cannot', () => {
    // Body text, a control edge, and the focus ring all need 3:1 or better.
    expect(contrast(palette.lavenderDeep, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('never carries white text', () => {
    // Every place text sits on the brand fill resolves to ink, not white.
    expect(color.onAccent).toBe(palette.ink);
    expect(contrast(color.onAccent, color.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('text and edges against the ground they are used on', () => {
  it('reads at body-text contrast on white', () => {
    expect(contrast(color.ink, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.inkMuted, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('marks where a control starts at 3:1', () => {
    // WCAG 1.4.11. `rule` is exempt on purpose: it divides paragraphs and is
    // never the edge of anything you can operate.
    expect(contrast(color.border, WHITE)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the error colour readable both ways round', () => {
    expect(contrast(color.danger, WHITE)).toBeGreaterThanOrEqual(4.5);
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
