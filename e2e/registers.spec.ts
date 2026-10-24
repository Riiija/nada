import { readFile } from 'node:fs/promises'
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
  await expect(page.getByRole('heading', { name: 'Comptes de test' })).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: /^lecteur,/ })
  const password = (await row.locator('span').last().textContent())!.trim()
  await page.getByLabel("J'ai conservé la clé dans un endroit sûr.").check()
  await page.getByRole('button', { name: "Ouvrir l'application" }).click()
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible()
  return password
}

async function openList(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
}

test('décrets : numérotation, signataire créé à la volée, pièce jointe, détail, historique, suppression annulable', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)
  await openList(page, 'Décrets présidentiels')

  await expect(page.getByRole('table', { name: 'Décrets présidentiels' }).getByText('Portant organisation du ministère')).toBeVisible() // démonstration
  await page.getByRole('button', { name: 'Enregistrer un décret' }).first().click()
  const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
  const preview = page.getByLabel('N° attribué à l’enregistrement')
  await expect(preview).toHaveValue(new RegExp(`^\\d+/${yy}$`))
  const reference = await preview.inputValue()

  // Erreurs par champ
  await page.getByRole('button', { name: 'Enregistrer le décret' }).click()
  await expect(page.getByText("Indiquez l'objet du décret.")).toBeVisible()
  await expect(page.getByText('Choisissez le chef de l’État signataire.')).toBeVisible()

  await page.getByLabel('Objet').fill('Nomination du directeur général')
  await page.getByRole('combobox', { name: /^Signé par/ }).click()
  await page.getByPlaceholder('Rechercher').last().fill('Président Test')
  await page.getByRole('option', { name: /Créer « Président Test »/ }).click()
  await expect(page.getByRole('combobox', { name: /^Signé par/ })).toContainText('Président Test')
  await page.getByLabel('Ajouter des pièces jointes').setInputFiles(pdf('Décret signé', 'decret-signe.pdf'))
  await page.getByRole('button', { name: 'Enregistrer le décret' }).click()
  await expect(page.getByText('Décret enregistré').first()).toBeVisible()

  const table = page.getByRole('table', { name: 'Décrets présidentiels' })
  await expect(table.getByText(reference, { exact: true })).toBeVisible()
  await expect(table.getByText('Président Test')).toBeVisible()
  await expect(table.getByRole('row').nth(1).getByText('1', { exact: true })).toBeVisible() // pièce jointe

  // Détail, modification, historique
  await table.getByText('Nomination du directeur général', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Nomination du directeur général', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pièces jointes (1)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'decret-signe' })).toBeVisible()
  await page.getByRole('button', { name: 'Modifier', exact: true }).click()
  await page.getByLabel('Objet').fill('Nomination du directeur adjoint')
  await page.getByRole('button', { name: 'Enregistrer le décret' }).click()
  await expect(page.getByRole('heading', { name: 'Nomination du directeur adjoint', level: 1 })).toBeVisible()
  await page.getByRole('radio', { name: /^Historique/ }).click()
  await expect(page.getByText('a modifié le décret')).toBeVisible()
  await expect(page.getByText('a créé le décret')).toBeVisible()

  // Le document archivé mentionne le décret
  await page.getByRole('link', { name: 'Tous les documents' }).click()
  await page.getByRole('table', { name: 'Documents' }).getByText('decret-signe').click()
  await expect(page.getByRole('complementary', { name: 'Détails du document' }).getByRole('link', { name: new RegExp(`Décret ${reference}`) })).toBeVisible()

  // Suppression annulable, numéro jamais réutilisé
  await page.getByRole('link', { name: 'Décrets présidentiels', exact: true }).click()
  await page.getByRole('button', { name: /^Actions pour Nomination/ }).click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await expect(table.getByText('Nomination du directeur adjoint')).toHaveCount(0)
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(table.getByText('Nomination du directeur adjoint')).toBeVisible()
  await expect(table.getByText(reference, { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('factures : montant, état, filtre, export CSV ; journal des opérations : totaux, solde, recherche par chèque', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)

  // Devise des paramètres
  await page.getByRole('link', { name: 'Paramètres', exact: true }).click()
  await page.getByLabel('Devise').fill('MGA')
  await page.getByRole('button', { name: 'Enregistrer les paramètres' }).click()
  await expect(page.getByText('Paramètres enregistrés').first()).toBeVisible()

  // Factures
  await openList(page, 'Factures arrivées')
  await page.getByRole('button', { name: 'Enregistrer une facture' }).first().click()
  await page.getByRole('button', { name: 'Enregistrer la facture' }).click()
  await expect(page.getByText('Choisissez le fournisseur.')).toBeVisible()
  await expect(page.getByText('Indiquez le montant de la facture.')).toBeVisible()
  await page.getByRole('combobox', { name: /^Fournisseur/ }).click()
  await page.getByRole('option', { name: 'UNICEF', exact: true }).click()
  await page.getByLabel('N° de facture').fill('FA-2026-044')
  await page.getByLabel('Date de la facture').fill('15/10/2026')
  await page.getByLabel('Montant').fill('1 250 000,50')
  await page.getByRole('button', { name: 'Enregistrer et nouveau' }).click()
  await page.getByRole('combobox', { name: /^Fournisseur/ }).click()
  await page.getByRole('option', { name: 'Banque centrale', exact: true }).click()
  await page.getByLabel('Date de la facture').fill('16/10/2026')
  await page.getByLabel('Montant').fill('300000')
  await page.getByLabel('État').selectOption({ label: 'Payée' })
  await page.getByRole('button', { name: 'Enregistrer la facture' }).click()

  const invoices = page.getByRole('table', { name: 'Factures arrivées' })
  await expect(invoices.getByText('1 250 000,50')).toBeVisible()
  await expect(invoices.getByText('300 000', { exact: true })).toBeVisible()
  await expect(invoices.getByRole('row', { name: /Banque centrale/ }).getByText('Payée', { exact: true })).toBeVisible()
  await expect(invoices.getByRole('row', { name: /UNICEF/ }).getByText('Reçue', { exact: true })).toBeVisible()
  await expect(invoices.getByRole('columnheader', { name: /Montant \(MGA\)/ })).toBeVisible()

  await page.getByRole('button', { name: /^Filtres/ }).click()
  await page.getByRole('combobox', { name: 'État' }).click()
  await page.getByRole('option', { name: 'Payée', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(invoices.getByText('Reçue', { exact: true })).toHaveCount(0)
  await expect(invoices.getByText('UNICEF')).toHaveCount(0)
  await expect(invoices.getByText('Banque centrale')).toBeVisible()

  // Export CSV avec les filtres courants, tracé dans l'historique
  const csvDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter' }).click()
  const csv = await readFile((await (await csvDownload).path())!, 'utf8')
  expect(csv.charCodeAt(0)).toBe(0xfeff)
  expect(csv).toContain('Reçue le;N°;Fournisseur;N° de facture;Date facture;Montant (MGA);Échéance;État;Pièces jointes')
  expect(csv).toContain('Banque centrale')
  expect(csv).toContain('Payée')
  expect(csv).not.toContain('UNICEF')

  // Journal des opérations
  await openList(page, 'Journal des opérations')
  const add = async (date: string, order: string, cheque: string, label: string, debit: string, credit: string) => {
    await page.getByRole('button', { name: 'Enregistrer une opération' }).first().click()
    await page.getByLabel('Date de l’opération').fill(date)
    await page.getByLabel('N° de commande').fill(order)
    await page.getByLabel('N° de chèque').fill(cheque)
    await page.getByLabel('Intitulé de l’opération').fill(label)
    await page.getByLabel('Débit').fill(debit)
    await page.getByLabel('Crédit').fill(credit)
    await page.getByRole('button', { name: 'Enregistrer l’opération' }).click()
    await expect(page.getByRole('table', { name: 'Journal des opérations' }).getByText(label)).toBeVisible()
  }
  await page.getByRole('button', { name: 'Enregistrer une opération' }).first().click()
  await page.getByLabel('Intitulé de l’opération').fill('Sans montant')
  await page.getByRole('button', { name: 'Enregistrer l’opération' }).click()
  await expect(page.getByText('Saisissez un débit ou un crédit.')).toBeVisible()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await page.getByRole('button', { name: 'Fermer sans enregistrer' }).click()

  await add('01/10/2026', 'E2E-CMD-001', 'E2E-7001', 'E2E Loyer du bureau', '30 000,50', '')
  await add('03/10/2026', 'E2E-CMD-002', 'E2E-7002', 'E2E Achat de fournitures', '15 000', '')
  await add('05/10/2026', '', '', 'E2E Virement reçu', '', '100 000')
  // Les données de démonstration ont déjà des écritures : on isole les trois nôtres pour les totaux
  await page.getByRole('searchbox', { name: /Rechercher dans/ }).fill('E2E')

  const totals = page.getByLabel('Totaux de la période affichée')
  await expect(totals.getByText('Total débit').locator('..').getByText('45 000,50')).toBeVisible()
  await expect(totals.getByText('Total crédit').locator('..').getByText('100 000')).toBeVisible()
  await expect(totals.getByText('Solde').locator('..').getByText('54 999,50')).toBeVisible()

  // Recherche par n° de chèque : les totaux suivent le filtre
  await page.getByRole('searchbox', { name: /Rechercher dans/ }).fill('E2E-7002')
  const ledger = page.getByRole('table', { name: 'Journal des opérations' })
  await expect(ledger.getByText('E2E Achat de fournitures')).toBeVisible()
  await expect(ledger.getByText('E2E Loyer du bureau')).toHaveCount(0)
  await expect(totals.getByText('Total débit').locator('..').getByText('15 000')).toBeVisible()
  await expect(totals.getByText('Solde').locator('..').getByText('-15 000')).toBeVisible()
  await expect(ledger.getByRole('columnheader', { name: 'Solde cumulé' })).toBeVisible()

  // Export des courriers arrivés
  await page.getByRole('link', { name: /^Courriers arrivés/ }).click()
  const mailsDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter' }).click()
  const mails = await readFile((await (await mailsDownload).path())!, 'utf8')
  expect(mails).toContain('Date;N°;Objet;N° dossier;Provenance;Au bureau de;Fonction;Direction;Type;Suivi;Position;Statut;Pièces jointes')
  expect(mails.trim().split('\r\n').length).toBe(181) // en-tête + 180 courriers de démonstration

  // Les exports sont tracés
  await page.getByRole('link', { name: 'Historique des opérations' }).click()
  await page.getByRole('searchbox', { name: 'Rechercher dans l’historique' }).fill('Export')
  await expect(page.getByRole('table', { name: 'Historique des opérations' }).getByText('a exporté des données')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('un lecteur consulte les registres sans pouvoir écrire ni exporter', async ({ page }) => {
  const readerPassword = await firstLaunchWithDemo(page)
  await openList(page, 'Notes de service')
  await page.getByRole('button', { name: 'Enregistrer une note' }).first().click()
  await page.getByLabel('Objet').fill('Note de test')
  await page.getByRole('button', { name: 'Enregistrer la note' }).click()
  await expect(page.getByText('Note enregistrée').first()).toBeVisible()

  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.getByLabel('Identifiant').fill('lecteur')
  await page.getByLabel('Mot de passe').fill(readerPassword)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await openList(page, 'Notes de service')
  await expect(page.getByRole('table', { name: 'Notes de service' }).getByText('Note de test')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrer une note' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Exporter' })).toHaveCount(0)
  await page.getByRole('table', { name: 'Notes de service' }).getByText('Note de test').click()
  await expect(page.getByRole('heading', { name: 'Note de test', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0)
})
