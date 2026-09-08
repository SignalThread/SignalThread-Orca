import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("Documents Library file/link support contract", () => {
  it("adds durable file/link storage without breaking existing file documents", () => {
    const migration = read("supabase/migrations/0082_documents_asset_kind.sql");
    const route = read("app/api/exhibitor/documents/route.ts");

    assert.match(migration, /add column if not exists asset_kind text not null default 'file'/);
    assert.match(migration, /check \(asset_kind in \('file', 'link'\)\)/);
    assert.match(migration, /notify pgrst, 'reload schema'/);
    assert.match(route, /asset_kind/);
    assert.match(route, /doc\.asset_kind \?\? "file"/);
  });

  it("upload modal supports file and link assets with client-side validation", () => {
    const source = read("components/exhibitor/documents-hub-client.tsx");

    assert.match(source, /Documents & Links/);
    assert.match(source, /Add Document or Link/);
    assert.match(source, /Upload file/);
    assert.match(source, /Add Link/);
    assert.match(source, /assetKind: "file" as AssetKind/);
    assert.match(source, /uploadForm\.assetKind === "file" && !uploadForm\.file/);
    assert.match(source, /uploadForm\.assetKind === "link" && !isValidHttpUrl\(url\)/);
    assert.match(source, /type="file"[\s\S]*required/);
    assert.match(source, /type="url"[\s\S]*required/);
    for (const field of [
      "Document name",
      "Document type",
      "Link name",
      "Link type",
      "Tags",
      "Allow reps to send this item",
      "If disabled, this item is internal only.",
    ]) {
      assert.match(source, new RegExp(field));
    }
    assert.match(source, /Search documents and links by name or type/);
    assert.match(source, /No documents or links found/);
    assert.match(source, /Loading documents and links/);
  });

  it("create API validates asset type, required file/url, role, company, and event scope server-side", () => {
    const source = read("app/api/exhibitor/documents/route.ts");

    assert.match(source, /function isDocumentAdminRole/);
    assert.match(source, /role === "exhibitor_admin" \|\| role === "platform_admin"/);
    assert.match(source, /const accountId = String\(sessionUser\.companyId/);
    assert.match(source, /assertEventBelongsToAccount/);
    assert.match(source, /\.eq\("company_id", input\.accountId\)/);
    assert.match(source, /normalizeAssetKind\(formData\.get\("assetKind"\)\)/);
    assert.match(source, /normalizeHttpUrl\(urlValue\)/);
    assert.match(source, /A valid http\(s\) URL is required/);
    assert.match(source, /File is required/);
    assert.match(source, /asset_kind: assetKind/);
    assert.match(source, /file_url: fileUrl/);
  });

  it("edit and delete APIs also require document admin role and account scope", () => {
    const source = read("app/api/exhibitor/documents/[documentId]/route.ts");

    assert.match(source, /function isDocumentAdminRole/);
    assert.match(source, /role === "exhibitor_admin" \|\| role === "platform_admin"/);
    assert.match(source, /if \(!isDocumentAdminRole\(role\)\)/);
    assert.match(source, /\.eq\("id", documentId\)/);
    assert.match(source, /\.eq\("account_id", accountId\)/);
  });

  it("renders file/link indicators, icon-only accessible actions, and mobile cards", () => {
    const source = read("components/exhibitor/documents-hub-client.tsx");

    assert.match(source, /function AssetKindBadge/);
    assert.match(source, /Link2/);
    assert.match(source, /FileText/);
    assert.match(source, /className="hidden overflow-x-auto[\s\S]*md:block"/);
    assert.match(source, /<section className="grid gap-3 md:hidden">/);
    assert.match(source, /<article key=\{document\.id\}/);
    assert.match(source, /aria-label=\{`View \$\{document\.title\}`\}/);
    assert.match(source, /aria-label=\{`Edit \$\{document\.title\}`\}/);
    assert.match(source, /aria-label=\{repSendable \? `Send \$\{document\.title\}`/);
    assert.match(source, /aria-label=\{`Delete \$\{document\.title\}`\}/);
    assert.doesNotMatch(source, />\s*View\s*<\/a>/);
    assert.doesNotMatch(source, />\s*Edit\s*<\/button>/);
    assert.doesNotMatch(source, />\s*Send\s*<\/button>/);
    assert.doesNotMatch(source, />\s*Delete\s*<\/button>/);
  });

  it("send action sends a formatted document link without attachments", () => {
    const source = read("app/api/exhibitor/documents/send/route.ts");

    assert.match(source, /renderDocumentShareText/);
    assert.match(source, /renderDocumentShareHtml/);
    assert.match(source, /Open item/);
    assert.match(source, /const trackedUrl = `\$\{new URL\(request\.url\)\.origin\}\/api\/exhibitor\/documents\/sends\/\$\{sendRow\.id\}\/click`/);
    assert.match(source, /sgMail\.send\(\{[\s\S]*text: textBody,[\s\S]*html: htmlBody/);
    assert.doesNotMatch(source, /attachments\s*:/);
  });

  it("link records preview and tracked-click routes redirect to their external URL", () => {
    const preview = read("app/api/exhibitor/documents/[documentId]/preview/route.ts");
    const click = read("app/api/exhibitor/documents/sends/[sendId]/click/route.ts");

    for (const source of [preview, click]) {
      assert.match(source, /asset_kind/);
      assert.match(source, /assetKind === "link" \? null :/);
      assert.match(source, /if \(fileUrl\) \{[\s\S]*NextResponse\.redirect\(fileUrl/);
    }
  });
});
