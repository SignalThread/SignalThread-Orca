declare module "@/prisma-query-logger" {
  const prisma: any;

  export function runWithPrismaQueryCounter<T>(fn: () => T): T;
  export function getPrismaQueryCount(): number;

  export default prisma;
}
