import { expect, test } from '@playwright/test'

test('premier lancement, connexion, verrouillage et déconnexion', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Créer le compte administrateur' })).toBeVisible()

  // validation par champ
  await page.getByRole('button', { name: 'Créer le compte administrateur' }).click()
  await expect(page.getByText("Indiquez le nom de l'organisation.")).toBeVisible()

  await page.getByLabel("Nom de l'organisation").fill('Ministère test')
  await page.getByLabel('Nom complet').fill('Nadia Ahmed')
  await page.getByLabel('Identifiant').fill('nadia')
  await page.getByLabel(/^Mot de passe/).fill('motdepasse-solide')
  await page.getByLabel('Confirmer le mot de passe').fill('motdepasse-solide')
  await page.getByRole('button', { name: 'Créer le compte administrateur' }).click()

  // la clé de récupération reste affichée après la création du compte
  await expect(page.getByRole('heading', { name: 'Conservez votre clé de récupération' })).toBeVisible()
  const open = page.getByRole('button', { name: "Ouvrir l'application" })
  await expect(open).toBeDisabled()
  await page.getByLabel("J'ai conservé la clé dans un endroit sûr.").check()
  await open.click()
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  await expect(page.getByText('Nadia Ahmed')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Utilisateurs' })).toBeVisible()

  // la session survit au rechargement de l'onglet
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

  // verrouillage puis déverrouillage
  await page.getByRole('button', { name: 'Verrouiller la session' }).click()
  await expect(page.getByRole('heading', { name: 'Session verrouillée' })).toBeVisible()
  await page.getByLabel('Mot de passe').fill('faux')
  await page.getByRole('button', { name: 'Déverrouiller' }).click()
  await expect(page.getByText('Mot de passe incorrect.')).toBeVisible()
  await page.getByLabel('Mot de passe').fill('motdepasse-solide')
  await page.getByRole('button', { name: 'Déverrouiller' }).click()
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

  // déconnexion, mauvais mot de passe, puis connexion
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  await page.getByLabel('Identifiant').fill('nadia')
  await page.getByLabel('Mot de passe').fill('mauvais')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByText('Identifiant ou mot de passe incorrect.')).toBeVisible()
  await page.getByLabel('Mot de passe').fill('motdepasse-solide')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

  expect(errors).toEqual([])
})
