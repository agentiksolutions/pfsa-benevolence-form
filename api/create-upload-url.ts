import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// JSON body only (tiny) — no bodyParser:false needed. Files go straight to Storage
// via the signed upload URLs this endpoint mints, NOT through the function (that is
// what avoids Vercel's ~4.5 MB request-body limit on the old multipart submit).
export const config = {
  maxDuration: 30,
}

const BUCKET = 'benevolence-files'

// Fields must match the file inputs in index.html.
const ALLOWED_FIELDS = new Set([
  'photo_id',
  'proof_of_income',
  'bill_statement',
  'bank_statements',
  'other_documents',
])

const MAX_FILES = 20
const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB per file
const ALLOWED_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff',
  'pdf', 'doc', 'docx',
])
const ALLOWED_DOC_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

interface ReqFile {
  field: string
  filename: string
  contentType?: string
  size?: number
}

function sanitizeName(name: string): string {
  const base = String(name || 'file').split(/[\\/]/).pop() || 'file' // strip any path
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'file'
}

function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name)
  return m ? m[1].toLowerCase() : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials not configured' })
  }

  let body: unknown = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' })
    }
  }

  const files: ReqFile[] = Array.isArray((body as { files?: unknown })?.files)
    ? ((body as { files: ReqFile[] }).files)
    : []

  if (files.length === 0) {
    return res.status(400).json({ error: 'No files specified' })
  }
  if (files.length > MAX_FILES) {
    return res.status(400).json({ error: `Too many files (max ${MAX_FILES}).` })
  }

  // Validate every file before minting any URL.
  for (const f of files) {
    if (!f || typeof f.field !== 'string' || !ALLOWED_FIELDS.has(f.field)) {
      return res.status(400).json({ error: `Invalid upload field: ${f?.field}` })
    }
    if (!f.filename || typeof f.filename !== 'string') {
      return res.status(400).json({ error: 'Missing file name.' })
    }
    const ext = extOf(f.filename)
    const ct = typeof f.contentType === 'string' ? f.contentType : ''
    const ctOk = ct.startsWith('image/') || ALLOWED_DOC_TYPES.has(ct)
    if (!ctOk && !ALLOWED_EXT.has(ext)) {
      return res.status(400).json({ error: `Unsupported file type: ${f.filename}` })
    }
    if (typeof f.size === 'number' && f.size > MAX_FILE_BYTES) {
      return res.status(400).json({ error: `File too large: ${f.filename} (max 25 MB each).` })
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const uploadId = crypto.randomUUID()

  // Mirrors the legacy path scheme: applications/<id>/<field>/<file>. The same id is
  // sent back to /api/submit-application and used as the row id, so files and record stay paired.
  const uploads: Array<{
    field: string
    filename: string
    storagePath: string
    token: string
    contentType: string
    size: number
  }> = []

  const seen = new Set<string>()
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const safe = sanitizeName(f.filename)
    let key = `${f.field}/${safe}`
    if (seen.has(key)) key = `${f.field}/${i}_${safe}` // guarantee uniqueness within a field
    seen.add(key)
    const storagePath = `applications/${uploadId}/${key}`

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath)

    if (error || !data) {
      console.error('createSignedUploadUrl error:', error)
      return res.status(500).json({ error: 'Could not prepare file upload. Please try again.' })
    }

    uploads.push({
      field: f.field,
      filename: f.filename, // original name, for display
      storagePath,
      token: data.token,
      contentType: (typeof f.contentType === 'string' && f.contentType) || 'application/octet-stream',
      size: typeof f.size === 'number' ? f.size : 0,
    })
  }

  return res.status(200).json({ uploadId, bucket: BUCKET, uploads })
}
