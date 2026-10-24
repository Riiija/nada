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
  const row = page.getByRole('listitem').filter({ hasText: /^destinataire,/ })
  const password = (await row.locator('span').last().textContent())!.trim()
  await page.getByLabel("J'ai conservé la clé dans un endroit sûr.").check()
  await page.getByRole('button', { name: "Ouvrir l'application" }).click()
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  return password
}

async function pick(page: Page, name: RegExp, option: string) {
  await page.getByRole('combobox', { name }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('enregistrer, suivre, supprimer et notifier un courrier arrivé', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  const recipientPassword = await firstLaunchWithDemo(page)

  // Liste : données de démonstration, onglets avec compteurs, recherche
  await page.getByRole('link', { name: /^Courriers arrivés/ }).click()
  await expect(page.getByRole('heading', { name: 'Courriers arrivés' })).toBeVisible()
  const table = page.getByRole('table', { name: 'Courriers arrivés' })
  await expect(table.getByRole('row')).not.toHaveCount(1)
  await page.getByRole('radio', { name: /^En attente/ }).click()
  await expect(table.getByText('Traité', { exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: /^Tous/ }).click()
  await page.getByRole('searchbox', { name: /Rechercher dans/ }).fill('zzz-introuvable')
  await expect(page.getByText('Aucun résultat')).toBeVisible()
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()

  // Formulaire : erreurs par champ, puis enregistrement adressé à Karim Mansour
  await page.getByRole('button', { name: 'Nouveau courrier' }).click()
  await page.getByRole('menuitem', { name: 'Courrier arrivé' }).click()
  await expect(page.getByRole('heading', { name: 'Enregistrer un courrier arrivé' })).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer le courrier' }).click()
  await expect(page.getByText("Indiquez l'objet du courrier.")).toBeVisible()
  await expect(page.getByText('Choisissez le destinataire.')).toBeVisible()

  await page.getByLabel('Objet').fill('Courrier de test e2e')
  await page.getByLabel('N° dossier').fill('D0001')
  await pick(page, /^Au bureau de/, 'Karim Mansour')
  await expect(page.getByLabel('Fonction occupée')).toHaveValue('Directeur de cabinet')
  await expect(page.getByRole('combobox', { name: /^Direction/ })).toContainText('Cabinet')
  await pick(page, /^Suivi/, 'Urgent')
  await pick(page, /^Position/, 'Au cabinet')
  await page.getByRole('button', { name: 'Enregistrer le courrier' }).click()
  await expect(page.getByText('Courrier enregistré').first()).toBeVisible()
  await expect(table.getByText('Courrier de test e2e')).toBeVisible()

  // Détail : traitement, position, historique
  await table.getByText('Courrier de test e2e').click()
  await expect(page.getByRole('heading', { name: 'Courrier de test e2e' })).toBeVisible()
  await page.getByRole('button', { name: 'Changer la position' }).click()
  await page.getByLabel('Nouvelle position').selectOption({ label: 'En traitement' })
  await page.getByRole('button', { name: 'Changer la position' }).last().click()
  await expect(page.getByText('Au cabinet → En traitement')).toBeVisible()
  await page.getByRole('button', { name: 'Marquer comme traité' }).click()
  await expect(page.getByText('Traité', { exact: true }).first()).toBeVisible()
  await page.getByRole('radio', { name: /^Historique/ }).click()
  await expect(page.getByText('a marqué le courrier comme traité')).toBeVisible()
  await expect(page.getByText('a changé la position : Au cabinet → En traitement')).toBeVisible()

  // Suppression annulable
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('button', { name: 'Supprimer le courrier' }).click()
  await expect(page.getByRole('heading', { name: 'Courriers arrivés' })).toBeVisible()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(page.getByText('Courrier restauré')).toBeVisible()
  await expect(table.getByText('Courrier de test e2e')).toBeVisible()

  // Le destinataire est notifié et peut traiter son courrier
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.getByLabel('Identifiant').fill('destinataire')
  await page.getByLabel('Mot de passe').fill(recipientPassword)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('button', { name: /^Notifications, 1 non lue/ }).click()
  await page.getByText('Nouveau courrier : Courrier de test e2e').click()
  await expect(page.getByRole('heading', { name: 'Courrier de test e2e' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Changer la position' })).toBeVisible()

  expect(errors).toEqual([])
})

test('enregistrer et nouveau conserve la date et la direction ; courrier départ avec destinataire libre', async ({ page }) => {
  await firstLaunchWithDemo(page)
  await page.goto('/courriers/departs?nouveau=1')
  await expect(page.getByRole('heading', { name: 'Enregistrer un courrier départ' })).toBeVisible()
  await page.getByLabel('Date').fill('15/03/2026')
  await page.getByLabel('Objet').fill('Réponse libre')
  await pick(page, /^Paraphé par/, 'Salma Idriss')
  await page.getByRole('combobox', { name: /^Adressé à/ }).click()
  await page.getByPlaceholder('Rechercher').last().fill('Mission spéciale')
  await page.getByRole('option', { name: /sans l’ajouter aux partenaires/ }).click()
  await expect(page.getByRole('combobox', { name: /^Adressé à/ })).toContainText('Mission spéciale')
  await page.getByRole('button', { name: 'Enregistrer et nouveau' }).click()

  await expect(page.getByLabel('Objet')).toHaveValue('')
  await expect(page.getByLabel('Date')).toHaveValue('15/03/2026')
  await expect(page.getByRole('combobox', { name: /^Direction/ })).toContainText('Cabinet')
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await page.getByRole('searchbox', { name: /Rechercher dans/ }).fill('Réponse libre')
  await expect(page.getByRole('table', { name: 'Courriers départ' }).getByText('Mission spéciale')).toBeVisible()
})
