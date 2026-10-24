import { expect, test, type Page } from '@playwright/test'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function firstLaunch(page: Page) {
  await page.goto('/')
  await page.getByLabel("Nom de l'organisation").fill('Ministère test')
  await page.getByLabel('Nom complet').fill('Nadia Ahmed')
  await page.getByLabel('Identifiant').fill('nadia')
  await page.getByLabel(/^Mot de passe/).fill('motdepasse-solide')
  await page.getByLabel('Confirmer le mot de passe').fill('motdepasse-solide')
  await page.getByLabel('Charger des données de démonstration').check()
  await page.getByRole('button', { name: 'Créer le compte administrateur' }).click()
  await page.getByLabel("J'ai conservé la clé dans un endroit sûr.").check()
  await page.getByRole('button', { name: "Ouvrir l'application" }).click()
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible()
}

test('hors ligne : l’application se recharge et importe un document sans réseau', async ({ page, context }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunch(page)

  // Le service worker précache l'application, le moteur OCR et pdf.js
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 60_000 })
    .toBeGreaterThan(0)
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible()

  await page.goto('/archivage')
  await page.getByLabel('Déposer des documents').setInputFiles([{ name: 'scan-hors-ligne.png', mimeType: 'image/png', buffer: PNG_1X1 }])
  const tray = page.getByRole('region', { name: 'File d’import' })
  await expect(tray.getByLabel(/^Étapes/)).toHaveCount(1)
  await expect(tray.getByText(/^Indexé, /)).toBeVisible({ timeout: 90_000 })
  expect(errors).toEqual([])
  await context.setOffline(false)
})

test('fuites : chaque URL blob créée est révoquée après navigation', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    const live = new Set<string>()
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (o: Blob | MediaSource) => {
      const u = create(o)
      live.add(u)
      return u
    }
    URL.revokeObjectURL = (u: string) => {
      live.delete(u)
      revoke(u)
    }
    ;(window as unknown as { __blobs: () => number }).__blobs = () => live.size
  })
  await firstLaunch(page)
  await page.goto('/documents')
  await page.getByRole('table').getByRole('row').nth(1).click()
  await expect(page.getByRole('region', { name: 'Aperçu du document' })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByRole('link', { name: 'Documents' }).first().click()
  await expect(page.getByRole('table', { name: 'Documents' })).toBeVisible()
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as unknown as { __blobs: () => number }).__blobs())).toBe(0)
})
