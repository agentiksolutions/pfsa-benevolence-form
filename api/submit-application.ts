import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import Busboy from 'busboy'
import { Resend } from 'resend'
import { Readable } from 'stream'
import crypto from 'crypto'

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
}

// ─── Types ───────────────────────────────────────────────────────────

interface FileUpload {
  fieldName: string
  fileName: string
  storagePath: string
  sizeBytes: number
  contentType: string
  buffer: Buffer
}

interface ScoreResult {
  score: number
  detail: string
  [key: string]: unknown
}

interface RecommendationResult {
  autoTotal: number
  maxAutoPoints: number
  lowEstimate: number
  midEstimate: number
  highEstimate: number
  bracket: string
  recommendation: string
}

// ─── Multipart Parser ────────────────────────────────────────────────

function parseMultipart(req: VercelRequest): Promise<{ fields: Record<string, string>; files: FileUpload[] }> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    const files: FileUpload[] = []

    const busboy = Busboy({
      headers: req.headers as Record<string, string>,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
    })

    busboy.on('field', (name: string, value: string) => {
      fields[name] = value
    })

    busboy.on('file', (name: string, stream: NodeJS.ReadableStream, info: { filename: string; encoding: string; mimeType: string }) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        if (info.filename && chunks.length > 0) {
          const buffer = Buffer.concat(chunks)
          files.push({
            fieldName: name,
            fileName: info.filename,
            storagePath: '', // set later with application ID
            sizeBytes: buffer.length,
            contentType: info.mimeType,
            buffer,
          })
        }
      })
    })

    busboy.on('finish', () => resolve({ fields, files }))
    busboy.on('error', reject)

    // Vercel may pre-buffer the body even with bodyParser disabled
    if ((req as any).readable === false || Buffer.isBuffer((req as any).body)) {
      const body = (req as any).body
      const readable = Readable.from(Buffer.isBuffer(body) ? body : Buffer.from(body))
      readable.pipe(busboy)
    } else {
      req.pipe(busboy)
    }
  })
}

// ─── Scoring Functions (exact port from client-side) ─────────────────

function scoreCompleteness(fields: Record<string, string>, files: FileUpload[]): ScoreResult {
  const requiredFields = [
    'full_name', 'date_of_birth', 'primary_phone', 'email',
    'address', 'city', 'state', 'zip', 'employer',
    'monthly_gross_income', 'monthly_net_income', 'total_monthly_income',
    'amount_requested', 'funds_deadline', 'explanation', 'signature',
  ]

  let filledCount = 0
  for (const name of requiredFields) {
    if (fields[name] && fields[name].trim() !== '') filledCount++
  }

  // Check radio buttons
  if (fields['receives_services']) filledCount++
  if (fields['other_assistance']) filledCount++

  const totalRequired = requiredFields.length + 2

  // Check required file uploads
  const requiredFileNames = ['photo_id', 'proof_of_income', 'bill_statement']
  let filesUploaded = 0
  for (const name of requiredFileNames) {
    if (files.some(f => f.fieldName === name)) filesUploaded++
  }

  const fieldPct = filledCount / totalRequired
  const filePct = filesUploaded / requiredFileNames.length
  const combined = (fieldPct * 0.6) + (filePct * 0.4)

  const tag = `(${filledCount}/${totalRequired} fields, ${filesUploaded}/${requiredFileNames.length} docs)`
  if (combined >= 0.95) return { score: 5, detail: `Fully complete ${tag}` }
  if (combined >= 0.80) return { score: 4, detail: `Mostly complete with minor gaps ${tag}` }
  if (combined >= 0.65) return { score: 3, detail: `Some gaps ${tag}` }
  if (combined >= 0.45) return { score: 2, detail: `Key items missing ${tag}` }
  if (combined >= 0.25) return { score: 1, detail: `Incomplete ${tag}` }
  return { score: 0, detail: `Missing major documents ${tag}` }
}

