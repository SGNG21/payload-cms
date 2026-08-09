import type { CollectionConfig } from 'payload'
import { adminOnly, authenticated } from '../access/index.js'

/**
 * Un tenant = un site client.
 * Créé uniquement par toi (ou par le script de provisioning Hermes).
 */
export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: { singular: 'Client', plural: 'Clients' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'domain'],
    group: 'Administration',
  },
  access: {
    read: authenticated,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nom du client',
      admin: { description: 'Ex. REB Couverture' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Identifiant technique',
      admin: {
        description: 'Utilisé dans l’URL de l’API publique. Ex. reb-couverture',
      },
      validate: (value: unknown) =>
        typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
          ? true
          : 'Minuscules, chiffres et tirets uniquement.',
    },
    {
      name: 'domain',
      type: 'text',
      label: 'Domaine du site',
      admin: { description: 'Ex. reb-couverture.fr' },
    },
  ],
}
