export interface ActionAssignmentEmail {
  recipientEmail: string
  recipientName: string | null
  actionTitle: string
  priority: string
  dueAt: Date | null
  deepLink: string
  idempotencyKey: string
}

export interface ActionAssignmentEmailProvider {
  readonly name: string
  send(message: ActionAssignmentEmail): Promise<{ messageId: string | null }>
}

export class ActionAssignmentEmailProviderError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'ActionAssignmentEmailProviderError'
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function assignmentEmailContent(message: ActionAssignmentEmail) {
  const greeting = message.recipientName?.trim() ? `Hi ${message.recipientName.trim()},` : 'Hello,'
  const due = message.dueAt
    ? message.dueAt.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: 'UTC', timeZoneName: 'short',
    })
    : 'No due date'
  const subject = `You were assigned an Event action: ${message.actionTitle}`
  const text = [
    greeting,
    '',
    'Your event team assigned you an action in SignalThread.',
    '',
    `Action: ${message.actionTitle}`,
    `Priority: ${message.priority}`,
    `Due: ${due}`,
    '',
    `Open action: ${message.deepLink}`,
  ].join('\n')
  const html = `<p>${escapeHtml(greeting)}</p><p>Your event team assigned you an action in SignalThread.</p><p><strong>Action:</strong> ${escapeHtml(message.actionTitle)}<br><strong>Priority:</strong> ${escapeHtml(message.priority)}<br><strong>Due:</strong> ${escapeHtml(due)}</p><p><a href="${escapeHtml(message.deepLink)}">Open action</a></p>`
  return { subject, text, html }
}

export function createResendAssignmentEmailProvider(config: {
  apiKey: string
  from: string
  fetchImpl?: typeof fetch
}): ActionAssignmentEmailProvider {
  const fetchImpl = config.fetchImpl ?? fetch
  return {
    name: 'resend',
    async send(message) {
      const content = assignmentEmailContent(message)
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.recipientEmail],
          subject: content.subject,
          text: content.text,
          html: content.html,
        }),
      })
      const body = await response.json().catch(() => ({})) as { id?: string; name?: string; message?: string }
      if (!response.ok) {
        throw new ActionAssignmentEmailProviderError(
          body.message || 'Assignment email provider rejected the request',
          body.name || `provider_http_${response.status}`,
        )
      }
      return { messageId: typeof body.id === 'string' ? body.id : null }
    },
  }
}

export function getActionAssignmentEmailProvider(): ActionAssignmentEmailProvider {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EVENT_ACTION_EMAIL_FROM?.trim()
  if (apiKey && from) return createResendAssignmentEmailProvider({ apiKey, from })
  return {
    name: 'unconfigured',
    async send() {
      throw new ActionAssignmentEmailProviderError(
        'Assignment email delivery is not configured',
        'provider_unconfigured',
      )
    },
  }
}
