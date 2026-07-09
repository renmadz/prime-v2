// Playwright driver for PRIME v2. Drives the real running app (not a mock).
// Usage: node driver.mjs <flow> [outDir]
//   flows: login-admin | login-applicant | new-proposal | focal-queue |
//          submit-gia | admin-users | all
//
// Requires the docker stack already running (see SKILL.md "Build & start").
// Screenshots are written to ./screenshots (or the outDir arg).

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const BASE_URL = process.env.PRIME_BASE_URL ?? "http://localhost:5173";
const flow = process.argv[2] ?? "all";
const outDir = process.argv[3] ?? path.join(import.meta.dirname, "screenshots");
fs.mkdirSync(outDir, { recursive: true });

const ACCOUNTS = {
  admin: { email: "admin@dev.local", password: "DevAdminPassw0rd!123" },
  applicant: { email: "applicant@dev.local", password: "DevTestPassw0rd!123" },
  focal: { email: "focal@dev.local", password: "DevTestPassw0rd!123" },
};

async function staffLogin(page, account) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Staff Login" }).click();
  await page.locator("#staff-email").fill(account.email);
  await page.locator("#staff-password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`screenshot: ${file}`);
}

async function withFreshPage(browser, fn) {
  // Each account gets its own context so sessions never bleed into each other
  // (the app auto-redirects an authenticated session away from /login).
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser console]", msg.text());
  });
  page.on("pageerror", (err) => console.error("[browser pageerror]", err));
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

async function run() {
  const browser = await chromium.launch();

  try {
    if (flow === "login-admin" || flow === "all") {
      await withFreshPage(browser, async (page) => {
        await staffLogin(page, ACCOUNTS.admin);
        await shot(page, "admin-dashboard");
      });
    }

    if (flow === "new-proposal" || flow === "all") {
      await withFreshPage(browser, async (page) => {
        await staffLogin(page, ACCOUNTS.applicant);
        await shot(page, "applicant-dashboard");
        await page.goto(`${BASE_URL}/proposals/new`, { waitUntil: "networkidle" });
        await shot(page, "proposal-new");
      });
    }

    if (flow === "focal-queue" || flow === "all") {
      await withFreshPage(browser, async (page) => {
        await staffLogin(page, ACCOUNTS.focal);
        await page.goto(`${BASE_URL}/queue`, { waitUntil: "networkidle" });
        await shot(page, "focal-queue");
      });
    }

    if (flow === "submit-gia" || flow === "all") {
      await withFreshPage(browser, async (page) => {
        await staffLogin(page, ACCOUNTS.applicant);
        await page.goto(`${BASE_URL}/proposals/new`, { waitUntil: "networkidle" });
        await page.getByText("GIA Research Proposal").click();
        await page.waitForURL(/\/proposals\/new\//, { timeout: 15_000 });
        await page.locator("#proposal-title").fill("QA Smoke Test — GIA Proposal");

        // Fill every visible field generically so the submit exercises real data.
        const textInputs = page.locator('input[type="text"]:not(#proposal-title)');
        const textareas = page.locator("textarea");
        const numberInputs = page.locator('input[type="number"]');
        const dateInputs = page.locator('input[type="date"]');
        const selects = page.locator("select");

        for (const loc of [textInputs, textareas]) {
          const count = await loc.count();
          for (let i = 0; i < count; i++) {
            await loc.nth(i).fill("QA smoke test value");
          }
        }
        const numCount = await numberInputs.count();
        for (let i = 0; i < numCount; i++) await numberInputs.nth(i).fill("100");
        const dateCount = await dateInputs.count();
        for (let i = 0; i < dateCount; i++) {
          await dateInputs.nth(i).fill(new Date().toISOString().slice(0, 10));
        }
        const selectCount = await selects.count();
        for (let i = 0; i < selectCount; i++) {
          const options = await selects.nth(i).locator("option").allTextContents();
          if (options.length > 1) await selects.nth(i).selectOption({ index: 1 });
        }

        await page.getByRole("button", { name: "Save as draft" }).click();
        await page.waitForTimeout(2000); // debounce + autosave settle
        await shot(page, "proposal-gia-filled");

        await page.getByRole("button", { name: "Submit proposal" }).click();
        await page.getByRole("button", { name: "Confirm submission" }).click();
        await page.waitForURL(/\/proposals\/[0-9a-f-]+$/, { timeout: 15_000 });
        await shot(page, "proposal-gia-submitted");

        const bodyText = await page.locator("body").innerText();
        console.log("submit-gia result page text snapshot:\n", bodyText.slice(0, 500));
      });
    }

    if (flow === "admin-users" || flow === "all") {
      await withFreshPage(browser, async (page) => {
        await staffLogin(page, ACCOUNTS.admin);
        await page.goto(`${BASE_URL}/admin/users`, { waitUntil: "networkidle" });
        await shot(page, "admin-users");
      });
    }

    console.log("OK — driver flow completed without error");
  } catch (err) {
    console.error("Driver flow failed:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
