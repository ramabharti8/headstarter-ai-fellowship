import { test, expect } from "@playwright/test";

const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test("landing page renders and links to sign up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /AI customer-support agent/i })).toBeVisible();
});

test("sign up, create a conversation, and get a mock reply", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("link", { name: "Conversations" }).click();
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page).toHaveURL(/\/chat\/.+/);

  await page.getByPlaceholder("Ask a question…").fill("Where is my order?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/mock response for testing/i)).toBeVisible({ timeout: 15_000 });
});

test("health endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.checks.db).toBe("ok");
});
