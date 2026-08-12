import path from 'path'
import { sanitizeFilename } from 'payload/shared'

type GenerateSupabasePublicFileURLArgs = {
  bucket: string
  filename: string
  prefix?: string
  s3Endpoint?: string
}

const sanitizePrefix = (prefix: string): string => {
  let decodedPrefix: string

  try {
    decodedPrefix = decodeURIComponent(prefix)
  } catch {
    return ''
  }

  if (/%[0-9a-f]{2}/i.test(decodedPrefix)) {
    return ''
  }

  return decodedPrefix
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '.' && segment !== '..')
    .join('/')
    .replace(/^\/+/, '')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
}

export const generateSupabasePublicFileURL = ({
  bucket,
  filename,
  prefix,
  s3Endpoint,
}: GenerateSupabasePublicFileURLArgs): string => {
  if (!s3Endpoint) {
    throw new Error('A Supabase S3 endpoint is required to generate public media URLs.')
  }

  const publicURL = new URL(s3Endpoint)
  const s3Path = publicURL.pathname.replace(/\/+$/, '')

  if (
    !publicURL.hostname.endsWith('.storage.supabase.co') ||
    s3Path !== '/storage/v1/s3'
  ) {
    throw new Error(`Invalid Supabase S3 endpoint: ${s3Endpoint}`)
  }

  const safePrefix = prefix ? sanitizePrefix(prefix) : ''
  const rawFileKey = path.posix.join(safePrefix, sanitizeFilename(filename))
  const directory = path.posix.dirname(rawFileKey)
  const encodedFilename = encodeURIComponent(path.posix.basename(rawFileKey))
  const fileKey =
    directory === '.'
      ? encodedFilename
      : path.posix.join(directory, encodedFilename)

  publicURL.hostname = publicURL.hostname.replace(
    '.storage.supabase.co',
    '.supabase.co',
  )
  publicURL.pathname = path.posix.join(
    '/storage/v1/object/public',
    bucket,
    fileKey,
  )
  publicURL.search = ''
  publicURL.hash = ''

  return publicURL.toString()
}
