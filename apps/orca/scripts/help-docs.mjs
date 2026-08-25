import fs from "node:fs";
import path from "node:path";
import { computeSourceDigest, generatedRoot } from "./lib/help-content.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const helpRoot = path.join(repoRoot, "docs/help");
const manifestPath = path.join(helpRoot, "help-manifest.json");
const screenshotRoot = path.join(repoRoot, "apps/orca/public/help/screenshots");
const writeManifest = process.argv.includes("--write-manifest");
const required = ["title","description","category","slug","order","status","audience","difficulty","estimatedReadTime","lastReviewed","tags","related","sourceRoutes","screenshotStatus"];
const statuses = new Set(["published","preview","coming-soon","internal"]);
const difficulties = new Set(["beginner","intermediate","advanced"]);
const screenshotStatuses = new Set(["captured","partial","needed","none"]);
const categories = new Set([
  "Getting Started",
  "Portfolio",
  "Event Planning",
  "People and Program",
  "Communications",
  "Collaboration",
  "Administration",
  "Workflows",
  "Troubleshooting",
]);
const ignored = new Set([
  "README.md",
  "CONTENT_AUDIT.md",
  "SCREENSHOT_PLAN.md",
  "EDITORIAL_REVIEW.md",
  "ACCEPTANCE_REPORT.md",
  "HELP_CENTER_IMPLEMENTATION_ACCEPTANCE.md",
  "HELP_CENTER_IMPLEMENTATION_PLAN.md",
]);

function walk(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry => {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) return entry.name === "orca" ? [] : walk(full);
    if(!entry.name.endsWith(".md") && !entry.name.endsWith(".mdx")) return [];
    const rel=path.relative(helpRoot,full).replaceAll(path.sep,"/");
    return ignored.has(rel) ? [] : [rel];
  });
}

function scalar(raw) {
  const value=raw.trim();
  if(value === "") return "";
  if(value === "true") return true;
  if(value === "false") return false;
  if(/^\d+$/.test(value)) return Number(value);
  if(value.startsWith('"')) return JSON.parse(value);
  return value;
}

function parseFrontmatter(text,file) {
  if(!text.startsWith("---\n")) throw new Error(`${file}: missing opening frontmatter delimiter`);
  const end=text.indexOf("\n---\n",4);
  if(end < 0) throw new Error(`${file}: missing closing frontmatter delimiter`);
  const lines=text.slice(4,end).split("\n");
  const data={};
  let listKey=null;
  for(const line of lines) {
    const item=line.match(/^\s{2}-\s+(.*)$/);
    if(item && listKey) { data[listKey].push(scalar(item[1])); continue; }
    const key=line.match(/^([A-Za-z][A-Za-z0-9]*):(?:\s*(.*))?$/);
    if(!key) throw new Error(`${file}: invalid frontmatter line: ${line}`);
    if((key[2]??"").trim()==="") { data[key[1]]=[]; listKey=key[1]; }
    else { data[key[1]]=scalar(key[2]); listKey=null; }
  }
  return data;
}

function validateScreenshotSyntax(text,file,errors) {
  const starts=[...text.matchAll(/<!-- SCREENSHOT NEEDED/g)].length;
  const blocks=[...text.matchAll(/<!-- SCREENSHOT NEEDED\nRoute: [^\n]+\nState: [^\n]+\nPurpose: [^\n]+\nAnnotation targets:\n1\. [^\n]+\n2\. [^\n]+\n3\. [^\n]+\n-->/g)].length;
  if(starts!==blocks) errors.push(`${file}: invalid screenshot placeholder syntax`);
}

function deriveScreenshotStatus(text) {
  const hasPlaceholder=/<!-- SCREENSHOT NEEDED/.test(text);
  const hasScreenshot=/!\[[^\]]*\]\(\/help\/screenshots\/[^)]+\)/.test(text);
  if(hasScreenshot && hasPlaceholder) return "partial";
  if(hasScreenshot) return "captured";
  if(hasPlaceholder) return "needed";
  return "none";
}

