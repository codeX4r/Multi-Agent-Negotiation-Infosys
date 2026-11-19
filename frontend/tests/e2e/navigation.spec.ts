import { test, expect } from '@playwright/test';

test.describe('Negotiation Arena - Full Flow', () => {
  test.setTimeout(120000);

  test('Home screen loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Enter the arena');
    await expect(page.locator('button:has-text("Start new negotiation")')).toBeVisible();
  });

  test('Mode selection', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Start new negotiation")');
    await expect(page.locator('h2')).toContainText('Choose your negotiation mode');
    await expect(page.locator('h3:has-text("Simulation, Watch")')).toBeVisible();
    await expect(page.locator('h3:has-text("Practice, You play")')).toBeVisible();
    await page.click('.modecard:has(h3:has-text("Simulation, Watch"))');
    await page.waitForSelector('h2:has-text("Select a negotiation scenario")', { timeout: 15000 });
    await expect(page.locator('h2')).toContainText('Select a negotiation scenario');
  });

  test('Scenario selection', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Start new negotiation")');
    await page.click('.modecard:has(h3:has-text("Simulation, Watch"))');
    await page.waitForSelector('h2:has-text("Select a negotiation scenario")', { timeout: 15000 });
    await expect(page.locator('h2')).toContainText('Select a negotiation scenario');
    await expect(page.locator('.scard:has(h3:has-text("Vendor Pricing"))')).toBeVisible();
    await expect(page.locator('.scard:has(h3:has-text("Job Offer"))')).toBeVisible();
    await expect(page.locator('.scard:has(h3:has-text("Project Budget"))')).toBeVisible();
    await expect(page.locator('.scard:has(h3:has-text("Custom"))')).toBeVisible();
  });

  test('Scenario selection and Setup', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Start new negotiation")');
    await page.click('.modecard:has(h3:has-text("Simulation, Watch"))');
    await page.waitForSelector('h2:has-text("Select a negotiation scenario")', { timeout: 15000 });
    await page.click('.scard:has(h3:has-text("Vendor Pricing"))');
    await page.waitForSelector('h2:has-text("Set the table")', { timeout: 15000 });
    await expect(page.locator('button:has-text("Environment")')).toBeVisible();
    await expect(page.locator('button:has-text("Seats & roles")')).toBeVisible();
    await expect(page.locator('button:has-text("Orchestrator")')).toBeVisible();
  });

  test('Setup to Briefing', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Start new negotiation")');
    await page.click('.modecard:has(h3:has-text("Simulation, Watch"))');
    await page.waitForSelector('h2:has-text("Select a negotiation scenario")', { timeout: 15000 });
    await page.click('.scard:has(h3:has-text("Vendor Pricing"))');
    await page.waitForSelector('h2:has-text("Set the table")', { timeout: 15000 });
    await page.click('button:has-text("Next: Table setup")');
    await page.waitForSelector('h2:has-text("Observer briefing")', { timeout: 15000 });
    await expect(page.locator('h2')).toContainText('Observer briefing');
  });

  test('Briefing to Arena', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Start new negotiation")');
    await page.click('.modecard:has(h3:has-text("Simulation, Watch"))');
    await page.waitForSelector('h2:has-text("Select a negotiation scenario")', { timeout: 15000 });
    await page.click('.scard:has(h3:has-text("Vendor Pricing"))');
    await page.waitForSelector('h2:has-text("Set the table")', { timeout: 15000 });
    await page.click('button:has-text("Next: Table setup")');
    await page.waitForSelector('h2:has-text("Observer briefing")', { timeout: 15000 });
    await page.click('button:has-text("Next: Briefing")');
    await page.waitForSelector('h2:has-text("Observer briefing")', { timeout: 15000 });
    await page.click('button:has-text("Create session & enter arena")');

    // Wait for arena to load
    await page.waitForSelector('#arena', { timeout: 20000 });
    await expect(page.locator('#arena')).toBeVisible();
  });
});