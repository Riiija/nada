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
  await page.getByLabel("J'ai conservé la clé dans un endroit sûr.").check()
  await page.getByRole('button', { name: "Ouvrir l'application" }).click()
}

test('tableau de bord : KPI, graphiques, indicateurs, courriers en attente et activité', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await firstLaunchWithDemo(page)

  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible()
  await expect(page.getByText('Bonjour Nadia. Voici l’activité du bureau d’ordre.')).toBeVisible()

  // Quatre cartes KPI avec tendance et courbe
  for (const label of ['Courriers arrivés', 'Courriers départ', 'Documents archivés', 'En attente de traitement']) {
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: label, level: 2 }) })
    await expect(card).toBeVisible()
    await expect(card.getByText('vs mois dernier')).toBeVisible()
    await expect(card.getByRole('img', { name: new RegExp(`${label} sur les 30 derniers jours`) })).toBeVisible()
  }
  const pending = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'En attente de traitement' }) })
  await expect(pending.getByText(/^\d+$/).first()).toBeVisible()

  // Courbe mensuelle : séries et année
  const volume = page.getByRole('region', { name: 'Volume mensuel' })
  await expect(volume.getByRole('img', { name: /Arrivés par mois en \d{4} : \d+ au total/ })).toBeVisible()
  await expect(volume.locator('.recharts-area-curve')).toBeVisible()
  await volume.getByRole('radio', { name: 'Départs' }).click()
  await expect(volume.getByRole('img', { name: /Départs par mois en/ })).toBeVisible()
  await volume.getByRole('radio', { name: 'Archivés' }).click()
  await expect(volume.getByRole('img', { name: /Archivés par mois en/ })).toBeVisible()
  await expect(volume.getByLabel('Année')).toHaveValue(String(new Date().getFullYear()))

  // Les 25 documents de démonstration alimentent le donut ; les indicateurs restent lisibles
  await expect(page.getByRole('img', { name: 'Répartition des documents par catégorie : 25 documents' })).toBeVisible()
  const indicators = page.getByRole('region', { name: 'Indicateurs' })
  await expect(indicators.getByRole('progressbar')).toHaveCount(3)
  await expect(indicators.getByRole('progressbar', { name: /Courriers traités en/ })).toHaveAttribute('aria-valuenow', /^\d+$/)
  await expect(indicators.getByText(/\d+ traités sur \d+/)).toBeVisible()
  await expect(indicators.getByText(/Stockage persistant/)).toBeVisible()

  // Courriers en attente : six plus anciens, ancienneté en badge, « Voir tout » filtre la liste
  const waiting = page.getByRole('region', { name: 'Courriers en attente' })
  await expect(waiting.getByRole('listitem')).toHaveCount(6)
  await expect(waiting.getByText(/^\d+ j$/).first()).toBeVisible()
  await waiting.getByRole('link', { name: 'Voir tout' }).click()
  await expect(page).toHaveURL(/statut=pending/)
  await expect(page.getByRole('radio', { name: /^En attente/ })).toBeChecked()
  await page.goBack()

  // Activité récente
  const activity = page.getByRole('region', { name: 'Activité récente' })
  await expect(activity.getByText('a chargé les données de démonstration')).toBeVisible()
  await expect(activity.getByText(/il y a|dans moins/).first()).toBeVisible()
  await expect(activity.getByText(/a consulté|s’est connecté/)).toHaveCount(0)

  // Un document importé alimente donut, compteur et activité en direct
  await page.goto('/archivage')
  await page.getByLabel('Déposer des documents').setInputFiles({
    name: 'fiche.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 280]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF'),
  })
  await expect(page.getByRole('region', { name: 'File d’import' }).getByLabel(/^Étapes/)).toBeVisible()
  await page.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(page.getByRole('img', { name: 'Répartition des documents par catégorie : 26 documents' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Activité récente' }).getByText('a importé le document')).toBeVisible()
  expect(errors).toEqual([])
})

test('un lecteur voit les chiffres de ce qu’il peut consulter, sans l’activité des autres', async ({ page }) => {
  await firstLaunchWithDemo(page)
  await page.getByRole('link', { name: 'Utilisateurs' }).click()
  await page.getByRole('button', { name: 'Créer un compte' }).click()
  await page.getByLabel('Nom complet').fill('Samir Lecteur')
  await page.getByLabel('Identifiant').fill('samir')
  await page.getByLabel('Rôle').selectOption('reader')
  await page.getByLabel(/^Mot de passe/).fill('un-mot-de-passe')
  await page.getByRole('button', { name: 'Créer le compte' }).click()
  await expect(page.getByRole('table', { name: 'Comptes' }).getByText('samir', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.getByLabel('Identifiant').fill('samir')
  await page.getByLabel('Mot de passe').fill('un-mot-de-passe')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(page.getByText('Bonjour Samir.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Courriers en attente' }).getByRole('listitem')).toHaveCount(6)
  const activity = page.getByRole('region', { name: 'Activité récente' })
  await expect(activity.getByText('a enregistré le courrier').first()).toBeVisible()
  await expect(activity.getByText('a chargé les données de démonstration')).toHaveCount(0)
  await expect(activity.getByText('a créé le compte')).toHaveCount(0)
})
