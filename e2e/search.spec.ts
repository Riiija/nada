import { expect, test, type Page } from '@playwright/test'

const stream = (text: string) => `BT /F1 12 Tf 40 780 Td (${text}) Tj ET`

const nativeTextPdf = (name: string, text: string) => {
  const first = stream(text)
  const second = stream('Annexe numero deux : tableau des remboursements trimestriels par direction et par service, avec le detail des montants')
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R 6 0 R]/Count 2>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${first.length}>>stream
${first}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
6 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 7 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
7 0 obj<</Length ${second.length}>>stream
${second}
endstream endobj
trailer<</Root 1 0 R/Size 8>>
%%EOF`,
    ),
  }
}

async function firstLaunchWithDemo(page: Page) {
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
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
}

test('texte natif d’un PDF : indexé sans OCR, retrouvé par la palette et la page de recherche', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)

  await page.goto('/archivage')
  await page.getByLabel('Déposer des documents').setInputFiles(
    nativeTextPdf('rapport-pret.pdf', 'Le recouvrement des prets bancaires a progresse de douze pour cent au cours du dernier trimestre, selon le rapport'),
  )
  const queue = page.getByRole('region', { name: 'File d’import' })
  await expect(queue.getByText('Indexé, texte du PDF')).toBeVisible({ timeout: 30_000 })

  // Palette Ctrl K : courriers de la démo, document et page du document
  await page.goto('/tableau-de-bord')
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Rechercher un courrier, un document…').fill('recouvrement')
  const palette = page.getByRole('dialog')
  await expect(palette.getByText('Courriers', { exact: true })).toBeVisible()
  await expect(palette.getByText('Pages', { exact: true })).toBeVisible()
  await expect(palette.getByText('rapport-pret, page 1')).toBeVisible()
  await expect(palette.locator('mark').first()).toBeVisible()

  // Entrée sur une page ouvre le document à la bonne page, texte surligné
  await palette.getByText('rapport-pret, page 1').click()
  await expect(page).toHaveURL(/\/documents\/.+\?page=1&q=recouvrement/)
  const panel = page.getByRole('complementary', { name: 'Détails du document' })
  await expect(panel.locator('mark', { hasText: /recouvrement/i }).first()).toBeVisible()
  await expect(panel.getByText('Page 2')).toBeVisible()

  // Page de recherche : filtre par type, accents et fautes tolérés
  await page.goto('/recherche?q=pr%C3%AAts')
  await expect(page.getByText(/\d+ résultats?/)).toBeVisible()
  await page.getByRole('radio', { name: /^Pages/ }).click()
  await expect(page.getByRole('link', { name: /rapport-pret, page 1/ })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill('remboursments')
  await expect(page.getByRole('link', { name: /rapport-pret, page 2/ })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill('zzzintrouvable')
  await expect(page.getByText('Aucun résultat pour « zzzintrouvable »')).toBeVisible()
  expect(errors).toEqual([])
})

test('image sans texte natif : lecture Tesseract, progression, texte retrouvé par la recherche', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)

  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1400
    canvas.height = 360
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000'
    ctx.font = 'bold 88px Arial, sans-serif'
    ctx.fillText('FICHE COMPTABLE', 60, 140)
    ctx.fillText('MOYEN DE PAIEMENT', 60, 280)
    return canvas.toDataURL('image/png').split(',')[1]!
  })

  await page.goto('/archivage')
  await page.getByLabel('Déposer des documents').setInputFiles({ name: 'scan-fiche.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  // Les trois courriers de démonstration en attente sont lus d'abord : la file les passe avant notre image
  const row = page.getByRole('region', { name: 'File d’import' }).getByRole('listitem').filter({ hasText: 'scan-fiche.png' })
  await expect(row.getByLabel(/^Étapes/)).toBeVisible()
  await expect(row.getByText(/^Indexé, confiance \d+ %/)).toBeVisible({ timeout: 120_000 })

  // Le texte lu est dans la visionneuse et dans l'index
  await page.goto('/documents')
  await expect(page.getByRole('table', { name: 'Documents' }).getByRole('row', { name: /scan-fiche/ }).getByText('Indexé')).toBeVisible()
  await page.getByRole('table', { name: 'Documents' }).getByText('scan-fiche').click()
  const panel = page.getByRole('complementary', { name: 'Détails du document' })
  await panel.getByRole('radio', { name: 'Texte' }).click()
  await expect(panel.getByText(/comptable/i)).toBeVisible()

  await page.goto('/recherche?q=paiement&type=page')
  await expect(page.getByRole('link', { name: /scan-fiche, page 1/ })).toBeVisible()
  expect(errors).toEqual([])
})
