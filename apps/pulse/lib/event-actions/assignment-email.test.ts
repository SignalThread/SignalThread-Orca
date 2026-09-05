import { describe, expect, it, vi } from 'vitest'
import {
  assignmentEmailContent,
  createResendAssignmentEmailProvider,
} from './assignment-email'

const message = {
  recipientEmail: 'owner@example.com',
  recipientName: 'Alex Rivera',
  actionTitle: 'Move AI Lounge signage into view',
  priority: 'Immediate',
  dueAt: new Date('2026-09-17T16:00:00.000Z'),
  deepLink: 'https://voice.signalthread.ai/app/events/event_1/dashboard?account=events-co&tab=actions&actionView=my&actionId=cluster_1',
  idempotencyKey: 'assignment-delivery/delivery_1/initial',
}

describe('action assignment email provider', () => {
  it('builds useful plain-text and HTML content around the canonical action deep link', () => {
    const content = assignmentEmailContent(message)
    expect(content.subject).toContain(message.actionTitle)
    expect(content.text).toContain(message.deepLink)
    expect(content.html).toContain('Open action')
    expect(content.html).toContain(message.deepLink.replaceAll('&', '&amp;'))
  })

  it('stores the provider message ID and sends a provider-level idempotency key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'email_123' }),
    })
    const provider = createResendAssignmentEmailProvider({
      apiKey: 'resend-test-key',
      from: 'SignalThread <actions@example.com>',
      fetchImpl: fetchImpl as never,
    })
    await expect(provider.send(message)).resolves.toEqual({ messageId: 'email_123' })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Idempotency-Key': message.idempotencyKey }),
    }))
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(payload.to).toEqual(['owner@example.com'])
    expect(payload.text).toContain(message.deepLink)
  })
})
