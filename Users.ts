import type { CollectionConfig } from 'payload'
import { adminOnly, adminOnlyField, authenticated } from '../access/index.js'

/**
 * Le champ `tenants` (array) est injecté automatiquement par le plugin
 * multi-tenant — ne pas le déclarer ici.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Utilisateur', plural: 'Utilisateurs' },
  auth: {
    tokenExpiration: 60 * 60 * 8, // 8 h
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000, // 10 min
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'roles'],
    group: 'Administration',
  },
  access: {
    read: authenticated,
    // Création et suppression réservées à l'admin : un client ne crée jamais
    // de compte, même pour son propre tenant.
    create: adminOnly,
    delete: adminOnly,
    update: authenticated,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nom',
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['editor'],
      label: 'Rôles',
      // Verrou clé : un editor ne peut pas se promouvoir admin.
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      options: [
        { label: 'Administrateur (Polyvaillant)', value: 'admin' },
        { label: 'Client', value: 'editor' },
      ],
    },
  ],
}
