import { EventStructureItemKind, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getEventTemplate } from '@/lib/event-templates'

type PrismaLike = typeof prisma | PrismaClient

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

/**
 * Seed starter Event structure (EventStructureItem rows) for a freshly created
 * event from a template. Structure only — never surveys, responses, analytics,
 * or fabricated activity data. Returns the number of items created.
 *
 * For "blank" (or an unknown key) nothing is created and 0 is returned. Item
 * names within a template are distinct, so slugs are unique for a brand-new
 * event with no existing structure items.
 */
export async function seedEventStructureFromTemplate(
  eventId: string,
  templateKey: string,
  db: PrismaLike = prisma,
): Promise<number> {
  const template = getEventTemplate(templateKey)
  if (!template || template.items.length === 0) {
    return 0
  }

  await db.eventStructureItem.createMany({
    data: template.items.map((item, index) => ({
      eventId,
      kind: item.kind as EventStructureItemKind,
      name: item.name,
      slug: slugFromName(item.name) || `structure-item-${index + 1}`,
      sortOrder: index,
      isActive: true,
    })),
  })

  return template.items.length
}