function scoreFinancial(fields: Record<string, string>): ScoreResult {
  const grossIncome = parseFloat(fields['monthly_gross_income']) || 0
  const netIncome = parseFloat(fields['monthly_net_income']) || 0
  const totalIncome = parseFloat(fields['total_monthly_income']) || 0
  const savings = parseFloat(fields['liquid_savings']) || 0

  const expRent = parseFloat(fields['expense_rent']) || 0
  const expUtil = parseFloat(fields['expense_utilities']) || 0
  const expFood = parseFloat(fields['expense_food']) || 0
  const expTransport = parseFloat(fields['expense_transportation']) || 0
  const expInsurance = parseFloat(fields['expense_insurance']) || 0
  const expChildcare = parseFloat(fields['expense_childcare']) || 0
  const expOther = parseFloat(fields['expense_other']) || 0

  const totalExpenses = expRent + expUtil + expFood + expTransport + expInsurance + expChildcare + expOther
  const incomeUsed = totalIncome > 0 ? totalIncome : netIncome
  const gap = incomeUsed - totalExpenses
  const gapPct = incomeUsed > 0 ? (gap / incomeUsed) * 100 : -100
  const requestAmt = parseFloat(fields['amount_requested']) || 0
  const savingsCoversRequest = savings >= requestAmt

  let score = 0
  let detail = ''

  if (incomeUsed === 0 && totalExpenses === 0) {
    return {
      score: 5,
      detail: 'Insufficient financial data provided — cannot fully assess from numbers alone',
      totalIncome: 0, totalExpenses: 0, monthlyGap: 0, savings, requestAmount: requestAmt,
    }
  }

  if (gap > 0 && gapPct > 20 && savingsCoversRequest) {
    score = 1
    detail = `Income exceeds expenses by ${gapPct.toFixed(0)}%, savings cover request`
  } else if (gap > 0 && gapPct > 10) {
    score = 3
    detail = `Income slightly exceeds expenses by ${gapPct.toFixed(0)}%`
  } else if (gap > 0 && gapPct > 0) {
    score = 5
    detail = `Income barely exceeds expenses by ${gapPct.toFixed(0)}%`
  } else if (gap >= -50 && gap <= 50) {
    score = 7
    detail = `Income roughly equal to expenses (gap: $${Math.abs(gap).toFixed(2)})`
  } else if (gap < 0 && gapPct >= -20) {
    score = 8
    detail = `Expenses exceed income by $${Math.abs(gap).toFixed(2)}/mo (${Math.abs(gapPct).toFixed(0)}%)`
  } else if (gap < 0 && gapPct >= -40) {
    score = 9
    detail = `Expenses significantly exceed income by $${Math.abs(gap).toFixed(2)}/mo (${Math.abs(gapPct).toFixed(0)}%)`
  } else {
    score = 10
    detail = `Severe deficit: expenses exceed income by $${Math.abs(gap).toFixed(2)}/mo`
  }

  // Savings modifier
  if (savings <= 0 && score >= 5) score = Math.min(10, score + 1)
  if (savingsCoversRequest && score >= 5) score = Math.max(3, score - 2)

  score = Math.max(0, Math.min(10, score))

  return {
    score,
    detail,
    totalIncome: incomeUsed,
    totalExpenses,
    monthlyGap: gap,
    savings,
    requestAmount: requestAmt,
  }
}

