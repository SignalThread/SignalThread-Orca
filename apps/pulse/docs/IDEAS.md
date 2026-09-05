# Product Ideas & Exploration

This document captures potential future directions, experiments, and enhancements for SignalThread. Ideas are organized by theme and structured to facilitate rapid evaluation and testing.

Users

The 3 wireframes you actually need (text-only)
1) Platform Admin (/admin)

Audience: you / SignalThread team

Purpose: manage companies (accounts)

Page contents:

List of Accounts

Account name

Account ID

Type (Retail / Events / Hospitality)

Actions:

“Create Account”

“View Account”

Navigation:

Clicking an account → /admin/accounts/[accountId]

Guard:

SUPER_ADMIN only (middleware)

Important:
No events. No responses. No dashboards.

2) Company Admin Home (/app)

Audience: customer (Acme Coffee, TechConf)

Purpose: overview for one account

Assumptions:

Account context is already known (from auth)

Page contents:

Account name

Summary metrics (events, responses, sentiment)

Locations list

“Create Event”

Navigation:

Location → list of events

Event → /app/events/[eventId]

Guard:

ACCOUNT_ADMIN / MANAGER / VIEWER

Must have accountId

3) Event Dashboard (/app/events/[eventId])

Audience: customer

Purpose: analyze feedback for one event

Page contents:

KPIs

Themes

Action items

Responses drilldown

Guard:

Event must belong to user’s account

Redirect/403 if not

---

## 📋 Idea Template

Use this template for new ideas:

```markdown
### [Idea Name]

**Status**: 💡 Draft | 🔬 Exploring | ✅ Validated | ❌ Rejected | 🚀 Planned

**Wedge**: What's the compelling entry point or unique angle?

**Target Users**: Who specifically would use this? (personas, segments, use cases)

**Pains Addressed**: What specific problems does this solve? What's the current workaround?

**User Flow**: How would this work? (brief, 3-5 steps)

**Monetization Angle**: How could this drive value/revenue? (optional for MVP features)

**Risks & Open Questions**:
- Technical risks
- Business/market risks
- UX complexity risks
- Questions to answer

**Smallest Test**: What's the absolute minimum we could build/test to validate this?
- What we'd learn
- Success criteria
- Effort estimate (hours/days)

**Links**: Related docs, mockups, research, discussions
```

---

## 🎯 Ideas by Category

### 🚀 High Priority / Near-Term

*(Ideas that are well-validated or build directly on core MVP)*

---

### 🔮 Exploration / Medium-Term

*(Ideas worth exploring but need validation)*

#### Multi-Language Support

**Status**: 💡 Draft

**Wedge**: Enable global events and non-English speaking attendees to participate in voice surveys

**Target Users**:
- International conferences and events
- Multi-lingual organizations
- Events with diverse attendee demographics

