/**
 * Drives a fresh fake account from the welcome screen to the Tatilim tab,
 * in Turkish. The in-memory backend resets on reload, so every visual pass
 * starts here.
 */
async (page) => {
  const tap = async (id) => {
    const el = page.locator(`[data-testid="${id}"]`).first();
    await el.waitFor({ state: 'visible', timeout: 12000 });
    await el.click();
  };
  const type = async (id, v) => {
    const el = page.locator(`[data-testid="${id}"]`).first();
    await el.waitFor({ state: 'visible', timeout: 12000 });
    await el.click();
    await el.pressSequentially(v, { delay: 10 });
  };
  const ids = async () => [...new Set(await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid]')).map((n) => n.getAttribute('data-testid'))))];

  await page.goto('http://localhost:8095');
  await page.waitForTimeout(3000);

  // Turkish first, so the screens match the frames they are being compared to.
  const tr = page.locator('[data-testid="welcome-language-tr"], [data-testid="settings-language-tr"]').first();
  if (await tr.count()) await tr.click();
  await page.waitForTimeout(300);

  await tap('welcome-phone');
  await tap('onboarding-continue');            // the 18+ promise
  await type('auth-phone', '5551110001');
  await tap('onboarding-continue');
  await type('auth-otp', '123456');
  await tap('onboarding-continue');

  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(320);
    const now = await ids();
    if (now.includes('screen-hotel')) break;
    if (now.includes('profile-name')) {
      const v = await page.evaluate(() => document.querySelector('[data-testid="profile-name"]').value);
      if (!v) await type('profile-name', 'Deniz');
    } else if (now.includes('profile-birthdate')) {
      const v = await page.evaluate(() => document.querySelector('[data-testid="profile-birthdate"]').value);
      if (!v) await type('profile-birthdate', '01031994');
    } else {
      const pick = now.find((id) => /^(gender-(?!.*self-describe)|orientation-|show-me-|interest-)/.test(id)
        && id !== 'show-gender');
      if (pick) await page.locator(`[data-testid="${pick}"]`).first().click();
    }
    if (now.includes('onboarding-photo-skip')) { await tap('onboarding-photo-skip'); continue; }
    const cont = page.locator('[data-testid="onboarding-continue"]').first();
    if (await cont.count()) await cont.click();
  }
  await page.waitForTimeout(600);
  return (await ids()).find((id) => id && id.startsWith('screen-'));
}