/**
 * Provisionne un client complet : tenant + compte de connexion + slots photo.
 *
 * Appelé manuellement ou par Hermes en fin de build.
 *
 *   pnpm tsx scripts/provision-tenant.ts \
 *     --slug reb-couverture \
 *     --name "REB Couverture" \
 *     --domain reb-couverture.fr \
 *     --email fabrice@reb-couverture.fr \
 *     --slots "hero:Photo d'accueil,realisation-1:Réalisation 1,equipe:Photo de l'équipe"
 *
 * Idempotent : relancer le script ne duplique rien.
 * Le mot de passe généré est affiché une seule fois — à transmettre au client
 * par un canal séparé, et à changer à la première connexion.
 */
import { getPayload } from 'payload'
import crypto from 'crypto'
import config from '../payload.config.js'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const run = async () => {
  const slug = arg('slug')
  const name = arg('name')
  const email = arg('email')
  const domain = arg('domain')
  const slotsRaw = arg('slots') ?? ''

  if (!slug || !name || !email) {
    console.error('Arguments requis : --slug, --name, --email')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  // 1. Tenant
  const existing = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })

  const tenant =
    existing.docs[0] ??
    (await payload.create({
      collection: 'tenants',
      data: { name, slug, domain },
      overrideAccess: true,
    }))

  console.log(`Tenant : ${tenant.id} (${slug})`)

  // 2. Compte client
  const users = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })

  let password: string | null = null

  if (!users.docs[0]) {
    password = crypto.randomBytes(12).toString('base64url')
    await payload.create({
      collection: 'users',
      data: {
        email,
        name,
        password,
        roles: ['editor'],
        tenants: [{ tenant: tenant.id }],
      } as any,
      overrideAccess: true,
    })
    console.log(`Compte créé : ${email}`)
  } else {
    console.log(`Compte déjà existant : ${email}`)
  }

  // 3. Slots photo
  const slots = slotsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [key, ...rest] = s.split(':')
      return { key: key.trim(), label: rest.join(':').trim() || key.trim() }
    })

  for (const slot of slots) {
    const found = await payload.find({
      collection: 'media-slots',
      where: {
        and: [{ tenant: { equals: tenant.id } }, { key: { equals: slot.key } }],
      },
      limit: 1,
      overrideAccess: true,
    })

    if (found.docs[0]) {
      console.log(`  slot ${slot.key} — déjà présent`)
      continue
    }

    // Un slot naît sans image : le client dépose la sienne, sinon le site
    // retombe sur l'image du build. C'est le fallback voulu.
    await payload.create({
      collection: 'media-slots',
      data: { key: slot.key, label: slot.label, tenant: tenant.id } as any,
      overrideAccess: true,
    })
    console.log(`  slot ${slot.key} — créé`)
  }

  if (password) {
    console.log(`\nMot de passe initial pour ${email} : ${password}`)
    console.log('À transmettre séparément. Non réaffichable.')
  }

  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
