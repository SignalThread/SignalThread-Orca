# Model Selection Guide

Current model and Strength guidance for this repository.

The durable selection policy — the core rule and the recommendation
challenge rule — lives in [`ENGINEERING_STANDARDS.md`](./ENGINEERING_STANDARDS.md) under **Prompt Model Selection**. That policy
outlasts any particular model. This file is the time-sensitive half and is
expected to change as model availability changes.

Governing principle:

> **Use the best model for the job, at the lowest Strength that is still fully
> capable.**

Not cheapest possible. Not strongest possible.

---

## Strength labels

Use these labels exactly:

```txt
Low
Medium
High
Extra High
Max
```

**Low** — trivial, mechanical, extremely narrow, obvious execution.

**Medium** — normal bounded engineering, straightforward multi-file work,
standard feature implementation.

**High** — meaningful complexity, multiple interacting concerns, significant
regression risk, difficult reasoning, broad but controlled implementation.

**Extra High** — unusually broad audits, difficult autonomous debugging, many
interconnected edge cases, work where missing a subtle dependency would be
costly.

**Max** — exceptional use only. Max is not a normal escalation step. Do not
reach for it just because High felt insufficient on the first attempt.

## Model guidance

### Luna

Use for:

- trivial or highly mechanical work
- straightforward renames
- small copy changes
- simple field propagation
- reproducing an established pattern
- small deterministic test updates

Prefer Low or Medium Strength.

### Terra

Use for:

- normal product development
- bounded multi-file implementation
- forms
- standard API routes
- filters
- drawers/modals
- responsive UI
- ordinary feature work
- focused regression fixes
- implementation where the architecture is already understood

Terra should generally be the capability/cost sweet spot for normal engineering
work.

Prefer Medium. Use High when the task is broader or has several interacting
pieces but does not truly require Sol-level reasoning.

### Sol

Use for:

- complex debugging
- architecture work
- auth/authorization
- migrations
- shared data models
- difficult backend changes
- cross-system behavior
- high-risk production changes
- broad technical audits
- difficult root-cause analysis
- long implementation specs where missing a requirement could be expensive

Use Medium when the problem is bounded. Use High when there are several
interacting architectural or product concerns. Use Extra High only for unusually
broad or difficult autonomous work.

Do not default to Sol just because a ticket spans several files.

### Fable 5

Use for:

- major visual redesigns
- visual reconstruction
- large redesign passes
- major module builds
- ambitious autonomous implementation loops
- work requiring repeated visual/design convergence

Choose Strength based on scope.

### Opus

Use for:

- product reasoning
- UX critique
- workflow design
- challenging requirements
- identifying product contradictions
- collaborative planning
- deciding what should be built before implementation

Do not use Opus automatically for normal implementation when Terra or Sol is the
better engineering model.

### GPT-5.5

GPT-5.5 is a valid existing-session, compatibility, and familiar-fallback
choice. It is **not** the default for new prompts.

Older prompt packs in this repository may still carry:

```txt
Model: GPT-5.5
Reasoning: High
```

Do not mechanically preserve that as the default for new work, and do not create
a universal `GPT-5.5 High` default. If an active prompt genuinely calls for
GPT-5.5 based on current platform/model availability, it may still be selected.

The selection rule remains: best model for the actual task.

## Prompt header format

```txt
Model: [model]
Strength: [strength]
```

Example:

```txt
Model: Sol
Strength: High
```

Do not use `Recommended model:`, `Reasoning:`, or `Thinking:`.

Pick the model and the lowest sufficient Strength per prompt. Do not normalize a
whole prompt pack to a single pair.

## Historical prompt packs

Archived prompt packs, completed ledgers, and `Old/` directories are evidence of
what was actually run at the time. Leave their original headers intact, including
`Model: GPT-5.5 / Reasoning: High` and `Recommended model:` forms.

Only ACTIVE prompt documentation is held to the current header format.
