/** Test accounts created by scripts/e2e-server.ts for Playwright. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_USERS = {
  alice: { username: "alice", name: "Alice Doe", password: "alice-password-123" },
  bob: { username: "bob", name: "Bob Ray", password: "bob-password-1234" },
} as const;
