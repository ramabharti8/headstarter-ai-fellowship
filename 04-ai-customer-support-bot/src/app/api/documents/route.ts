import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrg, assertRole } from "@/lib/tenant";
import { json, noStore } from "@/lib/http";
import { toErrorResponse, Errors } from "@/lib/errors";
import { env } from "@/lib/env";
import { detectType, extractText, ingestDocument } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const { org } = await requireOrg();
    const documents = await prisma.document.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        sourceType: true,
        byteSize: true,
        status: true,
        error: true,
        chunkCount: true,
        createdAt: true,
      },
    });
    return json({ documents }, noStore);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, org } = await requireOrg();
    assertRole(org.role, "ADMIN");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw Errors.badRequest("Expected a `file` field");
    if (file.size > env.MAX_UPLOAD_BYTES) {
      throw Errors.payloadTooLarge(`Max upload size is ${env.MAX_UPLOAD_BYTES} bytes`);
    }

    const type = detectType(file.name, file.type);
    if (!type) throw Errors.badRequest("Unsupported file type. Use .txt, .md, or .pdf");

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractText(buffer, type);
    if (!text.trim()) throw Errors.badRequest("Could not extract any text from the file");

    const title = (form.get("title") as string) || file.name.replace(/\.[^.]+$/, "");
    const { documentId } = await ingestDocument({
      orgId: org.id,
      userId: user.id,
      title,
      type,
      byteSize: file.size,
      text,
    });

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    return json({ document }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
