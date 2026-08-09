import type { CollectionConfig } from 'payload'
import { authenticated, noCreate, noDelete, adminOnlyField } from '../access/index.js'

/**
 * Le cœur du système.
 *
 * Un slot = un emplacement photo nommé sur le site du client
 * ("Photo d'accueil", "Réalisation 1"...). Le client ne crée rien,
 * ne supprime rien : il remplace l'image d'un slot existant.
 *
 * Les slots sont provisionnés par Hermes au build du site, puisqu'il
 * connaît déjà les emplacements du template.
 */
export const MediaSlots: CollectionConfig = {
  slug: 'media-slots',
  labels: { singular: 'Photo', plural: 'Photos du site' },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'key', 'updatedAt'],
    description:
      'Remplacez une photo en cliquant dessus, puis en déposant votre nouvelle image. La mise en ligne est immédiate.',
  },
  upload: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    focalPoint: true,
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 900, position: 'centre' },
      { name: 'hero', width: 1920, position: 'centre' },
    ],
  },
  access: {
    read: authenticated,
    create: noCreate,
    delete: noDelete,
    // Le plugin multi-tenant intersecte avec la contrainte de tenant :
    // un editor ne peut mettre à jour que les slots de son client.
    update: authenticated,
  },
  fields: [
    {
      name: 'key',
      type: 'text',
      required: true,
      index: true,
      label: 'Clé technique',
      admin: {
        readOnly: true,
        description: 'Référence utilisée par le site. Ne pas modifier.',
      },
      access: { update: adminOnlyField },
    },
    {
      name: 'label',
      type: 'text',
      required: true,
      label: 'Emplacement',
      admin: {
        readOnly: true,
        description: 'Ex. Photo d’accueil, Réalisation 1',
      },
      access: { update: adminOnlyField },
    },
    {
      name: 'alt',
      type: 'text',
      label: 'Description de l’image',
      admin: {
        description:
          'Décrit la photo pour les personnes malvoyantes et pour Google. Ex. « Toiture en tuiles rénovée à Joigny ».',
      },
    },
  ],
  indexes: [
    // Une clé est unique par tenant, pas globalement.
    { fields: ['tenant', 'key'], unique: true },
  ],
}
