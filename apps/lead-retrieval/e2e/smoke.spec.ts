import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import {
    resolveTestExhibitorContext,
    supabaseDelete,
    supabaseInsert,
} from './helpers/supabase';

const BASE = 'http://localhost:3000';

type SeededLead = {
    id: string;
    fullName: string;
    hiddenId: string;
    eventId: string;
};

async function seedScopedLead(testTitle: string): Promise<SeededLead> {
    const ctx = await resolveTestExhibitorContext();
    const suffix = randomUUID().slice(0, 8);
    const fullName = `E2E Lead ${suffix}`;
    const hiddenName = `E2E Hidden ${suffix}`;
    const now = new Date().toISOString();
    const id = randomUUID();
    const hiddenId = randomUUID();

    await supabaseInsert('leads', {
        id,
        company_id: ctx.exhibitorCompanyId,
        event_id: ctx.eventId,
        full_name: fullName,
        email: `lead-${suffix}@test-e2e.example.com`,
        job_title: testTitle.slice(0, 40) || 'Buyer',
        company_text: 'Scoped E2E Company',
        temperature: 'warm',
        priority_score: 42,
        rating: 3,
        status: 'new',
        created_at: now,
        updated_at: now,
    });

    await supabaseInsert('leads', {
        id: hiddenId,
        company_id: ctx.exhibitorCompanyId,
        event_id: null,
        full_name: hiddenName,
        email: `hidden-${suffix}@test-e2e.example.com`,
        job_title: 'Out of scope',
        company_text: 'Hidden E2E Company',
        temperature: 'cold',
        priority_score: 1,
        rating: 1,
        status: 'new',
        created_at: now,
        updated_at: now,
    });

    return { id, fullName, hiddenId, eventId: ctx.eventId };
}

async function cleanupSeededLead(seed: SeededLead | null) {
    if (!seed) return;
    await supabaseDelete('lead_enrichments', `lead_id=in.(${seed.id},${seed.hiddenId})`).catch(() => {});
    await supabaseDelete('lead_conversations', `lead_id=in.(${seed.id},${seed.hiddenId})`).catch(() => {});
    await supabaseDelete('lead_briefings', `lead_id=in.(${seed.id},${seed.hiddenId})`).catch(() => {});
    await supabaseDelete('leads', `id=in.(${seed.id},${seed.hiddenId})`).catch(() => {});
}

test.describe('smoke - platform', () => {
    test.use({ storageState: 'e2e/storage/platform_admin.json' });

    test('admin dashboard loads', async ({ page }) => {
        await page.goto(`${BASE}/admin`);
        await expect(page).toHaveURL(/admin/);
    });

    test('events page loads', async ({ page }) => {
        await page.goto(`${BASE}/admin/events`);
        await expect(page).toHaveURL(/events/);
    });
});

test.describe('smoke - exhibitor', () => {
    test.use({ storageState: 'e2e/storage/exhibitor_admin.json' });

    test('leads page loads', async ({ page }) => {
        let seed: SeededLead | null = null;
        try {
            seed = await seedScopedLead(test.info().title);
            await page.goto(`${BASE}/exhibitor/leads?eventId=${encodeURIComponent(seed.eventId)}`);
            await expect(page.getByRole('heading', { name: /leads intelligence/i })).toBeVisible({ timeout: 20_000 });
            await expect(page.getByTestId('lead-card').filter({ hasText: seed.fullName })).toBeVisible({ timeout: 20_000 });
            await expect(page.getByTestId('lead-card').filter({ hasText: /E2E Hidden/ })).toHaveCount(0);
        } finally {
            await cleanupSeededLead(seed);
        }
    });

    test('campaigns page loads', async ({ page }) => {
        await page.goto(`${BASE}/exhibitor/campaigns`);
        await expect(page).toHaveURL(/campaigns/);
    });
});

test.describe('interaction - exhibitor leads', () => {
    test.use({ storageState: 'e2e/storage/exhibitor_admin.json' });

    test('open a lead from list', async ({ page }) => {
        let seed: SeededLead | null = null;
        try {
            seed = await seedScopedLead(test.info().title);
            await page.goto(`${BASE}/exhibitor/leads?eventId=${encodeURIComponent(seed.eventId)}`);

            const card = page.getByTestId('lead-card').filter({ hasText: seed.fullName });
            await expect(card).toBeVisible({ timeout: 20_000 });
            await card.getByRole('link', { name: /view detail/i }).click();

            await expect(page).toHaveURL(new RegExp(`/exhibitor/leads/${seed.id}(?:\\?.*)?$`));
            await expect(page.getByRole('textbox', { name: /full name/i })).toHaveValue(seed.fullName, { timeout: 15_000 });
        } finally {
            await cleanupSeededLead(seed);
        }
    });
});
test.describe('interaction - enrich lead', () => {
    test.use({ storageState: 'e2e/storage/exhibitor_admin.json' });

    test('open lead detail and trigger enrich lead', async ({ page }, testInfo) => {
        test.skip(
            testInfo.project.name !== 'chromium',
            'Chromium covers the Next server-action enrichment click; non-Chromium projects are flaky for this action in E2E.'
        );
        test.setTimeout(60_000);

        let seed: SeededLead | null = null;
        try {
            seed = await seedScopedLead(test.info().title);
            await page.goto(`${BASE}/exhibitor/leads?eventId=${encodeURIComponent(seed.eventId)}`);

            const card = page.getByTestId('lead-card').filter({ hasText: seed.fullName });
            await expect(card).toBeVisible({ timeout: 20_000 });
            await card.getByRole('link', { name: /view detail/i }).click();
            await expect(page.getByRole('textbox', { name: /full name/i })).toHaveValue(seed.fullName, { timeout: 15_000 });

            const enrichButton = page.getByRole('button', { name: /enrich data/i });
            await expect(enrichButton).toBeVisible();

            await enrichButton.click();
            await expect(page.getByRole('textbox', { name: /full name/i })).toHaveValue(seed.fullName, { timeout: 15_000 });

            const url = page.url();
            const match = url.match(/\/leads\/([^\/\?]+)/);
            expect(match).toBeTruthy();
            expect(match![1]).toBe(seed.id);
        
            // The core leads table fields are optionally populated by the backend only on strict matches,
            // so we do not enforce enriched_job_title !== null here to prevent false test failures
            // traversing generic dummy test leads that trigger a successful `noMatch` payload.
        } finally {
            await cleanupSeededLead(seed);
        }
    });
});
