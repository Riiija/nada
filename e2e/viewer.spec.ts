import { expect, test, type Page } from '@playwright/test'

const twoPagePdf = (text: string, name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R 6 0 R]/Count 2>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 280]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 46>>stream
BT /F1 18 Tf 20 200 Td (${text}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
6 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 280]/Contents 7 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
7 0 obj<</Length 46>>stream
BT /F1 18 Tf 20 200 Td (Deuxieme page) Tj ET
endstream endobj
trailer<</Root 1 0 R/Size 8>>
%%EOF`,
  ),
})

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function firstLaunchAndImport(page: Page) {
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
  await page.goto('/archivage')
  await page.getByLabel('Déposer des documents').setInputFiles([
    twoPagePdf('Fiche comptable', 'fiche-comptable.pdf'),
    { name: 'scan.png', mimeType: 'image/png', buffer: PNG_1X1 },
  ])
  await expect(page.getByRole('region', { name: 'File d’import' }).getByLabel(/^Étapes/)).toHaveCount(2)
}

test('visionneuse PDF : pages, zoom, texte, journal, téléchargement, titre, liaison et suppression', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchAndImport(page)

  await page.goto('/documents')
  await page.getByRole('table', { name: 'Documents' }).getByText('fiche-comptable').click()
  await expect(page.getByRole('heading', { name: 'fiche-comptable' })).toBeVisible()
  const stage = page.getByRole('region', { name: 'Aperçu du document' })
  await expect(stage.locator('.react-pdf__Page canvas').first()).toBeVisible()
  await expect(stage.locator('.react-pdf__Page__textContent').getByText('Fiche comptable')).toBeAttached()
  await expect(stage.getByText('1 / 2')).toBeVisible()

  // Pages au clavier et par bouton, miniatures, zoom
  await page.keyboard.press('ArrowRight')
  await expect(stage.getByText('2 / 2')).toBeVisible()
  await expect(page).toHaveURL(/page=2/)
  await expect(stage.locator('.react-pdf__Page__textContent').getByText('Deuxieme page')).toBeAttached()
  await stage.getByRole('button', { name: 'Aller à la page 1' }).click()
  await expect(stage.getByText('1 / 2')).toBeVisible()
  await stage.getByRole('button', { name: 'Zoom avant' }).click()
  await expect(stage.getByText('125 %')).toBeVisible()
  await page.keyboard.press('-')
  await expect(stage.getByText('100 %')).toBeVisible()
  await stage.getByRole('button', { name: 'Ajuster à la largeur' }).click()
  await expect(stage.getByText('Largeur')).toBeVisible()

  // Panneau : informations, texte pas encore lu, historique de la consultation
  const panel = page.getByRole('complementary', { name: 'Détails du document' })
  await expect(panel.getByText('Archive', { exact: true })).toBeVisible()
  await expect(panel.getByText('Ce document n’est rattaché à aucun courrier.')).toBeVisible()
  await panel.getByRole('radio', { name: 'Texte' }).click()
  await expect(panel.getByRole('searchbox', { name: 'Rechercher dans le texte' })).toBeVisible()
  await panel.getByRole('radio', { name: 'Historique' }).click()
  await expect(panel.getByText('a consulté le document')).toBeVisible()
  await expect(panel.getByText('a importé le document')).toBeVisible()

  // Téléchargement : nom d'origine, trace dans le journal
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Télécharger' }).click()
  expect((await download).suggestedFilename()).toBe('fiche-comptable.pdf')
  await expect(panel.getByText('a téléchargé le document')).toBeVisible()

  // Impression : la trace est écrite avant d'imprimer
  await page.getByRole('button', { name: 'Imprimer' }).click()
  await expect(panel.getByText('a imprimé le document')).toBeVisible()

  // Titre modifiable en place
  await page.getByRole('button', { name: 'Modifier le titre' }).click()
  await page.getByLabel('Titre du document').fill('Fiche comptable de mars')
  await page.getByRole('button', { name: 'Enregistrer le titre' }).click()
  await expect(page.getByRole('heading', { name: 'Fiche comptable de mars' })).toBeVisible()
  await page.getByRole('button', { name: 'Modifier le titre' }).click()
  await page.getByLabel('Titre du document').fill('')
  await page.getByRole('button', { name: 'Enregistrer le titre' }).click()
  await expect(page.getByText('Le titre du document est vide.')).toBeVisible()
  await page.getByRole('button', { name: 'Annuler la modification' }).click()

  // Lier à un courrier : le document apparaît dans ses informations
  await page.getByRole('button', { name: 'Lier à un courrier' }).click()
  await page.getByRole('combobox', { name: 'Courrier' }).click()
  await page.getByRole('option').first().click()
  await page.getByRole('button', { name: 'Lier le document' }).click()
  await panel.getByRole('radio', { name: 'Informations' }).click()
  await expect(panel.getByRole('link', { name: /Courrier (arrivé|départ)/ })).toBeVisible()

  // Suppression annulable
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('button', { name: 'Supprimer le document' }).click()
  await expect(page.getByRole('heading', { name: 'Tous les documents' })).toBeVisible()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(page.getByText('Document restauré')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Documents' }).getByText('Fiche comptable de mars')).toBeVisible()

  expect(errors).toEqual([])
})

test('visionneuse d’image : zoom, rotation enregistrée et journalisée', async ({ page }) => {
  // Compte les URL blob: créées et non révoquées
  await page.addInitScript(() => {
    const live = new Set<string>()
    ;(window as unknown as { __blobs: Set<string> }).__blobs = live
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = create(obj)
      live.add(url)
      return url
    }
    URL.revokeObjectURL = (url: string) => {
      live.delete(url)
      revoke(url)
    }
  })
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchAndImport(page)

  await page.goto('/documents')
  await page.getByRole('table', { name: 'Documents' }).getByText('scan').click()
  const stage = page.getByRole('region', { name: 'Aperçu du document' })
  const image = stage.getByRole('img', { name: 'scan' })
  await expect(image).toBeVisible()

  await stage.getByRole('button', { name: 'Taille réelle' }).click()
  await expect(stage.getByText('100 %')).toBeVisible()
  await stage.getByRole('button', { name: 'Zoom avant' }).click()
  await expect(stage.getByText('125 %')).toBeVisible()
  await stage.getByRole('button', { name: 'Ajuster à la fenêtre' }).click()

  await stage.getByRole('button', { name: 'Pivoter vers la droite' }).click()
  await expect(image).toHaveCSS('transform', /matrix\(/)
  await page.keyboard.press('r')
  const panel = page.getByRole('complementary', { name: 'Détails du document' })
  await panel.getByRole('radio', { name: 'Historique' }).click()
  await expect(panel.getByText('a pivoté le document')).toHaveCount(2)

  await page.reload()
  await expect(stage.getByRole('img', { name: 'scan' })).toBeVisible()
  // Après deux quarts de tour, la rotation (180°) survit au rechargement
  await expect.poll(async () => image.evaluate((el) => getComputedStyle(el).transform)).toContain('matrix(-')
  // Aucune URL blob: ne fuit une fois la visionneuse fermée
  await page.getByRole('link', { name: 'Tous les documents', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Tous les documents' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __blobs: Set<string> }).__blobs.size)).toBe(0)
  expect(errors).toEqual([])
})