const errors=[];
const files=walk(helpRoot).sort();
const docs=[];
for(const filePath of files) {
  const abs=path.join(helpRoot,filePath);
  const text=fs.readFileSync(abs,"utf8");
  let fm;
  try { fm=parseFrontmatter(text,filePath); } catch(error) { errors.push(error.message); continue; }
  for(const field of required) if(!(field in fm)) errors.push(`${filePath}: missing frontmatter field ${field}`);
  if(!statuses.has(fm.status)) errors.push(`${filePath}: invalid status ${fm.status}`);
  if(!difficulties.has(fm.difficulty)) errors.push(`${filePath}: invalid difficulty ${fm.difficulty}`);
  if(!screenshotStatuses.has(fm.screenshotStatus)) errors.push(`${filePath}: invalid screenshot status ${fm.screenshotStatus}`);
  if(!categories.has(fm.category)) errors.push(`${filePath}: invalid category ${fm.category}`);
  for(const field of ["audience","tags","related","sourceRoutes"]) if(!Array.isArray(fm[field])) errors.push(`${filePath}: ${field} must be a list`);
  if(Array.isArray(fm.related) && fm.related.length===0) errors.push(`${filePath}: article has no related articles`);
  validateScreenshotSyntax(text,filePath,errors);
  const derivedScreenshotStatus=deriveScreenshotStatus(text);
  if(fm.screenshotStatus!==derivedScreenshotStatus) {
    errors.push(`${filePath}: screenshotStatus should be ${derivedScreenshotStatus}, found ${fm.screenshotStatus}`);
  }
  for(const match of text.matchAll(/!\[[^\]]*\]\((\/help\/screenshots\/[^)]+)\)/g)) {
    const screenshotPath=path.join(screenshotRoot,match[1].replace("/help/screenshots/",""));
    if(!fs.existsSync(screenshotPath)) errors.push(`${filePath}: missing screenshot asset ${match[1]}`);
  }
  if(/!\[\s*\]\(\/help\/screenshots\//.test(text)) errors.push(`${filePath}: Help screenshots require meaningful alt text`);
  for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+\.mdx?(?:#[^)]+)?)\)/g)) {
    const target=match[1].split("#")[0];
    if(!fs.existsSync(path.resolve(path.dirname(abs),target))) errors.push(`${filePath}: missing relative link ${match[1]}`);
  }
  docs.push({filePath,...fm});
}

for(const field of ["slug","title"]) {
  const seen=new Map();
  for(const doc of docs) {
    const key=String(doc[field]).toLowerCase();
    if(seen.has(key)) errors.push(`duplicate ${field} ${doc[field]} in ${seen.get(key)} and ${doc.filePath}`);
    else seen.set(key,doc.filePath);
  }
}
const slugs=new Set(docs.map(d=>d.slug));
for(const doc of docs) for(const related of doc.related??[]) if(!slugs.has(related)) errors.push(`${doc.filePath}: unknown related slug ${related}`);

const generated=docs.map(doc=>({
  slug:doc.slug,title:doc.title,description:doc.description,category:doc.category,filePath:doc.filePath,
  status:doc.status,order:doc.order,tags:doc.tags,related:doc.related,sourceRoutes:doc.sourceRoutes,screenshotStatus:doc.screenshotStatus,
})).sort((a,b)=>a.order-b.order || a.slug.localeCompare(b.slug));

if(writeManifest && errors.length===0) fs.writeFileSync(manifestPath,JSON.stringify(generated,null,2)+"\n");
if(!fs.existsSync(manifestPath)) errors.push("help-manifest.json: missing manifest");
else {
  let manifest=[];
  try { manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8")); } catch(error) { errors.push(`help-manifest.json: ${error.message}`); }
  const manifestByFile=new Map(manifest.map(entry=>[entry.filePath,entry]));
  for(const doc of generated) {
    if(!manifestByFile.has(doc.filePath)) errors.push(`${doc.filePath}: missing from manifest`);
    else if(JSON.stringify(manifestByFile.get(doc.filePath))!==JSON.stringify(doc)) errors.push(`${doc.filePath}: manifest metadata is stale`);
  }
  for(const entry of manifest) if(!fs.existsSync(path.join(helpRoot,entry.filePath??""))) errors.push(`manifest entry has missing file: ${entry.filePath}`);

  if(!writeManifest) {
    const expectedDigest=computeSourceDigest(manifest);
    for(const generatedFile of ["content.json","search-index.json"]) {
      const generatedPath=path.join(generatedRoot,generatedFile);
      if(!fs.existsSync(generatedPath)) {
        errors.push(`${generatedFile}: missing generated Help artifact; run npm run help:generate`);
        continue;
      }
      try {
        const artifact=JSON.parse(fs.readFileSync(generatedPath,"utf8"));
        if(artifact.schemaVersion!==1) errors.push(`${generatedFile}: unsupported schema version ${artifact.schemaVersion}`);
        if(artifact.sourceDigest!==expectedDigest) errors.push(`${generatedFile}: stale generated Help artifact; run npm run help:generate`);
      } catch(error) {
        errors.push(`${generatedFile}: ${error.message}`);
      }
    }
  }
}

if(errors.length) {
  console.error(`Help validation failed with ${errors.length} error(s):`);
  for(const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Help validation passed: ${docs.length} articles, ${slugs.size} unique slugs.`);
if(writeManifest) console.log(`Wrote ${path.relative(repoRoot,manifestPath)}.`);
