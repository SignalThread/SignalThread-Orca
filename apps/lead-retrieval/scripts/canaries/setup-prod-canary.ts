import { printCanaryResources, setupCanaryResources } from "./prod-canary-common";

async function main() {
  const resources = await setupCanaryResources();
  printCanaryResources(resources);
  console.log("CANARY_SETUP=idempotent");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
