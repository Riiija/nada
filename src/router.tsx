import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { ComingSoonPage } from '@/app/ComingSoonPage'
import { allItems } from '@/app/navigation'
import { RequireAccess } from '@/app/RequireAccess'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthGate } from '@/features/auth/AuthGate'
import { BackupPage } from '@/features/backup/BackupPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DocumentPage } from '@/features/documents/DocumentPage'
import { DocumentsListPage } from '@/features/documents/DocumentsListPage'
import { ArchivagePage } from '@/features/imports/ArchivagePage'
import { HistoryPage } from '@/features/history/HistoryPage'
import { MailDetailPage } from '@/features/mails/MailDetailPage'
import { MailsListPage } from '@/features/mails/MailsListPage'
import { ReferencesPage } from '@/features/referentiels/ReferencesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { RegisterDetailPage } from '@/features/registers/RegisterDetailPage'
import { RegisterListPage } from '@/features/registers/RegisterListPage'
import { registerList } from '@/features/registers/config'
import { SearchPage } from '@/features/search/SearchPage'
import { UsersPage } from '@/features/users/UsersPage'

/** Écrans construits ; les autres affichent « pas encore construit ». */
const pages: Record<string, ReactNode> = {
  '/tableau-de-bord': <DashboardPage />,
  '/historique': <HistoryPage />,
  '/sauvegarde': <BackupPage />,
  '/recherche': <SearchPage />,
  '/decrets': <RegisterListPage type="decrees" />,
  '/arretes': <RegisterListPage type="ministerialOrders" />,
  '/notes-de-service': <RegisterListPage type="serviceNotes" />,
  '/factures': <RegisterListPage type="incomingInvoices" />,
  '/journal-operations': <RegisterListPage type="ledgerEntries" />,
  '/documents': <DocumentsListPage />,
  '/archivage': <ArchivagePage />,
  '/courriers/arrives': <MailsListPage flow="incoming" />,
  '/courriers/departs': <MailsListPage flow="outgoing" />,
  '/referentiels/directions': <ReferencesPage />,
  '/utilisateurs': <UsersPage />,
  '/parametres': <SettingsPage />,
}

const routes = allItems.map((item) => ({
  path: item.to.startsWith('/referentiels/') ? 'referentiels/:type' : item.to.slice(1),
  element: <RequireAccess item={item}>{pages[item.to] ?? <ComingSoonPage item={item} />}</RequireAccess>,
}))

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthGate>
        <AppLayout />
      </AuthGate>
    ),
    children: [
      { index: true, element: <Navigate to="/tableau-de-bord" replace /> },
      ...routes,
      { path: 'documents/:id', element: <DocumentPage /> },
      ...registerList.map((c) => ({ path: `${c.slug}/:id`, element: <RegisterDetailPage type={c.type} /> })),
      { path: 'courriers/arrives/:id', element: <MailDetailPage flow="incoming" /> },
      { path: 'courriers/departs/:id', element: <MailDetailPage flow="outgoing" /> },
      { path: '*', element: <Navigate to="/tableau-de-bord" replace /> },
    ],
  },
])
