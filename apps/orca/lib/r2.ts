import { S3Client } from "@aws-sdk/client-s3";

const globalForR2 = globalThis as unknown as {
  r2Client?: S3Client;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getR2Bucket(): string {
  return requiredEnv("R2_BUCKET");
}

function resolveR2Endpoint(): string {
  const explicitEndpoint = process.env.R2_ENDPOINT?.trim();
  if (explicitEndpoint) {
    const withProtocol = /^https?:\/\//i.test(explicitEndpoint)
      ? explicitEndpoint
      : `https://${explicitEndpoint}`;
    return withProtocol.replace(/\/+$/, "");
  }

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new Error("Missing required env var: R2_ENDPOINT or R2_ACCOUNT_ID");
  }

  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function getR2Client(): S3Client {
  if (globalForR2.r2Client) {
    return globalForR2.r2Client;
  }

  const client = new S3Client({
    region: "auto",
    endpoint: resolveR2Endpoint(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  if (process.env.NODE_ENV !== "production") {
    globalForR2.r2Client = client;
  }

  return client;
}
