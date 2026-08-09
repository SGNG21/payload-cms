import type { Endpoint, PayloadRequest } from 'payload'

/**
 * GET /api/public/sites/:slug/media
 *
 * Renvoie le mapping { key -> url } des photos d'un site.
 * Public et non authentifié : ce sont des images déjà visibles sur un site public.
 *
 * `overrideAccess: true` est volontaire et sûr ici parce que le filtre par
 * tenant est appliqué explicitement ci-dessous à partir du slug de l'URL.
 * Ne jamais copier ce pattern sur une collection contenant des données privées.
 */
export const publicMediaEndpoint: Endpoint = {
  path: '/public/sites/:slug/media',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const slug = req.routeParams?.slug

    if (typeof slug !== 'string') {
      return Response.json({ error: 'Slug manquant.' }, { status: 400 })
    }

    const tenants = await req.payload.find({
      collection: 'tenants',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const tenant = tenants.docs[0]

    if (!tenant) {
      return Response.json({ error: 'Site inconnu.' }, { status: 404 })
    }

    const slots = await req.payload.find({
      collection: 'media-slots',
      where: { tenant: { equals: tenant.id } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })

    const media = Object.fromEntries(
      slots.docs.map((doc) => {
        const d = doc as Record<string, any>
        return [
          d.key,
          {
            url: d.url,
            alt: d.alt ?? '',
            width: d.width ?? null,
            height: d.height ?? null,
            sizes: d.sizes ?? {},
            updatedAt: d.updatedAt,
          },
        ]
      }),
    )

    return Response.json(
      { site: slug, media },
      {
        headers: {
          // Cache court : une photo remplacée est visible en ~1 min,
          // sans rebuild Vercel et sans marteler la base.
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  },
}
