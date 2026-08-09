import type { Access, FieldAccess } from 'payload'

type Role = 'admin' | 'editor'

/** Un user Payload tel qu'on le manipule ici (le plugin ajoute `tenants`). */
type AppUser = {
  roles?: Role[]
  tenants?: { tenant: string | { id: string } }[] | null
}

export const isAdmin = (user: unknown): boolean =>
  Boolean((user as AppUser | null)?.roles?.includes('admin'))

/**
 * Super-admin : toi. Voit et modifie tous les tenants.
 * Passé au plugin via `userHasAccessToAllTenants`.
 */
export const userHasAccessToAllTenants = (user: unknown): boolean => isAdmin(user)

/** Réservé aux admins. */
export const adminOnly: Access = ({ req }) => isAdmin(req.user)

/**
 * Lecture : admin voit tout, client connecté voit son tenant.
 * Le plugin multi-tenant intersecte automatiquement avec la contrainte de tenant,
 * donc pas besoin de refaire le filtre ici.
 */
export const authenticated: Access = ({ req }) => Boolean(req.user)

/**
 * Les slots photo ne se créent ni ne se suppriment côté client :
 * ils sont provisionnés par Hermes au build du site.
 * Le client ne fait qu'`update`. C'est ce qui l'empêche de casser son site.
 */
export const noCreate: Access = ({ req }) => isAdmin(req.user)
export const noDelete: Access = ({ req }) => isAdmin(req.user)

/** Champs verrouillés : lisibles par tous, modifiables par l'admin seul. */
export const adminOnlyField: FieldAccess = ({ req }) => isAdmin(req.user)
