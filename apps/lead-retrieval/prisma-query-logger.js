import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
  ],
});

prisma.('query', (e) => {
  console.log(`[PRISMA QUERY] ${e.query} | params: ${e.params} | duration: ${e.duration}ms`);
});

prisma.('error', (e) => {
  console.error(`[PRISMA ERROR] ${e.message}`);
});

prisma.('info', (e) => {
  console.info(`[PRISMA INFO] ${e.message}`);
});

export default prisma;
