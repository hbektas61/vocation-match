/**
 * The palette, checked rather than described.
 *
 * Comments in `theme.ts` claim a contrast ratio next to almost every value.
 * Those claims rot the moment somebody nudges a hex, and a rotted claim is
 * worse than none — it is the reason a reviewer stops checking. So the ratios
 * are computed here from the actual tokens.
 *
 * D-058 moved the ground from night navy to warm cream, which inverts every
 * one of those questions: what a colour may do on a light surface is not what
 * it could do on a dark one. The second half is about the coral specifically.
 * It cannot carry small text on white (2.99:1) and cannot carry white text at
 * all (2.99:1), so the brand does its reading in a darker sibling and every
 * label on a coral fill is navy.
 */
import { color, elevation, gradient, palette, radius, roomTone, tokens } from '../theme';

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

/**
 * The ground every light surface is measured against. It became white on
 * 2026-08-05 (owner: "coral and white are our main colours"), so ground and
 * surface are now the same value — which is why the card test below stopped
 * asking them to differ and started asking for an edge and a lift instead.
 */
const GROUND = '#FFFFFF';
const SURFACE = '#FFFFFF';

describe('the D-058 palette', () => {
  it('uses exactly the hexes the brief specified', () => {
    // Not "about these colours". The brief gave the hexes; drifting off one by
    // a shade to win a contrast argument would answer a different brief. The
    // B revision (owner, 2026-08-05): the ground moved from blush to paper
    // and the coral wash to fog — the editorial-lean pass. The pins below
    // hold the *current* palette, not the original brief's.
    // one value that had to move is `text.secondary`, and it moved by being
    // kept as `text.tertiary` rather than by being changed — see below.
    expect(tokens.background.primary).toBe('#FFFFFF');
    expect(tokens.surface.primary).toBe('#FFFFFF');
    expect(tokens.text.primary).toBe('#101A3A');
    expect(tokens.text.tertiary).toBe('#7C8194');
    expect(tokens.border.subtle).toBe('#E8EBEF');
    expect(tokens.brand.primary).toBe('#FF5E62');
    expect(tokens.brand.primaryPressed).toBe('#E94F54');
    // Warmed towards the coral on 2026-08-06 (owner: the tints read pink).
    expect(tokens.brand.soft).toBe('#FFE0D4');
    expect(tokens.brand.wash).toBe('#FFEDE4');
    expect(tokens.brand.navy).toBe('#101A3A');
    expect(tokens.premium.gold).toBe('#D4AF37');
    expect(tokens.success.base).toBe('#22C55E');
  });

  it('has no night ground, sunset gradient or rendevuu pink left in it', () => {
    const retired = [
      // D-046's sunset ground and its stops.
      '#241E49', '#3A2B63', '#8A4A6F', '#D97B52',
      // D-044's night surfaces.
      '#2A2350', '#3A3168', '#0F1B3D', '#321F45', '#2A3052',
      // D-043's pinks, golds and night inks.
      '#EC4899', '#F472B6', '#FBBF24', '#FCD34D', '#FB7185', '#1A1A2E',
      '#F5F6FA', '#A3A9C9', '#F87171', '#3B1F2B', '#34D399',
    ];
    const inUse = [
      ...Object.values(palette),
      ...Object.values(tokens).flatMap((group) => Object.values(group)),
    ].map((v) => String(v).toUpperCase());
    for (const gone of retired) {
      expect(inUse).not.toContain(gone);
    }
  });

  it('puts white under everything, and tells a card from it by edge and lift', () => {
    expect(color.background).toBe('#FFFFFF');
    expect(color.surface).toBe('#FFFFFF');
    // With the ground and the card the same white, the two things that say
    // "this is a card" are the only two left — so both have to be real.
    expect(elevation.card.elevation).toBeGreaterThan(0);
    expect(elevation.card.shadowOpacity).toBeGreaterThan(0);
    expect(color.rule).not.toBe(color.surface);
    // And the edge has to be visible on it, not merely different.
    expect(contrast(color.rule, SURFACE)).toBeGreaterThan(1.1);
  });

  it('keeps a warm off-white for the one job pure white does badly', () => {
    // On the navy ribbon, pure white glares; the retired ground is exactly
    // the right value there, so it stayed in the palette under its own name.
    expect(palette.paper).toBe('#FAFAF7');
    expect(tokens.text.onInverse).toBe('#FAFAF7');
  });

  it('keeps the card radius inside the 18–22 the brief asked for', () => {
    expect(radius.lg).toBeGreaterThanOrEqual(18);
    expect(radius.lg).toBeLessThanOrEqual(22);
  });
});

