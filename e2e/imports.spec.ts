import { expect, test, type Page } from '@playwright/test'

const pdf = (text: string, name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 280]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 46>>stream
BT /F1 18 Tf 20 200 Td (${text}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`,
  ),
})

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

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

test('import en masse : formats, doublons, récapitulatif, liste des documents', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)

  await page.getByRole('link', { name: 'Importer des documents' }).click()
  await expect(page.getByRole('heading', { name: 'Importer des documents' })).toBeVisible()
  await page.getByLabel('Déposer des documents').setInputFiles([
    pdf('Fiche comptable', 'fiche-comptable.pdf'),
    pdf('Moyen de paiement', 'moyen-paiement.pdf'),
    { name: 'scan.png', mimeType: 'image/png', buffer: PNG_1X1 },
    { name: 'tableau.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK zip') },
  ])

  const queue = page.getByRole('region', { name: 'File d’import' })
  await expect(queue.getByLabel(/^Étapes/)).toHaveCount(3)
  // Même contenu sous un autre nom : refusé comme doublon (déposé après, sinon l'ordre d'arrivée décide)
  await page.getByLabel('Déposer des documents').setInputFiles(pdf('Fiche comptable', 'copie-de-la-fiche.pdf'))
  await expect(queue.getByText('Refusé')).toBeVisible()
  await expect(queue.getByText("Ce fichier n'est pas un PDF ni une image JPEG, PNG ou WebP.")).toBeVisible()
  await expect(queue.getByText('Déjà archivé')).toBeVisible()
  await expect(queue.getByRole('link', { name: 'Ouvrir le document existant' })).toBeVisible()
  await expect(queue.getByLabel(/^Étapes/)).toHaveCount(3)

  const recap = page.getByRole('complementary', { name: 'Récapitulatif' })
  await expect(recap.locator('div', { hasText: /^5Sélectionnés$/ })).toBeVisible()
  await expect(recap.locator('div', { hasText: /^3Ajoutés$/ })).toBeVisible()
  await expect(recap.locator('div', { hasText: /^1Doublons ignorés$/ })).toBeVisible()
  await expect(recap.locator('div', { hasText: /^1Refusés$/ })).toBeVisible()

  await recap.getByRole('link', { name: 'Voir les documents ajoutés' }).click()
  const table = page.getByRole('table', { name: 'Documents' })
  await expect(page.getByText(/sur 28$/)).toBeVisible() // 25 documents de démonstration + 3 importés
  await expect(table.getByText('fiche-comptable')).toBeVisible()
  await expect(table.getByText('moyen-paiement')).toBeVisible()
  await expect(table.getByText('scan', { exact: true })).toBeVisible()

  // Le panneau « Imports » suit sur les autres pages (et le sélecteur de fichiers n'accepte que les bons formats)
  await expect(page.getByRole('region', { name: 'Imports' })).toBeVisible()
  expect(errors).toEqual([])
})

test('pièces jointes d’un courrier : ajout, rattachement, détachement et annulation', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)

  // Un courrier créé avec une pièce jointe dans le formulaire
  await page.goto('/courriers/arrives?nouveau=1')
  await page.getByLabel('Objet').fill('Courrier avec pièce jointe')
  await page.getByLabel('N° dossier').fill('D0002')
  await page.getByRole('combobox', { name: /^Au bureau de/ }).click()
  await page.getByRole('option', { name: 'Karim Mansour', exact: true }).click()
  await page.getByRole('combobox', { name: /^Suivi/ }).click()
  await page.getByRole('option', { name: 'Urgent', exact: true }).click()
  await page.getByRole('combobox', { name: /^Position/ }).click()
  await page.getByRole('option', { name: 'Au cabinet', exact: true }).click()
  await page.getByLabel('Ajouter des pièces jointes').setInputFiles(pdf('Pièce 1', 'piece-1.pdf'))
  await expect(page.getByRole('list', { name: 'Pièces jointes à ajouter' }).getByText('piece-1.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer le courrier' }).click()
  await expect(page.getByRole('region', { name: 'Imports' }).getByLabel(/^Étapes/).first()).toBeVisible()

  // La liste affiche le trombone, la fiche affiche la carte
  const table = page.getByRole('table', { name: 'Courriers arrivés' })
  await page.getByRole('searchbox', { name: /Rechercher dans/ }).fill('Courrier avec pièce jointe')
  await expect(table.getByRole('row').nth(1).getByText('1', { exact: true })).toBeVisible()
  await table.getByText('Courrier avec pièce jointe').click()
  await expect(page.getByRole('heading', { name: 'Pièces jointes (1)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'piece-1' })).toBeVisible()

  // Ajout depuis la fiche, puis détachement annulable
  await page.getByLabel('Ajouter des pièces jointes').setInputFiles(pdf('Pièce 2', 'piece-2.pdf'))
  await expect(page.getByRole('heading', { name: 'Pièces jointes (2)' })).toBeVisible()
  await page.getByRole('button', { name: 'Détacher piece-2' }).click()
  await expect(page.getByRole('heading', { name: 'Pièces jointes (1)' })).toBeVisible()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pièces jointes (2)' })).toBeVisible()

  // Rattacher un document déjà archivé
  await page.getByRole('button', { name: 'Choisir dans les archives' }).click()
  await page.getByRole('combobox', { name: 'Document' }).click()
  await expect(page.getByRole('option', { name: 'piece-1', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // L'historique du courrier garde les ajouts hors de la fiche : ils sont dans le journal du document
  expect(errors).toEqual([])
})