function scoreCrisis(fields: Record<string, string>): ScoreResult {
  const severityMap: Record<string, number> = {
    'assist_rent': 5,
    'assist_utilities': 4,
    'assist_medical': 5,
    'assist_food': 4,
    'assist_transportation': 3,
    'assist_home_repair': 3,
    'assist_other': 2,
  }

  let maxSeverity = 0
  const assistTypes: string[] = []
  for (const [name, severity] of Object.entries(severityMap)) {
    if (fields[name] === 'Yes') {
      maxSeverity = Math.max(maxSeverity, severity)
      assistTypes.push(name.replace('assist_', '').replace(/_/g, ' '))
    }
  }

  // Urgency based on deadline proximity
  const deadlineStr = fields['funds_deadline']
  let daysUntil = 999
  let urgencyLabel = 'No deadline provided'
  if (deadlineStr) {
    const deadline = new Date(deadlineStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil < 0) urgencyLabel = `PAST DUE (${Math.abs(daysUntil)} days ago)`
    else if (daysUntil <= 3) urgencyLabel = `CRITICAL (${daysUntil} days)`
    else if (daysUntil <= 7) urgencyLabel = `URGENT (${daysUntil} days)`
    else if (daysUntil <= 14) urgencyLabel = `MODERATE (${daysUntil} days)`
    else urgencyLabel = `STANDARD (${daysUntil} days)`
  }

  let urgencyBonus = 0
  if (daysUntil < 0) urgencyBonus = 2
  else if (daysUntil <= 3) urgencyBonus = 2
  else if (daysUntil <= 7) urgencyBonus = 1

  const baseSeverity = Math.round(maxSeverity * 0.6)
  let score = Math.min(5, baseSeverity + urgencyBonus)

  if (assistTypes.length === 0) score = 0

  const detail = `Type: ${assistTypes.length > 0 ? assistTypes.join(', ') : 'None selected'} | Urgency: ${urgencyLabel}`

  return { score, detail, daysUntilDeadline: daysUntil, urgencyLabel }
}

function scoreAlternatives(fields: Record<string, string>): ScoreResult {
  const soughtHelp = fields['other_assistance']
  const helpDetails = (fields['other_assistance_details'] || '').trim()
  const receivesServices = fields['receives_services']
  const servicesList = (fields['services_list'] || '').trim()

  let score = 0
  let detail = ''

  if (!soughtHelp || soughtHelp === 'No') {
    if (receivesServices === 'Yes' && servicesList.length > 0) {
      score = 2
      detail = `No other assistance sought, but receives services (${servicesList})`
    } else {
      score = 1
      detail = 'No attempt to seek other help documented'
    }
  } else {
    if (helpDetails.length > 50) {
      score = 5
      detail = `Detailed alternatives documented: ${helpDetails.substring(0, 80)}${helpDetails.length > 80 ? '...' : ''}`
    } else if (helpDetails.length > 15) {
      score = 4
      detail = `Alternatives explored with some detail: ${helpDetails}`
    } else if (helpDetails.length > 0) {
      score = 3
      detail = `Some alternatives noted: ${helpDetails}`
    } else {
      score = 2
      detail = 'Indicated yes to other assistance but no details provided'
    }
  }

  return { score, detail }
}

function getRecommendation(autoTotal: number): RecommendationResult {
  const maxAutoPoints = 25
  const lowEstimate = autoTotal
  const midEstimate = autoTotal + 5
  const highEstimate = autoTotal + 10

  let bracket = ''
  let recommendation = ''

  if (lowEstimate >= 20) {
    bracket = 'LIKELY HIGH NEED (30-35 range possible)'
    recommendation = 'Strong preliminary case. Even with conservative scoring on Past Assistance & Verification, likely qualifies for approval or partial approval.'
  } else if (midEstimate >= 20 && midEstimate < 30) {
    bracket = 'LIKELY MODERATE NEED (20-29 range)'
    recommendation = 'Preliminary data supports moderate need. Final recommendation depends heavily on Past Assistance record and document verification (Categories 5-6).'
  } else if (midEstimate >= 10) {
    bracket = 'BORDERLINE (10-19 range possible)'
    recommendation = 'Preliminary data shows limited need indicators. Reviewer should carefully evaluate crisis explanation and verify all documentation before scoring.'
  } else {
    bracket = 'LOW INDICATORS (below 10 likely)'
    recommendation = 'Preliminary data does not strongly indicate need based on submitted information. Reviewer should confirm all data and check for extenuating circumstances not captured in form fields.'
  }

  return { autoTotal, maxAutoPoints, lowEstimate, midEstimate, highEstimate, bracket, recommendation }
}

// ─── Household Members ───────────────────────────────────────────────

function assembleHouseholdMembers(fields: Record<string, string>): Array<{ name: string; relation: string; age: string; employment: string }> {
  const members: Array<{ name: string; relation: string; age: string; employment: string }> = []
  for (let i = 1; i <= 20; i++) {
    const name = (fields[`hh_name_${i}`] || '').trim()
    if (!name) continue
    members.push({
      name,
      relation: (fields[`hh_relation_${i}`] || '').trim(),
      age: (fields[`hh_age_${i}`] || '').trim(),
      employment: (fields[`hh_employment_${i}`] || '').trim(),
    })
  }
  return members
}

