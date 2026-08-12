import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { fr } from '@payloadcms/translations/languages/fr'
import { en } from '@payloadcms/translations/languages/en'

import { Tenants } from './src/collections/Tenants.js'
import { Users } from './src/collections/Users.js'
import { MediaSlots } from './src/collections/MediaSlots.js'
import { publicMediaEndpoint } from './src/endpoints/publicMedia.js'
import { userHasAccessToAllTenants } from './src/access/index.js'
import { generateSupabasePublicFileURL } from './src/utilities/generateSupabasePublicFileURL.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' — Espace client Polyvaillant',
    },
  },

  // Back-office en français par défaut pour les clients.
  i18n: {
    supportedLanguages: { fr, en },
    fallbackLanguage: 'fr',
  },

  collections: [Tenants, Users, MediaSlots],
  endpoints: [publicMediaEndpoint],

  // Requis pour le redimensionnement d'image (thumbnail/card/hero) sur media-slots.
  sharp,

  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',

  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    // Payload gère son propre schéma. On l'isole pour ne jamais entrer
    // en collision avec un schéma applicatif existant.
    schemaName: 'payload',
  }),

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  plugins: [
    multiTenantPlugin({
      userHasAccessToAllTenants,
      collections: {
        'media-slots': {},
      },
    }),

    // Stockage sur Supabase Storage (S3-compatible), pas Vercel Blob :
    // tout l'écosystème reste Supabase pour ce projet.
    s3Storage({
      collections: {
        'media-slots': {
          generateFileURL: ({ filename, prefix }) =>
            generateSupabasePublicFileURL({
              bucket: process.env.S3_BUCKET || '',
              filename,
              prefix,
              s3Endpoint: process.env.S3_ENDPOINT,
            }),
        },
      },
      bucket: process.env.S3_BUCKET || '',
      config: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        // Obligatoire pour Supabase Storage : sans ça, le SDK AWS construit
        // des URLs virtual-hosted-style (bucket.endpoint) que Supabase ne sert
        // pas, et la signature de la requête est rejetée.
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  ],

  cors: '*',
})
