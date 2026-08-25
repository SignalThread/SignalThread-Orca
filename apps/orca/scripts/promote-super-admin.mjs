import "dotenv/config";
import { UserRole } from "@prisma/client";
import { getPrisma } from "../src/server/db/prisma.ts";

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function deriveNameFromEmail(email) {
  const localPart = email.split("@")[0]?.trim() ?? "";
  if (!localPart) return null;

  const words = localPart
    .split(/[._-]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1));

  return words.length > 0 ? words.join(" ") : null;
}

function parseArgs(argv) {
  let email = null;
  let orgId = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--email") {
      email = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--orgId") {
      orgId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (!token.startsWith("--") && !email) {
      email = token;
    }
  }

  return { email, orgId };
}

async function main() {
  const { email: emailArg, orgId: orgIdArg } = parseArgs(process.argv.slice(2));
  if (!emailArg) {
    console.error("Usage: node scripts/promote-super-admin.mjs --email user@company.com [--orgId <org-uuid>]");
    process.exit(1);
  }

  const email = normalizeEmail(emailArg);
  const prisma = getPrisma();

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, orgId: true },
    });

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: UserRole.SUPER_ADMIN,
          ...(orgIdArg ? { orgId: orgIdArg } : {}),
        },
        select: { id: true, email: true, orgId: true, role: true },
      });
    } else {
      if (!orgIdArg) {
        console.error("No existing app user found. Provide --orgId to create a SUPER_ADMIN user.");
        process.exit(1);
      }

      const org = await prisma.organization.findUnique({
        where: { id: orgIdArg },
        select: { id: true },
      });

      if (!org) {
        console.error(`Organization not found for orgId=${orgIdArg}`);
        process.exit(1);
      }

      user = await prisma.user.create({
        data: {
          orgId: orgIdArg,
          email,
          name: deriveNameFromEmail(email),
          role: UserRole.SUPER_ADMIN,
        },
        select: { id: true, email: true, orgId: true, role: true },
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          userId: user.id,
          email: user.email,
          orgId: user.orgId,
          role: user.role,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to promote SUPER_ADMIN:", error);
  process.exit(1);
});
