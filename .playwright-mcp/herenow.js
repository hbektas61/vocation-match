async (page) => {
  const dir = '/Users/hamibektas/Documents/Codex/2026-07-23/claudeme-sistem-kurmak-istiyorum-cunku-bu/.claude/worktrees/pilot-hardening/.playwright-mcp';
  const shot = (n) => page.screenshot({ path: `${dir}/${n}.png`, scale: 'css', type: 'png' });
  const ids = async () => [...new Set(await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid]')).map((n) => n.getAttribute('data-testid'))))];
  const tap = async (id) => { const e = page.locator(`[data-testid="${id}"]`).first(); await e.waitFor({state:'visible',timeout:10000}); await e.click(); };
  const type = async (id, v) => { const e = page.locator(`[data-testid="${id}"]`).first(); await e.waitFor({state:'visible',timeout:10000}); await e.click(); await e.pressSequentially(v,{delay:25}); };
  const out = [];

  await page.goto('http://localhost:8095');
  await page.waitForTimeout(3200);
  const tr = page.locator('[data-testid="welcome-language-tr"]').first();
  if (await tr.count()) await tr.click();
  await tap('welcome-phone');
  await tap('onboarding-continue');
  await type('auth-phone', '5551110002');
  await tap('onboarding-continue');
  await type('auth-otp', '123456');
  await tap('onboarding-continue');
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(300);
    const now = await ids();
    if (now.includes('screen-hotel')) break;
    if (now.includes('profile-name')) {
      const v = await page.evaluate(() => document.querySelector('[data-testid="profile-name"]').value);
      if (!v) await type('profile-name', 'Deniz');
    } else if (now.includes('profile-birthdate')) {
      const v = await page.evaluate(() => document.querySelector('[data-testid="profile-birthdate"]').value);
      if (!v) await type('profile-birthdate', '01031994');
    } else {
      const pick = now.find((id) => /^(gender-(?!.*self-describe)|orientation-|show-me-|interest-)/.test(id) && id !== 'show-gender');
      if (pick) await page.locator(`[data-testid="${pick}"]`).first().click();
    }
    if (now.includes('onboarding-photo-skip')) { await tap('onboarding-photo-skip'); continue; }
    const cont = page.locator('[data-testid="onboarding-continue"]').first();
    if (await cont.count()) await cont.click();
  }

  // Pick a Google venue so Oteldeyim has something to check against.
  await tap('venue-open-picker');
  await type('destination-search', 'Alaç');
  await page.waitForTimeout(1100);
  await tap('destination-option-0');
  await page.waitForTimeout(900);
  await type('venue-search', 'Before Sun');
  await page.waitForTimeout(1100);
  await tap('venue-option-0');
  await page.waitForTimeout(1400);

  await tap('open-here-now');
  await page.waitForTimeout(900);
  await shot('app-T-16');
  out.push('T-16 :: ' + (await page.locator('body').innerText()).replace(/\n/g,' | ').slice(0,230));
  out.push('  ids: ' + (await ids()).filter((i) => !/^tab-/.test(i)).slice(0,16).join(','));

  for (const [sim, name] of [['simulate-far','app-T-20'], ['simulate-near','app-T-21']]) {
    if ((await ids()).includes(sim)) {
      await tap(sim);
      await page.waitForTimeout(1100);
      await shot(name);
      out.push(name + ' :: ' + (await page.locator('body').innerText()).replace(/\n/g,' | ').slice(0,200));
    } else out.push(name + ' :: ' + sim + ' not present');
  }
  return out.join('\n');
}
