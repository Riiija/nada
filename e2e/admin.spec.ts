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
  const reader = page.getByRole('listitem').filter({ hasText: /^lecteur,/ })
  const password = (await reader.locator('span').last().textContent())!.trim()
  await page.getByLabel("J'ai conservé la clé dans un endroit sûr.").check()
  await page.getByRole('button', { name: "Ouvrir l'application" }).click()
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  return password
}

test('référentiels, utilisateurs, paramètres et droits du lecteur', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  const readerPassword = await firstLaunchWithDemo(page)

  // Référentiels : lecture, création, modification, désactivation
  await page.getByRole('link', { name: 'Référentiels' }).click()
  const table = page.getByRole('table', { name: 'Directions' })
  await expect(table.getByText('Direction du budget')).toBeVisible()

  await page.getByRole('button', { name: 'Ajouter une direction' }).first().click()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Indiquez le nom de la direction.')).toBeVisible()
  await page.getByLabel('Nom de la direction').fill('Direction test')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(table.getByText('Direction test')).toBeVisible()

  await page.getByRole('button', { name: 'Actions pour Direction test' }).click()
  await page.getByRole('menuitem', { name: 'Modifier' }).click()
  await page.getByLabel('Code').fill('DT')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(table.getByRole('row', { name: /Direction test/ }).getByText('DT')).toBeVisible()

  await page.getByRole('button', { name: 'Actions pour Direction test' }).click()
  await page.getByRole('menuitem', { name: 'Désactiver' }).click()
  await page.getByRole('button', { name: 'Désactiver', exact: true }).click()
  await expect(table.getByRole('row', { name: /Direction test/ }).getByText('Désactivé')).toBeVisible()

  // Autre onglet : types de courrier numérotés
  await page.getByRole('link', { name: 'Types de courrier' }).click()
  await expect(page.getByRole('table', { name: 'Types de courrier' }).getByText('Invitation')).toBeVisible()

  // Utilisateurs
  await page.getByRole('link', { name: 'Utilisateurs' }).click()
  await page.getByRole('button', { name: 'Créer un compte' }).click()
  await page.getByLabel('Nom complet').fill('Samir Test')
  await page.getByLabel('Identifiant').fill('samir')
  await page.getByLabel(/^Mot de passe/).fill('un-mot-de-passe')
  await page.getByRole('button', { name: 'Créer le compte' }).click()
  await expect(page.getByRole('table', { name: 'Comptes' }).getByText('samir', { exact: true })).toBeVisible()

  // Paramètres
  await page.getByRole('link', { name: 'Paramètres' }).click()
  await page.getByLabel('Courrier en retard après (jours)').fill('20')
  await page.getByRole('button', { name: 'Enregistrer les paramètres' }).click()
  await expect(page.getByText('Paramètres enregistrés').first()).toBeVisible()

  // Le lecteur ne voit ni Utilisateurs ni Paramètres, et l'accès direct est refusé
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.getByLabel('Identifiant').fill('lecteur')
  await page.getByLabel('Mot de passe').fill(readerPassword)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  // le lecteur reste sur /parametres après la connexion : l'écran est refusé
  await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Utilisateurs' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Paramètres' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nouveau courrier' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Courriers arrivés' }).click()
  await page.goto('/utilisateurs')
  await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible()

  expect(errors).toEqual([])
})
