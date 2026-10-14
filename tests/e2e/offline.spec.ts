import { expect, test } from '@playwright/test'

test('オフラインでも起動し、記録できる（Service Worker）', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.locator('.loading')).toHaveCount(0)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // SW が制御するまで再読み込み
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeVisible()

  // オフラインで最重要タスクを決める → 保存される
  await page.getByRole('textbox', { name: '最重要タスク' }).fill('オフラインで記録')
  await page.getByRole('button', { name: '25分' }).click()
  await page.getByRole('button', { name: 'これに決める' }).click()
  await expect(page.getByRole('region', { name: '次にやること' })).toContainText('オフラインで記録')
  await page.reload()
  await expect(page.getByRole('region', { name: '次にやること' })).toContainText('オフラインで記録')

  // 別画面もキャッシュから表示
  await page.goto('/#/stats')
  await expect(page.getByRole('heading', { name: '分析' })).toBeVisible()
  await context.setOffline(false)
})
