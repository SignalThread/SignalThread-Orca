# Template System Architecture

## Overview

SignalThread uses a template-driven architecture to support multiple product lines (Events, Retail, Hospitality) without code mixing. This allows us to ship product-line-specific features independently while keeping the codebase maintainable.

## Core Concepts

### 1. Use Cases (Product Lines)
- **Events**: Conferences, trade shows, workshops
- **Retail**: Coffee shops, pizza, bakery, fashion stores
- **Hospitality**: Hotels, restaurants, resorts (future)

### 2. Verticals (Sub-templates)
Optional specializations within a use case:
- Events → Conference, Trade Show, Workshop
- Retail → Coffee, Pizza, Bakery, Fashion, Grocery

Verticals customize:
- Default questions
- Theme buckets
- Copy/messaging
- Heuristics (impact keywords)

### 3. Template Registry
Central registry (`lib/templates/registry.ts`) that:
- Maps use case → base template
- Maps use case.vertical → overrides
- Resolves active template based on configuration

## File Structure

```
lib/templates/
├── types.ts           # TypeScript types and interfaces
├── registry.ts        # Template resolution logic
├── events.ts          # Events product line template
├── retail.ts          # Retail product line template
└── index.ts           # Main exports
```

## How It Works

### Template Resolution Flow

1. **Admin Page Loads** → Checks for demo override in query params
2. **No Override** → Resolves template from event data (default: 'events')
3. **With Override** → Uses `?demo=retail&vertical=coffee` from URL
4. **Registry Resolves** → Returns complete ProductTemplate with vertical overrides
5. **Page Renders** → Uses template config for sections, themes, keywords

### Template Configuration

Each template defines:

```typescript
interface ProductTemplate {
  useCase: UseCase
  vertical?: string
  
  displayName: string
  description: string
  icon?: string
  
  overviewSections: TemplateSection[]      // Admin UI sections (ordered)
  defaultQuestions: DefaultQuestion[]      // Kiosk questions
  themeBuckets: ThemeBucket[]              // Theme grouping
  highImpactKeywords: string[]             // Action item prioritization
  lowImpactKeywords: string[]
  
  primaryColor?: string
  consentText?: string
  completionMessage?: string
}
```

### Insights Processing

Theme deduplication, action item prioritization, and grouping now accept template configuration:

```typescript
// Before (hardcoded)
const themes = processThemes(rawThemes)

// After (template-driven)
const themes = processThemes(rawThemes, insightsConfig)
```

## Demo Override (Dev/Admin Only)

### Activate Demo Mode

Add query parameters to any admin event overview page:

```
/admin/events/[eventId]?demoUseCase=retail
/admin/events/[eventId]?demoUseCase=retail&demoVertical=coffee
/admin/events/[eventId]?demoUseCase=events&demoVertical=conference
```

**Note:** For backward compatibility, `?demo=retail&vertical=coffee` is also supported.

### Demo Banner

When active, a purple banner appears at the top:
- Shows template name and icon
- Shows vertical if specified
- "Exit Demo" button returns to normal mode

### Safety

Demo override is:
- ✅ Safe in dev/admin contexts
- ❌ Not exposed in kiosk mode
- ❌ Not exposed in production APIs
- ✅ Only affects client-side rendering

## Adding a New Template

### 1. Create Template File

```typescript
// lib/templates/hospitality.ts
export const hospitalityTemplate: ProductTemplate = {
  useCase: 'hospitality',
  displayName: 'Hotels & Hospitality',
  icon: '🏨',
  
  overviewSections: [...],
  defaultQuestions: [...],
  themeBuckets: [...],
  highImpactKeywords: [...],
  lowImpactKeywords: [...],
}
```

### 2. Register Template

```typescript
// lib/templates/registry.ts
const TEMPLATE_REGISTRY: Record<UseCase, ProductTemplate> = {
  events: eventsTemplate,
  retail: retailTemplate,
  hospitality: hospitalityTemplate, // Add here
}
```

### 3. Export Template

```typescript
// lib/templates/index.ts
export { hospitalityTemplate } from './hospitality'
```

### 4. Test with Demo Override

```
/admin/events/[eventId]?demoUseCase=hospitality
```

## Adding a New Vertical

### 1. Define Vertical Overrides

```typescript
// lib/templates/retail.ts
export const bakeryVertical: Partial<ProductTemplate> = {
  vertical: 'bakery',
  displayName: 'Bakery',
  
  defaultQuestions: [
    { key: 'bread_quality', text: 'How was the freshness?', order: 1, ... },
    { key: 'variety', text: 'Was there enough variety?', order: 2, ... },
  ],
  
  themeBuckets: [
    { name: 'Freshness', keywords: ['fresh', 'stale', 'crispy', 'soft'] },
    ...retailThemeBuckets, // Inherit base retail buckets
  ],
}
```

### 2. Register Vertical

```typescript
// lib/templates/registry.ts
const VERTICAL_REGISTRY: Record<string, Partial<ProductTemplate>> = {
  'retail.bakery': bakeryVertical, // Add here
}
```

### 3. Test with Demo Override

```
/admin/events/[eventId]?demoUseCase=retail&demoVertical=bakery
```

## Future: Database-Driven Templates

Currently, all events use the 'events' template by default. In production, we'll:

1. Add `useCase` and `vertical` columns to the `Event` model:
```prisma
model Event {
  // ...existing fields
  useCase  UseCase  @default(events)
  vertical String?
}
```

2. Update `getTemplateForEvent()` to query the database:
```typescript
export async function getTemplateForEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  return { useCase: event.useCase, vertical: event.vertical }
}
```

3. Remove demo override from production builds

## Benefits

### ✅ No Code Mixing
Retail features don't touch events code. Each template is self-contained.

### ✅ Shared Components
Transcription, analysis, and storage work across all templates via configuration.

### ✅ Easy Demoing
Switch between templates with a query param for demos and testing.

### ✅ Maintainable
Add new verticals without touching existing templates.

### ✅ Type-Safe
TypeScript enforces template structure and prevents invalid configs.

## Current Status

- ✅ **Events Template**: Complete (preserves current behavior)
- ✅ **Retail Template**: Stub created (proves architecture)
- ✅ **Demo Override**: Working in admin overview
- ✅ **Insights Processing**: Template-driven (themes, action items)
- ⏳ **Database Schema**: Not yet (events-only for MVP)
- ⏳ **Kiosk Templates**: Not yet (uses events template)

## Testing Checklist

When adding or modifying templates:

- [ ] Template resolves correctly from registry
- [ ] Default questions are sensible for use case
- [ ] Theme buckets cover common feedback categories
- [ ] Impact keywords accurately prioritize action items
- [ ] Vertical overrides merge correctly with base template
- [ ] Demo override shows correct banner and data
- [ ] "Exit Demo" button returns to normal mode
- [ ] No console errors or warnings
- [ ] Current events UX is unchanged (backward compatibility)

---

**Version**: 1.0  
**Last Updated**: 2026-01-15
