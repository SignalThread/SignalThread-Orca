# Test Commands

## Admin Repo

Path:

```bash
cd ~/Documents/lead\ retrieval\ app
```

## Admin env for Playwright OTP bypass

Add this to Admin `.env.local` only:

```env
E2E_AUTH_BYPASS_ENABLED=true
```

Never enable this in production.

## Admin grouped tests

```bash
cd ~/Documents/lead\ retrieval\ app
npm run test:all
```

## Admin raw Node tests, clean summary

```bash
cd ~/Documents/lead\ retrieval\ app
node --import tsx --test $(find tests -name "*.test.ts" -o -name "*.spec.ts") 2>&1 | tail -30
```

## Admin Playwright e2e with OTP bypass

Terminal 1:

```bash
cd ~/Documents/lead\ retrieval\ app
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run dev
```

Terminal 2:

```bash
cd ~/Documents/lead\ retrieval\ app
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test --project=chromium --reporter=list
```

## Admin Playwright e2e, all browsers

```bash
cd ~/Documents/lead\ retrieval\ app
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test --reporter=list
```

## Count Admin tests

```bash
cd ~/Documents/lead\ retrieval\ app
find tests e2e -name "*.test.ts" -o -name "*.spec.ts" | wc -l
```

---

## App Repo

Path:

```bash
cd ~/Documents/lead-intel-scan
```

## App Vitest

```bash
cd ~/Documents/lead-intel-scan
npm run test -- --reporter=dot
```

## App Vitest clean summary

```bash
cd ~/Documents/lead-intel-scan
npm run test -- --reporter=dot 2>&1 | tail -20
```

## App Maestro mobile e2e

```bash
cd ~/Documents/lead-intel-scan
maestro test .maestro/flows
```

## App Maestro quick suite

```bash
cd ~/Documents/lead-intel-scan
maestro test .maestro/flows/suite-quick.yaml
```

## App Maestro full suite

```bash
cd ~/Documents/lead-intel-scan
maestro test .maestro/flows/suite.yaml
```

## App Maestro single flow

```bash
cd ~/Documents/lead-intel-scan
maestro test .maestro/flows/leads-open-first-row.yaml
```
