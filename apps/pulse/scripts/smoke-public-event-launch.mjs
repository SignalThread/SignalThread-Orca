const baseUrl = required('SMOKE_BASE_URL').replace(/\/$/, '')
const voiceToken = required('SMOKE_VOICE_TOKEN')
const textToken = required('SMOKE_TEXT_TOKEN')
const acknowledgement = required('SMOKE_DISPOSABLE_EVENT_ACK')

if (acknowledgement !== 'I_ACKNOWLEDGE_THIS_IS_A_DISPOSABLE_SMOKE_EVENT') {
  throw new Error('Refusing to create Responses without the disposable smoke-event acknowledgement.')
}

const launches = [
  ['Voice', voiceToken, 'VOICE_ONLY'],
  ['Text', textToken, 'TEXT_ONLY'],
]

const created = []
for (const [label, token, selectedResponseMode] of launches) {
  const detailsResponse = await fetch(`${baseUrl}/api/kiosk/event-details?token=${encodeURIComponent(token)}`)
  const details = await detailsResponse.json().catch(() => null)
  if (!detailsResponse.ok || !details?.success || !details?.event) {
    throw new Error(`${label} T&C lookup failed (${detailsResponse.status}): ${safeMessage(details)}`)
  }
  if (!String(details.event.name || '').startsWith('[SMOKE]')) {
    throw new Error(`${label} token resolved to a non-disposable event. Event names must start with [SMOKE].`)
  }

  const createResponse = await fetch(`${baseUrl}/api/response/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, selectedResponseMode }),
  })
  const body = await createResponse.json().catch(() => null)
  if (!createResponse.ok || !body?.success || !body?.data?.responseId) {
    throw new Error(`${label} response creation failed (${createResponse.status}): ${safeMessage(body)}`)
  }
  if (body.data.responseMode !== selectedResponseMode) {
    throw new Error(`${label} persisted mode mismatch: expected ${selectedResponseMode}, got ${body.data.responseMode}`)
  }
  if (!Array.isArray(body.data.questions) || body.data.questions.length === 0) {
    throw new Error(`${label} launch returned no first question.`)
  }

  created.push({
    mode: label,
    eventId: body.data.eventId,
    surveyId: body.data.surveyId,
    responseId: body.data.responseId,
    firstQuestionId: body.data.questions[0].questionId,
  })
}

console.log(JSON.stringify({ ok: true, created }, null, 2))

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function safeMessage(body) {
  return body?.message || body?.error || 'no structured response body'
}
