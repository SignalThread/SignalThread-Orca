import { test, expect, request as playwrightRequest } from '@playwright/test';

const baseUrl = 'http://localhost:3000';

test('campaigns isolated concurrent load', async () => {
    const email = process.env.LOAD_TEST_EMAIL!;
    const password = process.env.LOAD_TEST_PASSWORD!;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const auth = await playwrightRequest.newContext();

    const loginRes = await auth.post(
        `${supabaseUrl}/auth/v1/token?grant_type=password`,
        {
            headers: {
                apikey: anonKey,
                'Content-Type': 'application/json',
            },
            data: { email, password },
        }
    );

    const loginBody = await loginRes.text();
    console.log('login status=', loginRes.status(), 'body=', loginBody);

    expect(loginRes.ok()).toBeTruthy();

    const loginJson = JSON.parse(loginBody);
    const accessToken = loginJson.access_token as string;

    const api = await playwrightRequest.newContext({
        extraHTTPHeaders: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    const rounds = 450;

    const results = await Promise.all(
        Array.from({ length: rounds }, async (_, i) => {
            const started = Date.now();
            await new Promise(r => setTimeout(r, Math.random() * 200));
            const res = await api.get(`${baseUrl}/api/campaigns`);
            const ms = Date.now() - started;
            const body = await res.text();

            return {
                round: i + 1,
                status: res.status(),
                ok: res.ok(),
                ms,
                body,
            };
        })
    );

    const failures = results.filter((r) => !r.ok);

    console.log('total=', results.length);
    console.log('failures=', failures.length);

    failures.slice(0, 20).forEach((f) => {
        console.log(`round=${f.round} status=${f.status} ms=${f.ms} body=${f.body}`);
    });

    expect(failures.length).toBe(0);
});