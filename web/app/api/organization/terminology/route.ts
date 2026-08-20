import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { normalizeOrcaTerminology } from "@/lib/orca-terminology-contract";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/request-user";

export const runtime = "nodejs";

function forbidden() { return NextResponse.json({ error: "Organization owner or admin role required" }, { status: 403 }); }
const ORGANIZATION_TERMINOLOGY_ROLES = new Set<UserRole>([UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN]);

async function requestUser(request: NextRequest) {
  const result = await resolveRequestUser(request);
  if ("error" in result) return NextResponse.json({ error: result.error.status === 403 ? "Forbidden" : "Unauthorized" }, { status: result.error.status });
  if (!result.user.orgId || !ORGANIZATION_TERMINOLOGY_ROLES.has(result.user.role)) return forbidden();
  return result.user;
}

export async function GET(request: NextRequest) {
  const user = await requestUser(request);
  if (user instanceof NextResponse) return user;
  const organization = await getPrisma().organization.findUnique({ where: { id: user.orgId! }, select: { agendaTerm: true, runOfShowTerm: true, matrixTerm: true, showFlowTerm: true } });
  if (!organization) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  return NextResponse.json(normalizeOrcaTerminology({ agenda: organization.agendaTerm, runOfShow: organization.runOfShowTerm, matrix: organization.matrixTerm, showFlow: organization.showFlowTerm }));
}

export async function PATCH(request: NextRequest) {
  const user = await requestUser(request);
  if (user instanceof NextResponse) return user;
  try {
    const body = await request.json() as Record<string, unknown>;
    const terms = normalizeOrcaTerminology(body);
    await getPrisma().organization.update({ where: { id: user.orgId! }, data: { agendaTerm: terms.agenda, runOfShowTerm: terms.runOfShow, matrixTerm: terms.matrix, showFlowTerm: terms.showFlow } });
    return NextResponse.json(terms);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid terminology" }, { status: 400 });
  }
}
