/**
 * Production operator fallback for the canonical Emergency Login Code flow.
 *
 * Usage:
 *   npx tsx --conditions=react-server scripts/create-emergency-login-code.ts --email user@example.com
 *
 * Requires the same Supabase server credentials as the LR Admin backend. The
 * script resolves one canonical LR user by normalized email and delegates OTP
 * generation and audit logging to lib/server/emergency-login-code.ts.
 */
import { pathToFileURL } from "node:url";
import { loadEnvConfig } from "@next/env";
import { runCreateEmergencyLoginCodeCommand } from "@/lib/server/emergency-login-code-cli-core";

type ScriptRuntime = {
  generateEmergencyLoginCode?: (input: {
    email: string;
    reason: string;
    method: string;
  }) => ReturnType<
    typeof import("@/lib/server/emergency-login-code").generateEmergencyLoginCodeForOperatorByEmail
  >;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
};

export async function main(argv: string[], runtime: ScriptRuntime = {}): Promise<number> {
  const generateEmergencyLoginCode =
    runtime.generateEmergencyLoginCode ??
    (async (input) => {
      loadEnvConfig(process.cwd());
      const service = await import("@/lib/server/emergency-login-code");
      return service.generateEmergencyLoginCodeForOperatorByEmail(input);
    });

  return runCreateEmergencyLoginCodeCommand(
    argv,
    { generateEmergencyLoginCode },
    {
      stdout: runtime.stdout ?? console.log,
      stderr: runtime.stderr ?? console.error
    }
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
