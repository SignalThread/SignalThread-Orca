type SideEffectLogger = Pick<typeof console, "warn">;

export async function runConversationReadinessSideEffect(
  label: string,
  effect: () => Promise<unknown>,
  logger: SideEffectLogger = console
): Promise<boolean> {
  try {
    await effect();
    return true;
  } catch (error) {
    logger.warn("[conversations/readiness] side effect failed", {
      label,
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
