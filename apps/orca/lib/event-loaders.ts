import { cache } from "react";
import { getPrisma } from "@/lib/prisma";

export const getEventHeaderById = cache(async (eventId: string) => {
  return getPrisma().event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      timezone: true,
      status: true,
      venueName: true,
      city: true,
      state: true,
    },
  });
});