describe('what the coral is allowed to do on a light ground', () => {
  it('never carries small text on white, so the brand reads in its dark sibling', () => {
    // The measurement that decides the whole system: 2.99:1.
    expect(contrast(tokens.brand.primary, SURFACE)).toBeLessThan(4.5);
    // …which is why anything coral-and-readable is this one instead.
    expect(contrast(color.accentDeep, SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.accentDeep, GROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.accentDeep, color.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.accentDeep, color.accentWash)).toBeGreaterThanOrEqual(4.5);
  });

  it('never carries white on the fill, and the label on a coral CTA is navy', () => {
    expect(contrast('#FFFFFF', tokens.brand.primary)).toBeLessThan(3);
    // Owner decision (2026-08-05): white on coral, matching the reference
    // system. Below AA for body text — the compensating rule is that coral
    // only ever carries 15pt-semibold-or-larger labels and glyphs.
    expect(color.onAccent).toBe('#FFFFFF');
    expect(contrast(color.onAccent, color.accent)).toBeGreaterThanOrEqual(2.5);
    // The pressed fill is a state of the same button, so its label must survive too.
    expect(contrast(color.onAccent, tokens.brand.primaryPressed)).toBeGreaterThanOrEqual(2.5);
  });

  it('opens the match moment on a stop white display type can actually sit on', () => {
    // The one full-colour screen. Display type is large text, so 3:1 — and the
    // brand coral would give 2.99, which is why the gradient starts deeper.
    expect(contrast('#FFFFFF', gradient.match[0])).toBeGreaterThanOrEqual(3);
    // Its pale end carries the supporting sentence, in navy, at body contrast.
    expect(contrast(color.ink, gradient.match[gradient.match.length - 1])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('text and edges against the surfaces they are used on', () => {
  it('reads at body-text contrast on both the ground and a card', () => {
    for (const ground of [GROUND, SURFACE]) {
      expect(contrast(color.ink, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color.inkMuted, ground)).toBeGreaterThanOrEqual(4.5);
    }
    // The sunken step inside a card is a third surface and gets asked too.
    expect(contrast(color.inkMuted, color.veil)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the brief’s secondary grey only where WCAG does not ask for 4.5', () => {
    // #7C8194 measures 3.87:1 on white. It is still in the system — as the
    // placeholder and disabled colour, which is exempt — but nothing anybody
    // has to read is drawn in it.
    expect(contrast(tokens.text.tertiary, SURFACE)).toBeLessThan(4.5);
    expect(color.inkMuted).not.toBe(tokens.text.tertiary);
  });

  it('marks where a control starts at 3:1', () => {
    // WCAG 1.4.11. `rule` is exempt on purpose: it divides content and edges
    // cards, and is never the boundary of anything you can operate.
    expect(contrast(color.border, SURFACE)).toBeGreaterThanOrEqual(3);
    expect(contrast(color.border, GROUND)).toBeGreaterThanOrEqual(3);
  });

  it('draws focus in something visible rather than in the coral', () => {
    expect(contrast(color.focus, SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the error colour readable both ways round, and apart from the brand', () => {
    expect(contrast(color.danger, GROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.danger, color.dangerSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.onDanger, color.danger)).toBeGreaterThanOrEqual(4.5);
    // A destructive action must not be the same red as a like.
    expect(color.danger).not.toBe(color.accent);
    expect(color.danger).not.toBe(color.accentDeep);
  });

  it('reads on every tinted surface the system offers', () => {
    expect(contrast(color.ink, color.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.success, color.successSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.premium, color.premiumSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.ink, color.infoSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it('reads on the one deep surface: the context ribbon', () => {
    expect(contrast(color.onInverse, color.inverse)).toBeGreaterThanOrEqual(4.5);
    // The coral mark on it is a mark, not text, so 3:1 is the bar it has to clear.
    expect(contrast(color.accent, color.inverse)).toBeGreaterThanOrEqual(3);
  });

  it('does not let the gold or the green carry their own word', () => {
    // Both are marks. The text beside them is the dark sibling, and this is
    // the assertion that stops somebody "simplifying" that away.
    expect(contrast(color.premiumMark, SURFACE)).toBeLessThan(4.5);
    expect(contrast(color.successMark, SURFACE)).toBeLessThan(4.5);
    expect(contrast(color.premium, SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.success, SURFACE)).toBeGreaterThanOrEqual(4.5);
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
