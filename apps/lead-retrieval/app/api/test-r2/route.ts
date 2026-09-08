import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET } from "@/lib/r2";

export async function GET() {
  try {
    const key = "test/hello.txt";

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: "hello from lead intel",
        ContentType: "text/plain"
      })
    );

    return NextResponse.json({
      success: true,
      bucket: R2_BUCKET,
      key
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
