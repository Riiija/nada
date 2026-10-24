import { expect, test, type Page } from '@playwright/test'

const pdf = (text: string, name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 280]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 46>>stream\nBT /F1 18 Tf 20 200 Td (${text}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF`,
  ),
})

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
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible()
}

test('rappel, sauvegarde, restauration complète et refus d’un fichier invalide', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)

  // Deux documents à sauvegarder
  await page.goto('/archivage')
  await page.getByLabel('Déposer des documents').setInputFiles([pdf('Fiche comptable', 'fiche-comptable.pdf'), pdf('Moyen de paiement', 'moyen-paiement.pdf')])
  await expect(page.getByRole('region', { name: 'File d’import' }).getByLabel(/^Étapes/)).toHaveCount(2)

  // Pas de rappel au premier jour
  await page.getByRole('link', { name: 'Sauvegarde et restauration' }).click()
  await expect(page.getByRole('heading', { name: 'Sauvegarde et restauration', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Rappel de sauvegarde' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Où sont vos données' }).getByText('Jamais')).toBeVisible()

  // Dix jours sans sauvegarde : le bandeau apparaît, se masque, et le reste masqué après rechargement
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('ged')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ key: 'lastBackupAt', value: new Date(Date.now() - 10 * 86_400_000).toISOString() })
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
        }
      }),
  )
  const banner = page.getByRole('region', { name: 'Rappel de sauvegarde' })
  await expect(banner.getByText('Dernière sauvegarde il y a 10 jours.')).toBeVisible()
  await expect(banner.getByText('Les données ne sont enregistrées que dans ce navigateur.')).toBeVisible()
  await banner.getByRole('button', { name: 'Masquer ce rappel pendant 24 heures' }).click()
  await expect(banner).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sauvegarde et restauration', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Rappel de sauvegarde' })).toHaveCount(0)

  // Sauvegarde : fichier zip nommé avec la date, état mis à jour
  const download = page.waitForEvent('download')
  await page.getByRole('region', { name: 'Sauvegarder' }).getByRole('button', { name: 'Sauvegarder maintenant' }).click()
  const backup = await download
  expect(backup.suggestedFilename()).toMatch(/^sauvegarde-ged-\d{4}-\d{2}-\d{2}\.zip$/)
  const backupPath = (await backup.path())!
  await expect(page.getByText('Sauvegarde enregistrée').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Où sont vos données' }).getByText(/il y a moins d’une minute|dans moins/)).toBeVisible()

  // Après la sauvegarde, l'état change : un nouveau courrier et un document supprimé
  await page.goto('/courriers/arrives?nouveau=1')
  await page.getByLabel('Objet').fill('Courrier après sauvegarde')
  await page.getByLabel('N° dossier').fill('D0099')
  await page.getByRole('combobox', { name: /^Au bureau de/ }).click()
  await page.getByRole('option', { name: 'Karim Mansour', exact: true }).click()
  await page.getByRole('combobox', { name: /^Suivi/ }).click()
  await page.getByRole('option', { name: 'Urgent', exact: true }).click()
  await page.getByRole('combobox', { name: /^Position/ }).click()
  await page.getByRole('option', { name: 'Au cabinet', exact: true }).click()
  await page.getByRole('button', { name: 'Enregistrer le courrier' }).click()
  await page.getByRole('searchbox', { name: /Rechercher dans/ }).fill('Courrier après sauvegarde')
  await expect(page.getByRole('table', { name: 'Courriers arrivés' }).getByText('Courrier après sauvegarde')).toBeVisible()

  // Un fichier qui n'est pas une sauvegarde est refusé avec sa cause
  await page.goto('/sauvegarde')
  await page.getByLabel('Choisir une sauvegarde').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('ceci n’est pas un zip') })
  await expect(page.getByRole('alert').getByText(/pas une sauvegarde/)).toBeVisible()

  // Restauration : aperçu, confirmation par saisie, remplacement complet, reconnexion
  await page.getByLabel('Choisir une sauvegarde').setInputFiles(backupPath)
  const preview = page.getByLabel('Aperçu de la sauvegarde')
  await expect(preview.getByText(/^Sauvegarde du /)).toBeVisible()
  await expect(preview.getByText('Ministère test')).toBeVisible()
  await expect(preview.getByText(/entrées, chaîne intacte/)).toBeVisible()
  await expect(preview.getByText(/^27, /)).toBeVisible() // 25 documents de démonstration + 2 importés
  await preview.getByRole('button', { name: 'Restaurer cette sauvegarde' }).click()
  const confirm = page.getByRole('dialog')
  const replace = confirm.getByRole('button', { name: 'Remplacer toutes les données' })
  await expect(replace).toBeDisabled()
  await confirm.getByLabel(/Tapez RESTAURER/).fill('restaurer')
  await expect(replace).toBeDisabled()
  await confirm.getByLabel(/Tapez RESTAURER/).fill('RESTAURER')
  await replace.click()

  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible({ timeout: 60_000 })
  await page.getByLabel('Identifiant').fill('nadia')
  await page.getByLabel('Mot de passe').fill('motdepasse-solide')
  await page.getByRole('button', { name: 'Se connecter' }).click()

  // Le courrier créé après la sauvegarde a disparu, les documents sont revenus avec leurs fichiers
  await page.getByRole('link', { name: /^Courriers arrivés/ }).click()
  await page.getByRole('searchbox', { name: /Rechercher dans/ }).fill('Courrier après sauvegarde')
  await expect(page.getByText('Aucun résultat')).toBeVisible()
  await page.getByRole('link', { name: 'Tous les documents' }).click()
  const documents = page.getByRole('table', { name: 'Documents' })
  await expect(page.getByText(/sur 27$/)).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher un document' }).fill('fiche-comptable')
  await documents.getByText('fiche-comptable').click()
  await expect(page.locator('.react-pdf__Page canvas').first()).toBeVisible()

  // Le journal garde la trace, et la chaîne reste intacte
  await page.getByRole('link', { name: 'Historique des opérations' }).click()
  await expect(page.getByRole('table', { name: 'Historique des opérations' }).getByText('a restauré une sauvegarde').first()).toBeVisible()
  await page.getByRole('button', { name: 'Vérifier l’intégrité' }).click()
  await expect(page.getByText(/\d+ entrées vérifiées, chaîne intacte\./)).toBeVisible()
  expect(errors).toEqual([])
})
