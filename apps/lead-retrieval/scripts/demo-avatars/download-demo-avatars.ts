/**
 * One-time ingest: downloads a fixed batch of square headshots into public/demo-avatars/
 * and writes manifest.json. Run locally before demos — not executed on page load.
 *
 * Uses pravatar.cc as a convenient placeholder source for development; replace files
 * with your own AI-generated assets if licensing requires it.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const COUNT = 32;
const SIZE = 512;
const OUT_DIR = join(process.cwd(), "public/demo-avatars");

async function downloadOne(index: number): Promise<string> {
  const url = `https://i.pravatar.cc/${SIZE}?img=${index}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const name = `avatar-${String(index).padStart(2, "0")}.png`;
  writeFileSync(join(OUT_DIR, name), buf);
  return name;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const files: string[] = [];
  for (let i = 0; i < COUNT; i++) {
    const name = await downloadOne(i);
    files.push(name);
    // Light spacing to be polite to the CDN
    await new Promise((r) => setTimeout(r, 80));
    console.log(`Wrote ${name}`);
  }

  const manifest = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    size: SIZE,
    count: files.length,
    files: files.sort()
  };

  writeFileSync(join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Done. Manifest: public/demo-avatars/manifest.json (${files.length} files)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