**Pains Addressed**:
- Attendees who aren't comfortable speaking English miss out on providing feedback
- Event organizers can't capture feedback from entire audience
- Current transcription is English-only (OpenAI Whisper supports 50+ languages but we don't expose it)

**User Flow**:
1. Kiosk displays language selector on consent screen
2. Questions display in selected language (requires translated question sets)
3. Attendee records answer in their language
4. Transcription and analysis happen in that language
5. Admin dashboard shows language per response and can filter/group by language

**Monetization Angle**:
- Premium feature: "Multi-language events" tier
- Charge per language enabled per event
- Could justify 2-3x pricing for global events

**Risks & Open Questions**:
- Technical: How do we handle question translation? (manual vs. auto-translate)
- Technical: Does GPT-4 analysis work well in non-English languages?
- UX: Do we need translated UI text or just questions?
- Business: Is this a common enough pain point to justify complexity?

**Smallest Test**:
- Add language parameter to transcription API (Whisper already supports it)
- Manually translate 3-4 questions to Spanish
- Run 5-10 test recordings in Spanish
- Review transcript quality and analysis accuracy
- **Learn**: Is transcription + analysis quality acceptable in Spanish?
- **Success**: >90% transcription accuracy, meaningful analysis output
- **Effort**: 4-6 hours

**Links**: [OpenAI Whisper language support](https://platform.openai.com/docs/guides/speech-to-text)

---

#### Real-Time Admin Notifications

**Status**: 💡 Draft

**Wedge**: Event organizers can see feedback coming in during the event and react immediately

**Target Users**:
- Event organizers and staff monitoring feedback in real-time
- Conference ops teams who need to address issues mid-event

**Pains Addressed**:
- Organizers only see feedback after the event ends
- Can't catch and fix issues while attendees are still present
- Miss opportunity to engage with attendees who had negative experiences

**User Flow**:
1. Admin dashboard has a "Live Feed" view
2. As responses complete, they appear in real-time
3. Can see sentiment, key themes, urgent issues flagged
4. Click to read full response
5. Optional: Browser notifications for negative sentiment or keywords

**Monetization Angle**:
- Part of "Premium" or "Enterprise" tier
- Could be included in per-event pricing for large events
- Justifies higher price point for real-time value

**Risks & Open Questions**:
- Technical: Need WebSocket or SSE implementation (adds complexity)
- Technical: Does real-time polling suffice for MVP test?
- UX: Will admins actually monitor during events or is this a "nice to have"?
- Business: Do organizers care about real-time or is post-event review sufficient?

**Smallest Test**:
- Add simple polling (every 5 seconds) to responses list page
- Add "New Response" badge when new items appear
- Test with event organizer: have them monitor dashboard during a 1-hour test session
- **Learn**: Do they find value in monitoring? Do they take action?
- **Success**: Organizer identifies and acts on feedback within 15 minutes
- **Effort**: 3-4 hours (polling only, no WebSocket)

**Links**: -

---

### 💭 Long-Term / Speculative

*(Ideas that need more research or are significant pivots)*

#### Voice-to-Ticket Integration

**Status**: 💡 Draft

**Wedge**: Automatically convert action items from voice feedback into tickets in project management tools

**Target Users**:
- Event organizers using Jira, Linear, Asana, etc.
- Product teams running user research sessions
- Customer success teams tracking feedback

**Pains Addressed**:
- Action items identified in analysis sit in dashboard but don't get actioned
- Manual work to copy feedback into project management tools
- Context loss when transferring feedback to tickets

**User Flow**:
1. Admin reviews event analysis and sees action items
2. Clicks "Create Tickets" button
3. Selects target project/board in connected tool
4. Bulk creates tickets with:
   - Title: Action item text
   - Description: Related response excerpts + sentiment
   - Labels: Event name, theme tags
5. Link back to SignalThread response for full context

**Monetization Angle**:
- "Integrations" add-on or premium tier feature
- Could charge per integration or per event using integrations
- Increases stickiness (lock-in to workflow)

**Risks & Open Questions**:
- Technical: Need OAuth flows for each integration (significant dev work)
- Technical: How to handle mapping (which items → which tickets?)
- Business: Is this solving a real pain or nice-to-have?
- Business: Does this distract from core value prop?

**Smallest Test**:
- Add "Export as CSV" for action items with event context
- Ask 3-5 users to try importing into their PM tool manually
- Interview them about the process and pain points
- **Learn**: Is the manual process painful enough to warrant integration?
- **Success**: 3+ users say "I would pay for this to be automatic"
- **Effort**: 2 hours (CSV export only)

**Links**: -

---

#### Anonymous vs. Identified Attendees

**Status**: 💡 Draft

**Wedge**: Optional attendee identification for follow-up while preserving privacy option

**Target Users**:
- Event organizers who want to follow up with specific attendees
- Sales/marketing teams who want to capture leads
- Attendees who want to be contacted about their feedback

**Pains Addressed**:
- Can't follow up with attendees who had issues or great ideas
- Can't segment feedback by attendee type (VIP, speaker, sponsor, etc.)
- Can't track repeat attendees across events

**User Flow**:
1. After consent, optional screen: "Want us to follow up?" (email/phone)
2. If yes: capture contact info + optional attendee type
3. If no: proceed anonymously as current behavior
4. Admin can see identified vs. anonymous in response list
5. Admin can export identified attendee list with their feedback

**Monetization Angle**:
- Could enable "Lead Capture" use case (higher value)
- Unlock CRM integrations (Salesforce, HubSpot)
- Premium feature: "Attendee Management"

**Risks & Open Questions**:
- Privacy/Legal: Need clear consent language and data handling policy
- Privacy/Legal: GDPR/CCPA compliance considerations
- UX: Does asking for info reduce response rate?
- Business: Does this change the product positioning?

**Smallest Test**:
- Add optional email field at end of survey flow
- Run A/B test: with vs. without email capture
- Measure completion rate and email opt-in rate
- **Learn**: Does asking for email hurt completion? Do attendees opt in?
- **Success**: <10% drop in completion, >30% opt-in rate
- **Effort**: 4-6 hours

**Links**: -

---

## 🎨 UX/UI Improvements

*(Not full "ideas" but significant UX enhancements worth tracking)*

- **Kiosk Visual Polish**: Modern UI, animations, accessibility improvements
- **Admin Filters & Search**: Filter responses by date, status, sentiment; search transcripts
- **Admin Pagination**: Handle 1000+ responses gracefully
- **Export Functionality**: CSV/JSON export for responses and answers
- **Question Management UI**: Admin interface to create/edit/reorder questions
- **Custom Branding**: Upload logo, set colors per event
- **Offline Mode**: Queue recordings when network is unavailable

---

## 🔐 Technical Improvements

*(Infrastructure and technical debt items worth tracking)*

- **Admin Authentication**: Add NextAuth.js with role-based access control
- **Async Processing Queue**: Move transcription/analysis to background jobs (Bull/BullMQ)
- **Rate Limiting**: Protect APIs from abuse
- **Monitoring & Logging**: Add Sentry, LogRocket, or similar
- **Database Optimization**: Add indexes, query optimization for large datasets
- **CDN for Audio**: Use CloudFront/Cloudflare for audio playback
- **Automated Testing**: Unit tests, integration tests, E2E tests

---

## 📊 Analytics & Insights

*(Data/reporting enhancements)*

- **Sentiment Trends Over Time**: Track how sentiment changes throughout an event
- **Question Performance**: Which questions get the most insightful responses?
- **Response Time Patterns**: When do attendees engage most (start, end, breaks)?
- **Theme Evolution**: How do themes change day-over-day for multi-day events?
- **Comparative Analytics**: Compare sentiment/themes across multiple events
- **Benchmark Reports**: "Your event vs. industry average"

---

## 📝 Notes & Decision Log

### 2026-01-15: Ideas Backlog Created
- Created structured format for capturing product ideas
- Focused on lightweight evaluation framework (wedge, users, pains, tests)
- Initial ideas seeded from "What's NEXT" in PROJECT_CONTEXT.md
- Goal: Make it easy to capture ideas without committing to build them

---

## 🏃‍♂️ Next Actions

1. **User Interviews**: Schedule 3-5 interviews with event organizers to validate pain points
2. **Prioritization Session**: Score ideas on Value × Feasibility matrix
3. **Pick One Test**: Choose one "Smallest Test" to run in next sprint
4. **Competitive Research**: Document what competitors offer (if any)

---

**Template Version**: 1.0  
**Last Updated**: 2026-01-15
