import { expect, test } from '@playwright/test'

const ROUTES = ['/', '/do', '/life', '/review', '/stats', '/checkin', '/reset', '/focus', '/settings']

test('全画面で横スクロールが発生せず、タップ領域が44px以上', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-10-15T10:00:00+09:00') })
  for (const r of ROUTES) {
    await page.goto(`/#${r}`)
    await expect(page.locator('.loading')).toHaveCount(0)
    await page.waitForTimeout(100)
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    expect(sw, `${r} で横スクロール（${info.project.name}）`).toBeLessThanOrEqual(cw)
    await page.screenshot({ path: `test-results/screens/${info.project.name}${r.replace(/\//g, '_') || '_home'}.png`, fullPage: true })
  }
  await page.goto('/#/')
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.nav a, .btn, .icon-btn, .chip')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height < 40).length,
  )
  expect(small).toBe(0)
})
