/**
 * Base URL for Playwright navigation. Override with PLAYWRIGHT_TEST_BASE_URL when needed.
 */
export const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000";
