import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Field } from 'payload'

import { generateSupabasePublicFileURL } from './generateSupabasePublicFileURL.js'

const s3Endpoint = 'https://project-ref.storage.supabase.co/storage/v1/s3'

const findNamedField = (fields: Field[], name: string) =>
  fields.find((field) => 'name' in field && field.name === name)

const runAfterReadHooks = async ({
  data,
  hooks,
  originalDoc = data,
  value,
}: {
  data: Record<string, unknown>
  hooks: readonly ((args: never) => unknown)[] | undefined
  originalDoc?: Record<string, unknown>
  value: unknown
}) => {
  let currentValue = value

  for (const hook of hooks ?? []) {
    currentValue = await hook({
      data,
      originalDoc,
      req: {
        payload: {
          config: { serverURL: '' },
        },
      },
      value: currentValue,
    } as never)
  }

  return currentValue
}

describe('Payload media URL configuration', () => {
  it('generates public URLs for the original file and every configured image size', async () => {
    const previousEnvironment = {
      S3_BUCKET: process.env.S3_BUCKET,
      S3_ENDPOINT: process.env.S3_ENDPOINT,
    }

    process.env.S3_BUCKET = 'media'
    process.env.S3_ENDPOINT = s3Endpoint

    try {
      const { default: configPromise } = await import('../../payload.config.js')
      const config = await configPromise
      const collection = config.collections?.find(
        ({ slug }) => slug === 'media-slots',
      )

      assert.ok(collection)

      const urlField = findNamedField(collection.fields, 'url')
      assert.ok(urlField && 'hooks' in urlField)

      assert.equal(
        await runAfterReadHooks({
          data: { filename: 'hero.jpg' },
          hooks: urlField.hooks?.afterRead,
          value: `${s3Endpoint}/media/hero.jpg`,
        }),
        'https://project-ref.supabase.co/storage/v1/object/public/media/hero.jpg',
      )

      const sizesField = findNamedField(collection.fields, 'sizes')
      assert.ok(sizesField && 'fields' in sizesField)

      for (const sizeName of ['thumbnail', 'card', 'hero']) {
        const sizeField = findNamedField(sizesField.fields, sizeName)
        assert.ok(sizeField && 'fields' in sizeField)

        const sizeURLField = findNamedField(sizeField.fields, 'url')
        assert.ok(sizeURLField && 'hooks' in sizeURLField)

        assert.equal(
          await runAfterReadHooks({
            data: {
              sizes: {
                [sizeName]: { filename: `${sizeName}.jpg` },
              },
            },
            hooks: sizeURLField.hooks?.afterRead,
            value: `${s3Endpoint}/media/${sizeName}.jpg`,
          }),
          `https://project-ref.supabase.co/storage/v1/object/public/media/${sizeName}.jpg`,
        )
      }

      const thumbnailURLField = findNamedField(
        collection.fields,
        'thumbnailURL',
      )
      assert.ok(thumbnailURLField && 'hooks' in thumbnailURLField)
      assert.equal(
        await runAfterReadHooks({
          data: { filename: 'hero.jpg' },
          hooks: thumbnailURLField.hooks?.afterRead,
          value: undefined,
        }),
        null,
      )
    } finally {
      if (previousEnvironment.S3_BUCKET === undefined) {
        delete process.env.S3_BUCKET
      } else {
        process.env.S3_BUCKET = previousEnvironment.S3_BUCKET
      }

      if (previousEnvironment.S3_ENDPOINT === undefined) {
        delete process.env.S3_ENDPOINT
      } else {
        process.env.S3_ENDPOINT = previousEnvironment.S3_ENDPOINT
      }
    }
  })
})

describe('generateSupabasePublicFileURL', () => {
  it('converts a Supabase S3 endpoint to its public object URL', () => {
    assert.equal(
      generateSupabasePublicFileURL({
        bucket: 'media',
        filename: 'hero.jpg',
        s3Endpoint,
      }),
      'https://project-ref.supabase.co/storage/v1/object/public/media/hero.jpg',
    )
  })

  it('preserves a document prefix and encodes the filename', () => {
    assert.equal(
      generateSupabasePublicFileURL({
        bucket: 'media',
        filename: 'photo été.jpg',
        prefix: 'tenants/site-a',
        s3Endpoint: `${s3Endpoint}/`,
      }),
      'https://project-ref.supabase.co/storage/v1/object/public/media/tenants/site-a/photo%20%C3%A9t%C3%A9.jpg',
    )
  })

  it('uses the same decoded prefix as the cloud-storage object key', () => {
    assert.equal(
      generateSupabasePublicFileURL({
        bucket: 'media',
        filename: 'hero.jpg',
        prefix: 'tenants%2Fsite-a',
        s3Endpoint,
      }),
      'https://project-ref.supabase.co/storage/v1/object/public/media/tenants/site-a/hero.jpg',
    )
  })

  it('rejects endpoints outside the Supabase S3 API', () => {
    assert.throws(
      () =>
        generateSupabasePublicFileURL({
          bucket: 'media',
          filename: 'hero.jpg',
          s3Endpoint: 'https://s3.example.com',
        }),
      /Supabase S3 endpoint/,
    )
  })
})
