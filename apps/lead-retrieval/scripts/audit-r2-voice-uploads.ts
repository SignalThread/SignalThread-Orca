import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";

type MultipartEntry = {
  key: string;
  uploadId: string;
  initiated: string | null;
};

type ObjectEntry = {
  key: string;
  lastModified: string | null;
  size: number;
};

const BUCKET = "lrapp";
const TARGET_LEAD_ID = "8c31f6eb-5cf3-4d46-bf44-3fec428c16e4";
const TARGET_PREFIX = `conversations/${TARGET_LEAD_ID}/`;

function loadEnvFileIfPresent(path: string) {
  try {
    const content = readFileSync(path, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = line.slice(0, eqIndex).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Ignore missing .env.local; rely on process env.
  }
}

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 env vars. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    endpoint,
    region: "auto",
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

function toConversationPrefix(key: string) {
  const match = key.match(/^conversations\/([^/]+)\//);
  if (match?.[1]) return `conversations/${match[1]}/`;
  const slashIndex = key.lastIndexOf("/");
  return slashIndex >= 0 ? key.slice(0, slashIndex + 1) : key;
}

function isNoSuchKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { name?: string; Code?: string; code?: string };
  return (
    maybeError.name === "NoSuchKey" ||
    maybeError.Code === "NoSuchKey" ||
    maybeError.code === "NoSuchKey"
  );
}

async function listAllMultipartUploads(client: S3Client, bucket: string) {
  const entries: MultipartEntry[] = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;

  while (true) {
    const response = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker
      })
    );

    for (const upload of response.Uploads ?? []) {
      const key = String(upload.Key ?? "").trim();
      const uploadId = String(upload.UploadId ?? "").trim();
      if (!key || !uploadId) continue;
      entries.push({
        key,
        uploadId,
        initiated: upload.Initiated ? new Date(upload.Initiated).toISOString() : null
      });
    }

    if (!response.IsTruncated) break;
    keyMarker = response.NextKeyMarker;
    uploadIdMarker = response.NextUploadIdMarker;
  }

  return entries;
}

async function listObjectsForPrefix(client: S3Client, bucket: string, prefix: string) {
  const entries: ObjectEntry[] = [];
  let continuationToken: string | undefined;

  while (true) {
    let response;
    try {
      response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        console.warn("Prefix has no objects (NoSuchKey), treating as empty result", { bucket, prefix });
        return [];
      }
      throw error;
    }

    for (const object of response.Contents ?? []) {
      const key = String(object.Key ?? "").trim();
      if (!key) continue;
      entries.push({
        key,
        lastModified: object.LastModified ? new Date(object.LastModified).toISOString() : null,
        size: Number(object.Size ?? 0)
      });
    }

    if (!response.IsTruncated) break;
    continuationToken = response.NextContinuationToken;
  }

  return entries;
}

function sortTopPrefixes(uploads: MultipartEntry[]) {
  const countByPrefix = new Map<string, number>();
  for (const upload of uploads) {
    const prefix = toConversationPrefix(upload.key);
    countByPrefix.set(prefix, (countByPrefix.get(prefix) ?? 0) + 1);
  }

  return Array.from(countByPrefix.entries())
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => (b.count - a.count) || a.prefix.localeCompare(b.prefix))
    .slice(0, 20);
}

function getLatestObjects(objects: ObjectEntry[]) {
  return [...objects]
    .sort((a, b) => {
      const aTs = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const bTs = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      return bTs - aTs;
    })
    .slice(0, 20);
}

async function main() {
  loadEnvFileIfPresent(".env.local");
  const client = getR2Client();

  const multipartUploads = await listAllMultipartUploads(client, BUCKET);
  const targetLeadMultipartCount = multipartUploads.filter(
    (upload) => toConversationPrefix(upload.key) === TARGET_PREFIX
  ).length;
  const top20Prefixes = sortTopPrefixes(multipartUploads);

  const targetObjects = await listObjectsForPrefix(client, BUCKET, TARGET_PREFIX);
  const targetM4aObjects = targetObjects.filter((obj) => obj.key.toLowerCase().endsWith(".m4a"));
  const latest20Objects = getLatestObjects(targetM4aObjects);

  const reportsDir = join(process.cwd(), "reports");
  mkdirSync(reportsDir, { recursive: true });

  const multipartReport = {
    generatedAt: new Date().toISOString(),
    bucket: BUCKET,
    totalOngoingMultipartUploads: multipartUploads.length,
    targetLeadId: TARGET_LEAD_ID,
    targetLeadPrefix: TARGET_PREFIX,
    targetLeadOngoingMultipartUploads: targetLeadMultipartCount,
    top20PrefixesByMultipartCount: top20Prefixes
  };

  const objectsReport = {
    generatedAt: new Date().toISOString(),
    bucket: BUCKET,
    prefix: TARGET_PREFIX,
    totalM4aObjectCount: targetM4aObjects.length,
    latest20ObjectKeys: latest20Objects
  };

  writeFileSync(join(reportsDir, "r2-multipart-audit.json"), JSON.stringify(multipartReport, null, 2));
  writeFileSync(join(reportsDir, "r2-objects-audit.json"), JSON.stringify(objectsReport, null, 2));

  console.log("R2 voice upload audit complete");
  console.log(`- bucket: ${BUCKET}`);
  console.log(`- total ongoing multipart uploads: ${multipartUploads.length}`);
  console.log(`- ongoing multipart uploads for ${TARGET_LEAD_ID}: ${targetLeadMultipartCount}`);
  console.log("- top 20 prefixes by multipart count:");
  for (const item of top20Prefixes) {
    console.log(`  - ${item.prefix}: ${item.count}`);
  }
  console.log(`- .m4a object count under ${TARGET_PREFIX}: ${targetM4aObjects.length}`);
  console.log("- latest 20 object keys under target prefix:");
  for (const item of latest20Objects) {
    console.log(`  - ${item.key}`);
  }
  console.log("- wrote reports/r2-multipart-audit.json");
  console.log("- wrote reports/r2-objects-audit.json");
}

void main().catch((error) => {
  console.error("Failed to run R2 voice upload audit", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null
  });
  process.exit(1);
});
