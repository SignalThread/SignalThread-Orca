import { describe, expect, it, vi } from 'vitest'
import { deleteEventForAccount, EventDeletionError } from './event-deletion'

function deletionDb(event: { id: string; name: string } | null = { id: 'evt_1', name: 'Northstar Summit' }) {
  const transaction = {
    event: {
      findFirst: vi.fn().mockResolvedValue(event),
      delete: vi.fn().mockResolvedValue(event),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    publicSurveyLink: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  }
  return { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)), transaction }
}

describe('deleteEventForAccount', () => {
  it('hard-deletes production-shaped targeted public links and legacy Sessions in one transaction', async () => {
    const db = deletionDb()
    await expect(deleteEventForAccount({ accountId: 'acct_1', eventId: 'evt_1', confirmationName: 'Northstar Summit' }, db as never)).resolves.toEqual({ eventId: 'evt_1', eventName: 'Northstar Summit' })
    expect(db.$transaction).toHaveBeenCalledOnce()
    expect(db.transaction.publicSurveyLink.deleteMany).toHaveBeenCalledWith({
      where: { survey: { eventId: 'evt_1' } },
    })
    expect(db.transaction.session.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'evt_1' } })
    expect(db.transaction.event.delete).toHaveBeenCalledWith({ where: { id: 'evt_1' } })
    expect(db.transaction.event.findUnique).toHaveBeenCalledWith({ where: { id: 'evt_1' }, select: { id: true } })
    expect(db.transaction.publicSurveyLink.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(db.transaction.event.delete.mock.invocationCallOrder[0])
  })

  it('never deletes a wrong-account or missing Event', async () => {
    const db = deletionDb(null)
    await expect(deleteEventForAccount({ accountId: 'other', eventId: 'evt_1', confirmationName: 'Northstar Summit' }, db as never)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(db.transaction.publicSurveyLink.deleteMany).not.toHaveBeenCalled()
    expect(db.transaction.session.deleteMany).not.toHaveBeenCalled()
    expect(db.transaction.event.delete).not.toHaveBeenCalled()
  })

  it('requires the exact Event name before it begins destructive work', async () => {
    const db = deletionDb()
    await expect(deleteEventForAccount({ accountId: 'acct_1', eventId: 'evt_1', confirmationName: 'northstar summit' }, db as never)).rejects.toBeInstanceOf(EventDeletionError)
    expect(db.transaction.publicSurveyLink.deleteMany).not.toHaveBeenCalled()
    expect(db.transaction.session.deleteMany).not.toHaveBeenCalled()
    expect(db.transaction.event.delete).not.toHaveBeenCalled()
  })

  it('fails the transaction when final removal cannot be verified', async () => {
    const db = deletionDb()
    db.transaction.event.findUnique.mockResolvedValue({ id: 'evt_1' })
    await expect(deleteEventForAccount({ accountId: 'acct_1', eventId: 'evt_1', confirmationName: 'Northstar Summit' }, db as never)).rejects.toMatchObject({ code: 'DELETE_FAILED' })
  })

  it('propagates a dependency failure so the transaction rolls back instead of partially deleting', async () => {
    const db = deletionDb()
    const dependencyError = new Error('dependent cleanup failed')
    db.transaction.session.deleteMany.mockRejectedValue(dependencyError)

    await expect(deleteEventForAccount({ accountId: 'acct_1', eventId: 'evt_1', confirmationName: 'Northstar Summit' }, db as never)).rejects.toBe(dependencyError)
    expect(db.transaction.publicSurveyLink.deleteMany).toHaveBeenCalledOnce()
    expect(db.transaction.event.delete).not.toHaveBeenCalled()
    expect(db.transaction.event.findUnique).not.toHaveBeenCalled()
  })
})
