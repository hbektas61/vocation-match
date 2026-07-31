async (page) => {
  const dir = '/Users/hamibektas/Documents/Codex/2026-07-23/claudeme-sistem-kurmak-istiyorum-cunku-bu/.claude/worktrees/pilot-hardening/.playwright-mcp';
  const shot = (n) => page.screenshot({ path: `${dir}/${n}.png`, scale: 'css', type: 'png' });
  const ids = async () => [...new Set(await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid]')).map((n) => n.getAttribute('data-testid'))))];
  const tap = async (id) => {
    const el = page.locator(`[data-testid="${id}"]`).first();
    await el.waitFor({ state: 'visible', timeout: 8000 });
    await el.click();
  };
  const type = async (id, v) => {
    const el = page.locator(`[data-testid="${id}"]`).first();
    await el.waitFor({ state: 'visible', timeout: 8000 });
    await el.click();
    await el.pressSequentially(v, { delay: 40 });
  };
  const trail = [];

  await shot('app-T-02');
  trail.push('T-02 ids: ' + (await ids()).filter((i) => /venue|destination/.test(i)).join(','));

  await type('destination-search', 'Alaç');
  await page.waitForTimeout(1200);
  await shot('app-T-03');
  trail.push('T-03 ids: ' + (await ids()).filter((i) => /result|option|row/.test(i)).slice(0, 8).join(','));

  const first = (await ids()).find((i) => /^destination-(result|option|hit)/.test(i));
  if (first) { await tap(first); await page.waitForTimeout(900); }
  await shot('app-T-05');
  trail.push('T-05 ids: ' + (await ids()).filter((i) => /venue|chip/.test(i)).slice(0, 10).join(','));

  const venueInput = (await ids()).find((i) => /^venue-search$|^venue-query$/.test(i));
  if (venueInput) { await type(venueInput, 'Before Sun'); await page.waitForTimeout(1200); }
  await shot('app-T-07');
  trail.push('T-07 ids: ' + (await ids()).filter((i) => /result|option/.test(i)).slice(0, 8).join(','));

  return trail.join('\n');
}
