import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const ROUTES = [
  '/tableau-de-bord',
  '/recherche?q=courrier',
  '/courriers/arrives',
  '/courriers/departs',
  '/decrets',
  '/arretes',
  '/notes-de-service',
  '/factures',
  '/journal-operations',
  '/documents',
  '/archivage',
  '/historique',
  '/referentiels/directions',
  '/utilisateurs',
  '/sauvegarde',
  '/parametres',
]

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

/** Attend que les squelettes de chargement aient disparu et que la page ait fini de s'afficher. */
async function settled(page: Page) {
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Chargement' })).toHaveCount(0)
  await page.waitForTimeout(700)
}

async function violations(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return result.violations.map((v) => `${label} : ${v.id} (${v.impact}) ${v.nodes.length} élément(s), par exemple ${v.nodes[0]?.target.join(' ')}`)
}

test('accessibilité : aucune violation WCAG A et AA sur les écrans, en clair et en sombre', async ({ page }) => {
  test.setTimeout(300_000)
  await firstLaunchWithDemo(page)
  const found: string[] = []

  for (const [scheme, size] of [
    ['light', { width: 1440, height: 900 }],
    ['dark', { width: 375, height: 800 }],
  ] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize(size)
    for (const route of ROUTES) {
      await page.goto(route)
      await settled(page)
      found.push(...(await violations(page, `${route} (${scheme}, ${size.width} px)`)))
    }
  }

  // Fiches : courrier, document (visionneuse) et acte
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const [list, row] of [
    ['/courriers/arrives', 1],
    ['/decrets', 1],
    ['/factures', 1],
    ['/documents', 1],
  ] as const) {
    await page.goto(list)
    await settled(page)
    await page.getByRole('table').getByRole('row').nth(row).click()
    await settled(page)
    found.push(...(await violations(page, `fiche de ${list}`)))
  }

  expect(found, found.join('\n')).toEqual([])
})

test('responsive : aucun défilement horizontal de 375 à 1440 px, clair et sombre', async ({ page }) => {
  test.setTimeout(300_000)
  await firstLaunchWithDemo(page)
  const wide: string[] = []

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      for (const route of ROUTES) {
        await page.goto(route)
        await settled(page)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 1) wide.push(`${route} à ${width} px (${scheme}) : ${overflow} px de trop`)
      }
    }
  }
  expect(wide, wide.join('\n')).toEqual([])
})

test('clavier : navigation, ouverture d’une fiche et d’un formulaire sans souris', async ({ page }) => {
  await firstLaunchWithDemo(page)
  await page.goto('/courriers/arrives')
  await settled(page)

  // Le focus est toujours visible : un anneau de 2 px d'accent
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!)
    return { width: style.outlineWidth, style: style.outlineStyle }
  })
  expect(outline).toEqual({ width: '2px', style: 'solid' })

  // Ouvrir une ligne avec Entrée
  const row = page.getByRole('table').getByRole('row').nth(1)
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/courriers\/arrives\/.+/)

  // Palette au clavier : Ctrl K, saisie, flèches, Entrée
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Rechercher un courrier, un document…').fill('décret')
  await expect(page.getByRole('option').first()).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Échap ferme un formulaire sans enregistrer quand rien n'a été saisi
  await page.goto('/courriers/arrives?nouveau=1')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