// ─── Email Template ──────────────────────────────────────────────────

function buildNotificationEmail(
  appId: string,
  fields: Record<string, string>,
  completeness: ScoreResult,
  financial: ScoreResult,
  crisis: ScoreResult,
  alternatives: ScoreResult,
  rec: RecommendationResult,
): string {
  const totalIncome = financial.totalIncome as number
  const totalExpenses = financial.totalExpenses as number
  const monthlyGap = financial.monthlyGap as number
  const savings = financial.savings as number
  const requestAmount = financial.requestAmount as number

  const urgencyLabel = crisis.urgencyLabel as string
  const urgencyColor = urgencyLabel.startsWith('PAST DUE') || urgencyLabel.startsWith('CRITICAL')
    ? '#9B1C1C'
    : urgencyLabel.startsWith('URGENT')
      ? '#B8860B'
      : '#2E6B3A'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#1B3A5C;padding:32px 40px;text-align:center;border-radius:12px 12px 0 0;">
              <h1 style="color:#ffffff;font-size:18px;margin:0 0 4px 0;font-weight:bold;">THE PUBLIC FOUNDATION</h1>
              <p style="color:#ffffff;font-size:12px;margin:0 0 4px 0;font-style:italic;">for</p>
              <h1 style="color:#ffffff;font-size:18px;margin:0 0 12px 0;font-weight:bold;">STEWARDSHIP ADVANCEMENT, INC.</h1>
              <hr style="border:none;border-top:1px solid #B8860B;margin:8px 60px;">
              <p style="color:#B8860B;font-size:14px;margin:8px 0 0 0;font-weight:bold;">Benevolence Application Received</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;">
              <!-- Applicant Summary -->
              <h2 style="color:#1B3A5C;font-size:18px;margin:0 0 16px 0;">Applicant Summary</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border-radius:8px;margin:0 0 24px 0;">
                <tr><td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Name:</td>
                      <td style="color:#1B3A5C;font-size:13px;padding:4px 0;font-weight:bold;text-align:right;">${fields['full_name'] || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Email:</td>
                      <td style="color:#333;font-size:13px;padding:4px 0;text-align:right;">${fields['email'] || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Phone:</td>
                      <td style="color:#333;font-size:13px;padding:4px 0;text-align:right;">${fields['primary_phone'] || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Amount Requested:</td>
                      <td style="color:#9B1C1C;font-size:14px;padding:4px 0;font-weight:bold;text-align:right;">$${requestAmount.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Deadline:</td>
                      <td style="color:${urgencyColor};font-size:13px;padding:4px 0;font-weight:bold;text-align:right;">${urgencyLabel}</td>
                    </tr>
                  </table>
                </td></tr>
              </table>

              <!-- Score Breakdown -->
              <h2 style="color:#1B3A5C;font-size:18px;margin:0 0 16px 0;">Auto-Score Breakdown</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
                <tr>
                  <td style="padding:8px 12px;background:#f1f5f9;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;">1. Completeness & Documentation</td>
                  <td style="padding:8px 12px;background:#f1f5f9;border-radius:6px 6px 0 0;font-size:14px;font-weight:bold;color:#1B3A5C;text-align:right;">${completeness.score}/5</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:4px 12px 8px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${completeness.detail}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;font-size:13px;color:#64748b;">2. Financial Assessment</td>
                  <td style="padding:8px 12px;font-size:14px;font-weight:bold;color:#1B3A5C;text-align:right;">${financial.score}/10</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:4px 12px 8px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${financial.detail}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;background:#f1f5f9;font-size:13px;color:#64748b;">3. Crisis Severity & Urgency</td>
                  <td style="padding:8px 12px;background:#f1f5f9;font-size:14px;font-weight:bold;color:#1B3A5C;text-align:right;">${crisis.score}/5</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:4px 12px 8px;background:#f1f5f9;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${crisis.detail}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;font-size:13px;color:#64748b;">4. Alternatives Explored</td>
                  <td style="padding:8px 12px;font-size:14px;font-weight:bold;color:#1B3A5C;text-align:right;">${alternatives.score}/5</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:4px 12px 8px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${alternatives.detail}</td>
                </tr>
              </table>

              <!-- Total & Bracket -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1B3A5C;border-radius:8px;margin:0 0 24px 0;">
                <tr><td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Auto-Score Subtotal:</td>
                      <td style="color:#ffffff;font-size:16px;padding:4px 0;font-weight:bold;text-align:right;">${rec.autoTotal}/25</td>
                    </tr>
                    <tr>
                      <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Estimated Full Range:</td>
                      <td style="color:#ffffff;font-size:13px;padding:4px 0;text-align:right;">${rec.lowEstimate} to ${rec.highEstimate} out of 35</td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding:8px 0 0 0;border-top:1px solid #334155;">
                        <span style="color:#B8860B;font-size:14px;font-weight:bold;">${rec.bracket}</span>
                      </td>
                    </tr>
                  </table>
                </td></tr>
              </table>

              <!-- Financial Snapshot -->
              <h2 style="color:#1B3A5C;font-size:18px;margin:0 0 16px 0;">Financial Snapshot</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border-radius:8px;margin:0 0 24px 0;">
                <tr><td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Monthly Income:</td>
                      <td style="color:#333;font-size:13px;padding:4px 0;text-align:right;">$${totalIncome.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Monthly Expenses:</td>
                      <td style="color:#333;font-size:13px;padding:4px 0;text-align:right;">$${totalExpenses.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Monthly Gap:</td>
                      <td style="color:${monthlyGap < 0 ? '#9B1C1C' : '#2E6B3A'};font-size:13px;padding:4px 0;font-weight:bold;text-align:right;">$${monthlyGap.toFixed(2)}${monthlyGap < 0 ? ' (DEFICIT)' : ''}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;font-size:13px;padding:4px 0;">Liquid Savings:</td>
                      <td style="color:#333;font-size:13px;padding:4px 0;text-align:right;">$${savings.toFixed(2)}</td>
                    </tr>
                  </table>
                </td></tr>
              </table>

              <!-- Recommendation -->
              <div style="border-left:3px solid #B8860B;padding:12px 16px;margin:0 0 24px 0;background-color:#fffbeb;">
                <p style="color:#333;font-size:13px;line-height:1.5;margin:0;">
                  <strong>Recommendation:</strong> ${rec.recommendation}
                </p>
              </div>

              <!-- Review Link -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <a href="https://app.thepfsa.org/benevolence/${appId}" style="display:inline-block;background-color:#B8860B;color:#ffffff;font-size:14px;font-weight:bold;padding:12px 32px;border-radius:8px;text-decoration:none;">Review Application</a>
                  </td>
                </tr>
              </table>

              <p style="color:#64748b;font-size:12px;text-align:center;margin:0;">
                Reviewer must score Category 5 (Past Assistance) and Category 6 (Verification) to finalize.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#1e293b;padding:24px 40px;text-align:center;border-radius:0 0 12px 12px;">
              <p style="color:#94a3b8;font-size:11px;margin:0 0 4px 0;">
                The PFSA, Inc. | 3040 Sewanee Lane, Lexington, KY 40509
              </p>
              <p style="color:#94a3b8;font-size:11px;margin:0 0 4px 0;">
                info@thepfsa.org | 859-314-3051
              </p>
              <p style="color:#64748b;font-size:10px;margin:8px 0 0 0;">
                This is an automated notification. Do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Main Handler ────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendApiKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Parse multipart form data
  let fields: Record<string, string>
  let files: FileUpload[]
  try {
    const parsed = await parseMultipart(req)
    fields = parsed.fields
    files = parsed.files
  } catch (err) {
    console.error('Multipart parse error:', err)
    return res.status(400).json({ error: 'Failed to parse form data' })
  }

  // 2. Validate required fields
  const requiredFields = ['full_name', 'email', 'phone', 'primary_phone', 'address', 'city', 'state', 'zip']
  const missing = requiredFields.filter(f => !fields[f] || !fields[f].trim())
  // Use primary_phone or phone (form uses primary_phone)
  if (!fields['primary_phone'] && fields['phone']) fields['primary_phone'] = fields['phone']
  if (!fields['phone'] && fields['primary_phone']) fields['phone'] = fields['primary_phone']

  const actualMissing = ['full_name', 'email', 'address', 'city', 'state', 'zip'].filter(
    f => !fields[f] || !fields[f].trim()
  )
  if (actualMissing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${actualMissing.join(', ')}` })
  }

  // 3. Assemble household members
  const householdMembers = assembleHouseholdMembers(fields)

  // 4. Generate application UUID
  const applicationId = crypto.randomUUID()

  // 5. Upload files to Supabase Storage
  const uploadedFiles: Array<{ field_name: string; file_name: string; storage_path: string; size_bytes: number; content_type: string }> = []
  for (const file of files) {
    const storagePath = `applications/${applicationId}/${file.fieldName}/${file.fileName}`
    const { error: uploadError } = await supabase.storage
      .from('benevolence-files')
      .upload(storagePath, file.buffer, {
        contentType: file.contentType,
        upsert: false,
      })

    if (uploadError) {
      console.error(`File upload error (${file.fileName}):`, uploadError)
      // Continue with other files rather than failing entirely
    } else {
      uploadedFiles.push({
        field_name: file.fieldName,
        file_name: file.fileName,
        storage_path: storagePath,
        size_bytes: file.sizeBytes,
        content_type: file.contentType,
      })
    }
  }

  // 6. Run server-side scoring
  const completeness = scoreCompleteness(fields, files)
  const financial = scoreFinancial(fields)
  const crisis = scoreCrisis(fields)
  const alternatives = scoreAlternatives(fields)

  const autoTotal = completeness.score + financial.score + crisis.score + alternatives.score
  const rec = getRecommendation(autoTotal)

  // Compute expenses total and gap
  const computedTotalExpenses =
    (parseFloat(fields['expense_rent']) || 0) +
    (parseFloat(fields['expense_utilities']) || 0) +
    (parseFloat(fields['expense_food']) || 0) +
    (parseFloat(fields['expense_transportation']) || 0) +
    (parseFloat(fields['expense_insurance']) || 0) +
    (parseFloat(fields['expense_childcare']) || 0) +
    (parseFloat(fields['expense_other']) || 0)
  const incomeUsed = parseFloat(fields['total_monthly_income']) || parseFloat(fields['monthly_net_income']) || 0
  const computedMonthlyGap = incomeUsed - computedTotalExpenses

  // Build score summary text
  const scoreSummary = [
    `1. Completeness: ${completeness.score}/5 - ${completeness.detail}`,
    `2. Financial: ${financial.score}/10 - ${financial.detail}`,
    `3. Crisis: ${crisis.score}/5 - ${crisis.detail}`,
    `4. Alternatives: ${alternatives.score}/5 - ${alternatives.detail}`,
    `Auto Total: ${autoTotal}/25 | Bracket: ${rec.bracket}`,
  ].join('\n')

  // 7. Insert record into database
  const { error: insertError } = await supabase
    .from('benevolence_applications')
    .insert({
      id: applicationId,
      full_name: fields['full_name'],
      email: fields['email'],
      phone: fields['primary_phone'] || fields['phone'],
      secondary_phone: fields['secondary_phone'] || null,
      address: fields['address'],
      city: fields['city'],
      state: fields['state'],
      zip: fields['zip'],
      date_of_birth: fields['date_of_birth'] || null,
      preferred_name: fields['preferred_name'] || null,
      community_duration: fields['community_duration'] || null,
      application_date: fields['application_date'] || null,
      household_members: householdMembers,
      receives_services: fields['receives_services'] || null,
      services_list: fields['services_list'] || null,
      employer: fields['employer'] || null,
      employer_phone: fields['employer_phone'] || null,
      employer_address: fields['employer_address'] || null,
      monthly_gross_income: parseFloat(fields['monthly_gross_income']) || 0,
      monthly_net_income: parseFloat(fields['monthly_net_income']) || 0,
      other_income_source_1: fields['other_income_source_1'] || null,
      other_income_amount_1: parseFloat(fields['other_income_amount_1']) || 0,
      other_income_source_2: fields['other_income_source_2'] || null,
      other_income_amount_2: parseFloat(fields['other_income_amount_2']) || 0,
      total_monthly_income: parseFloat(fields['total_monthly_income']) || 0,
      liquid_savings: parseFloat(fields['liquid_savings']) || 0,
      assets: fields['assets'] || null,
      expense_rent: parseFloat(fields['expense_rent']) || 0,
      expense_utilities: parseFloat(fields['expense_utilities']) || 0,
      expense_food: parseFloat(fields['expense_food']) || 0,
      expense_transportation: parseFloat(fields['expense_transportation']) || 0,
      expense_insurance: parseFloat(fields['expense_insurance']) || 0,
      expense_childcare: parseFloat(fields['expense_childcare']) || 0,
      expense_other: parseFloat(fields['expense_other']) || 0,
      assist_rent: fields['assist_rent'] === 'Yes',
      assist_utilities: fields['assist_utilities'] === 'Yes',
      assist_medical: fields['assist_medical'] === 'Yes',
      assist_food: fields['assist_food'] === 'Yes',
      assist_transportation: fields['assist_transportation'] === 'Yes',
      assist_home_repair: fields['assist_home_repair'] === 'Yes',
      assist_other: fields['assist_other'] === 'Yes',
      assist_other_detail: fields['assist_other_detail'] || null,
      amount_requested: parseFloat(fields['amount_requested']) || 0,
      funds_deadline: fields['funds_deadline'] || null,
      payee_name: fields['payee_name'] || null,
      payee_phone: fields['payee_phone'] || null,
      payee_address: fields['payee_address'] || null,
      explanation: fields['explanation'] || null,
      other_assistance: fields['other_assistance'] || null,
      other_assistance_details: fields['other_assistance_details'] || null,
      highest_priority: fields['highest_priority'] || null,
      signature: fields['signature'] || null,
      signature_date: fields['signature_date'] || null,
      needs_accommodation: fields['needs_accommodation'] || null,
      accommodation_details: fields['accommodation_details'] || null,
      uploaded_files: uploadedFiles,
      score_completeness: completeness.score,
      score_completeness_detail: completeness.detail,
      score_financial: financial.score,
      score_financial_detail: financial.detail,
      score_crisis: crisis.score,
      score_crisis_detail: crisis.detail,
      score_alternatives: alternatives.score,
      score_alternatives_detail: alternatives.detail,
      score_auto_total: autoTotal,
      score_bracket: rec.bracket,
      score_recommendation: rec.recommendation,
      score_summary: scoreSummary,
      computed_total_expenses: computedTotalExpenses,
      computed_monthly_gap: computedMonthlyGap,
      status: 'submitted',
    })

  if (insertError) {
    console.error('Database insert error:', insertError)
    return res.status(500).json({ error: 'Failed to save application. Please try again.' })
  }

  // 8. Send notification email via Resend
  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey)
      const applicantName = (fields['full_name'] || 'Unknown').trim()
      const emailSubject = `Benevolence Application \u2014 ${applicantName} \u2014 ${rec.bracket}`
      const htmlBody = buildNotificationEmail(applicationId, fields, completeness, financial, crisis, alternatives, rec)

      const { data, error } = await resend.emails.send({
        from: 'The PFSA, Inc. <noreply@thepfsa.org>',
        to: ['info@thepfsa.org'],
        subject: emailSubject,
        html: htmlBody,
      })

      if (error) {
        console.error('Resend email error:', JSON.stringify(error))
      } else {
        console.log('Notification email sent:', data?.id)
      }
    } catch (emailErr) {
      // Log but don't fail the submission over email
      console.error('Notification email error:', emailErr)
    }
  }

  // 9. Return success
  return res.status(200).json({ success: true, applicationId })
}
