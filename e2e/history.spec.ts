import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

async function firstLaunchWithDemo(page: Page) {
  await page.goto('/')
  await page.getByLabel("Nom de l'organisation").fill('Ministère test')
  await page.getByLabel('Nom complet').fill('Nadia Ahmed')
  await page.getByLabel('Identifiant').fill('nadia')
  await page.getByLabel(/^Mot de passe/).fill('motdepasse-solide')
  await page.getByLabel('Confirmer le mot de passe').fill('motdepasse-solide')
  await page.getByLabel('Charger des données de démonstration').check()
  await page.getByRole('button', { name: 'Créer le compte administrateur' }).click()
  await expect(page.getByRole('heading', { name: 'Comptes de test' })).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: /^lecteur,/ })
  const password = (await row.locator('span').last().textContent())!.trim()
  await page.getByLabel("J'ai conservé la clé dans un endroit sûr.").check()
  await page.getByRole('button', { name: "Ouvrir l'application" }).click()
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible()
  return password
}

test('historique : filtres, détail, chronologie, vérification, falsification détectée, export CSV', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)

  // Un changement de position produit une entrée avec son diff
  await page.getByRole('link', { name: /^Courriers arrivés/ }).click()
  await page.getByRole('table', { name: 'Courriers arrivés' }).getByRole('row').nth(1).click()
  await page.getByRole('button', { name: 'Changer la position' }).click()
  await page.getByLabel('Nouvelle position').selectOption({ label: 'En traitement' })
  await page.getByRole('button', { name: 'Changer la position' }).last().click()
  await expect(page.getByText('Position changée').first()).toBeVisible()

  await page.getByRole('link', { name: 'Historique des opérations' }).click()
  const table = page.getByRole('table', { name: 'Historique des opérations' })
  await expect(table.getByRole('row')).not.toHaveCount(1)

  // Filtre par famille et par texte, détail avec diff
  await page.getByLabel('Famille d’action').selectOption({ label: 'Courriers' })
  await expect(table.getByText('a changé la position', { exact: false }).first()).toBeVisible()
  await table.getByRole('button', { name: /Afficher le détail/ }).first().click()
  const diff = table.getByRole('table', { name: 'Modifications' })
  await expect(diff.getByRole('columnheader', { name: 'Avant' })).toBeVisible()
  await expect(diff.getByRole('rowheader', { name: 'Position' })).toBeVisible()
  await expect(diff.getByText('En traitement')).toBeVisible()
  await expect(table.getByText('Navigateur')).toBeVisible()
  await expect(table.getByText(/empreinte/)).toBeVisible()
  await expect(table.getByRole('link', { name: 'Ouvrir l’élément' })).toBeVisible()

  // Texte sans accent ni majuscule, puis réinitialisation
  await page.getByRole('button', { name: 'Réinitialiser' }).click()
  await expect(page.getByLabel('Famille d’action')).toHaveValue('')
  await page.getByRole('searchbox', { name: 'Rechercher dans l’historique' }).fill('DEMONSTRATION')
  await expect(table.getByText('a chargé les données de démonstration')).toBeVisible()
  await expect(table.getByRole('row')).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Rechercher dans l’historique' }).fill('zzz-rien')
  await expect(page.getByText('Aucune entrée ne correspond à ces critères.')).toBeVisible()
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()

  // Chronologie
  await page.getByRole('radio', { name: 'Chronologie' }).click()
  await expect(page.getByRole('region', { name: /\d{4}/ }).first()).toBeVisible()
  await page.getByRole('radio', { name: 'Tableau' }).click()

  // Vérification : chaîne intacte, et le contrôle lui-même est journalisé
  await page.getByRole('button', { name: 'Vérifier l’intégrité' }).click()
  await expect(page.getByText(/\d+ entrées vérifiées, chaîne intacte\./)).toBeVisible()
  await expect(page.getByRole('table', { name: 'Historique des opérations' }).getByText('a vérifié l’intégrité de l’historique').first()).toBeVisible()

  // Falsification : une entrée modifiée hors de l'application est détectée
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('ged')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('auditLog', 'readwrite')
          const store = tx.objectStore('auditLog')
          const get = store.get(2)
          get.onsuccess = () => {
            store.put({ ...get.result, entityLabel: 'Falsifié' })
          }
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
  await page.getByRole('button', { name: 'Vérifier l’intégrité' }).click()
  await expect(page.getByText('Incohérence à l’entrée n° 2.')).toBeVisible()
  await page.getByRole('button', { name: 'Fermer le résultat' }).click()

  // Export CSV : fichier Excel français, trace dans le journal
  await page.getByLabel('Famille d’action').selectOption({ label: 'Courriers' })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^historique-\d{4}-\d{2}-\d{2}\.csv$/)
  const content = await readFile((await file.path())!, 'utf8')
  expect(content.charCodeAt(0)).toBe(0xfeff)
  expect(content).toContain('N°;Date et heure;Utilisateur;Rôle;Action;Élément;Modifications;Navigateur')
  expect(content).toContain('a changé la position')
  expect(content).toMatch(/Position : .+ → En traitement/)
  expect(content).not.toContain('a chargé les données')
  await page.getByRole('button', { name: 'Réinitialiser' }).click()
  await expect(page.getByLabel('Famille d’action')).toHaveValue('')
  await expect(page.getByRole('table', { name: 'Historique des opérations' }).getByText('a exporté l’historique').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('un lecteur ne voit que ses actions et l’historique de ce qu’il consulte, sans export ni vérification', async ({ page }) => {
  const readerPassword = await firstLaunchWithDemo(page)
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.getByLabel('Identifiant').fill('lecteur')
  await page.getByLabel('Mot de passe').fill(readerPassword)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('link', { name: 'Historique des opérations' }).click()

  const table = page.getByRole('table', { name: 'Historique des opérations' })
  await expect(table.getByText('s’est connecté')).toBeVisible()
  await expect(table.getByText('a chargé les données de démonstration')).toHaveCount(0)
  await expect(table.getByText('a créé le compte')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Exporter' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Vérifier l’intégrité' })).toHaveCount(0)
  await expect(page.getByLabel('Utilisateur')).toHaveCount(0)
})
