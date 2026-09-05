/**
 * The single editorial layer for Event Intelligence. Aggregation decides what
 * is true; this module decides how those facts are expressed to an event
 * leader. It deliberately has no database access and never promotes isolated
 * evidence into the event story.
 */
export type EventEditorialLifecycle = 'PRE_EVENT' | 'DURING_EVENT' | 'POST_EVENT'

export type EventEditorialFact = {
  title: string
  statement?: string | null
  kind: 'positive' | 'risk' | 'signal' | 'opportunity' | 'theme'
  evidenceTier: 'STRONG' | 'REPEATED' | 'EMERGING' | 'ISOLATED' | string
  mentionCount?: number
  sentimentLabel?: string | null
  /** Canonical target kind, used only to favor breadth across event dimensions. */
  scope?: string | null
}

export type EventEditorialSynthesis = {
  headline: string
  synopsis: string
  keyTakeaway: string
}

export const EVENT_INTELLIGENCE_EDITORIAL_PROMPT_VERSION = 'event-intelligence-editorial-v2'

const MECHANICAL_LANGUAGE = /\b(the evidence suggests|an emerging signal indicates|across\s+\d+\s+analyzed answers|configured feedback points|the data indicates|based on the available evidence|feedback points to)\b/i

function clean(value: string | null | undefined) {
  return value?.trim().replace(/[.!?]+$/, '') ?? ''
}

function lowerLead(value: string) {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value
}

function copula(value: string) {
  const lastWord = value.trim().split(/\s+/).at(-1)?.toLowerCase() ?? ''
  return lastWord.endsWith('s') && !lastWord.endsWith('ss') ? 'are' : 'is'
}

function topic(value: string) {
  return clean(value).replace(/\s+(?:is|are|was|were|needs?|need|remains?|remain|emerges?|emerging)\b.*$/i, '').trim() || clean(value)
}

function firstSentence(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalized
}

function humanStatement(value: string | null | undefined) {
  return firstSentence(value)
    .replace(/^attendees consistently reported that\s+/i, '')
    .replace(/^attendees consistently valued\s+/i, 'The strongest positive feedback centered on ')
    .replace(/^attendees consistently (?:said|shared) that\s+/i, '')
}

function evidenceTierRank(value: string) {
  const tier = value.trim().toUpperCase()
  if (tier === 'STRONG') return 3
  if (tier === 'REPEATED') return 2
  if (tier === 'EMERGING') return 1
  return 0
}

function supportedFacts(facts: EventEditorialFact[]) {
  return facts
    .map((fact, index) => ({ fact, index }))
    .filter(({ fact }) => clean(fact.title) && evidenceTierRank(fact.evidenceTier) > 0)
    .filter(({ fact }, index, source) => source.findIndex(({ fact: candidate }) => clean(candidate.title).toLowerCase() === clean(fact.title).toLowerCase()) === index)
    .sort((left, right) => (
      evidenceTierRank(right.fact.evidenceTier) - evidenceTierRank(left.fact.evidenceTier)
      || (right.fact.mentionCount ?? 0) - (left.fact.mentionCount ?? 0)
      || left.index - right.index
    ))
    .map(({ fact }) => fact)
}

function isRisk(fact: EventEditorialFact) {
  if (fact.kind === 'opportunity' || fact.kind === 'positive') return false
  return fact.kind === 'risk' || fact.kind === 'signal' || fact.sentimentLabel?.toUpperCase() === 'NEGATIVE' || fact.sentimentLabel?.toUpperCase() === 'MIXED'
}

function isStrength(fact: EventEditorialFact) {
  return fact.kind !== 'opportunity' && !isRisk(fact) && (fact.kind === 'positive' || fact.sentimentLabel?.toUpperCase() === 'POSITIVE')
}

function isOpportunity(fact: EventEditorialFact) {
  return fact.kind === 'opportunity'
}

function isEstablished(fact: EventEditorialFact) {
  return evidenceTierRank(fact.evidenceTier) >= 2
}

function naturalList(values: string[]) {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function withoutEventName(value: string, eventName?: string | null) {
  const normalizedEventName = clean(eventName)
  if (!normalizedEventName) return clean(value)
  const escapedEventName = normalizedEventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stripped = clean(value)
    .replace(new RegExp(escapedEventName, 'gi'), '')
    .replace(/^[\s:;,.\-–—]+|[\s:;,.\-–—]+$/g, '')
    .trim()
  return stripped
}

function factTitle(fact: EventEditorialFact | undefined, eventName?: string | null) {
  return fact ? topic(withoutEventName(fact.title, eventName)) : ''
}

function listFactTitles(facts: EventEditorialFact[], eventName?: string | null) {
  return naturalList(facts.map((fact) => lowerLead(factTitle(fact, eventName))).filter(Boolean))
}

function diverseFacts(facts: EventEditorialFact[], limit: number) {
  const result: EventEditorialFact[] = []
  const seenScopes = new Set<string>()
  for (const fact of facts) {
    const scope = clean(fact.scope).toLowerCase()
    if (!scope || scope === 'event' || seenScopes.has(scope)) continue
    result.push(fact)
    seenScopes.add(scope)
    if (result.length === limit) return result
  }
  for (const fact of facts) {
    if (result.includes(fact)) continue
    result.push(fact)
    if (result.length === limit) break
  }
  return result
}

function prioritizedFacts(facts: EventEditorialFact[]) {
  const selected: EventEditorialFact[] = []
  const add = (candidates: EventEditorialFact[], limit: number) => {
    for (const fact of diverseFacts(candidates, limit)) {
      if (!selected.includes(fact)) selected.push(fact)
    }
  }
  add(facts.filter(isStrength), 2)
  add(facts.filter(isRisk), 2)
  add(facts.filter(isOpportunity), 1)
  add(facts.filter((fact) => !isStrength(fact) && !isRisk(fact) && !isOpportunity(fact)), 1)
  for (const fact of facts) {
    if (selected.length === 6) break
    if (!selected.includes(fact)) selected.push(fact)
  }
  return selected
}

function overviewSentences(
  lifecycle: EventEditorialLifecycle,
  facts: EventEditorialFact[],
  eventName?: string | null,
) {
  const strengths = facts.filter(isStrength).slice(0, 2)
  const risks = facts.filter(isRisk).slice(0, 2)
  const opportunities = facts.filter(isOpportunity).slice(0, 2)
  const otherThemes = facts.filter((fact) => !isStrength(fact) && !isRisk(fact) && !isOpportunity(fact)).slice(0, 2)
  const sentences: string[] = []
  const early = (values: EventEditorialFact[]) => values.length > 0 && values.every((fact) => !isEstablished(fact))

  if (lifecycle === 'PRE_EVENT') {
    if (strengths.length) sentences.push(`${early(strengths) ? 'Early attendee interest is forming around' : 'Attendee expectations and excitement are clustering around'} ${listFactTitles(strengths, eventName)}.`)
    if (otherThemes.length) sentences.push(`${early(otherThemes) ? 'Early pre-event themes include' : 'Other recurring pre-event themes include'} ${listFactTitles(otherThemes, eventName)}.`)
    if (opportunities.length) sentences.push(`${early(opportunities) ? 'An early planning opportunity is' : 'The strongest planning opportunities center on'} ${listFactTitles(opportunities, eventName)}.`)
    if (risks.length) sentences.push(`${early(risks) ? 'Early questions before doors open include' : 'The main questions and risks before doors open center on'} ${listFactTitles(risks, eventName)}.`)
  } else if (lifecycle === 'DURING_EVENT') {
    if (strengths.length) sentences.push(`${early(strengths) ? 'An early positive signal is forming around' : 'What is working is clearest around'} ${listFactTitles(strengths, eventName)}.`)
    if (otherThemes.length) sentences.push(`${early(otherThemes) ? 'Early live patterns include' : 'Other recurring live patterns include'} ${listFactTitles(otherThemes, eventName)}.`)
    if (risks.length) sentences.push(`${early(risks) ? 'An early friction signal is forming around' : 'The biggest live friction centers on'} ${listFactTitles(risks, eventName)}.`)
    if (opportunities.length) sentences.push(`${early(opportunities) ? 'An early live opportunity is' : 'The strongest live opportunities center on'} ${listFactTitles(opportunities, eventName)}.`)
  } else {
    if (strengths.length) sentences.push(`${early(strengths) ? 'Early positive feedback centered on' : 'The experience was ultimately defined by'} ${listFactTitles(strengths, eventName)}.`)
    if (otherThemes.length) sentences.push(`${early(otherThemes) ? 'Early post-event themes include' : 'Other recurring outcomes include'} ${listFactTitles(otherThemes, eventName)}.`)
    if (risks.length) sentences.push(`${early(risks) ? 'An early weakness to examine further is' : 'The biggest weaknesses and friction centered on'} ${listFactTitles(risks, eventName)}.`)
    if (opportunities.length) sentences.push(`${early(opportunities) ? 'An early next-event opportunity is' : 'The clearest lessons and next-event opportunities center on'} ${listFactTitles(opportunities, eventName)}.`)
  }

  return sentences
}

function leadershipPrioritySentence(lifecycle: EventEditorialLifecycle, facts: EventEditorialFact[], eventName?: string | null) {
  const priorities = listFactTitles(facts.slice(0, 3), eventName)
  const singular = facts.length === 1
  if (lifecycle === 'PRE_EVENT') return `Before doors open, leadership's ${singular ? 'clearest priority is' : 'priorities are'} ${priorities}.`
  if (lifecycle === 'DURING_EVENT') return `While there is still time to act, the team's ${singular ? 'clearest priority is' : 'priorities are'} ${priorities}.`
  return `The ${singular ? 'lesson leadership should carry forward is' : 'lessons leadership should carry forward are'} ${priorities}.`
}

function headlineFor(
  lifecycle: EventEditorialLifecycle,
  facts: EventEditorialFact[],
  eventName?: string | null,
) {
  const established = facts.filter(isEstablished)
  const headlinePool = established.length ? established : facts
  const strengthTitle = factTitle(headlinePool.find(isStrength), eventName)
  const riskTitle = factTitle(headlinePool.find(isRisk), eventName)
  const opportunityTitle = factTitle(headlinePool.find(isOpportunity), eventName)
  const primaryTitle = factTitle(headlinePool[0], eventName)

  if (lifecycle === 'PRE_EVENT') {
    if (strengthTitle && riskTitle) return `${strengthTitle} ${copula(strengthTitle)} shaping expectations, while ${lowerLead(riskTitle)} ${copula(riskTitle)} the planning tension to resolve before doors open.`
    if (strengthTitle) return `${strengthTitle} ${copula(strengthTitle)} shaping what attendees expect most before doors open.`
    if (riskTitle) return `${riskTitle} ${copula(riskTitle)} the clearest planning risk before doors open.`
    return `${opportunityTitle || primaryTitle} ${copula(opportunityTitle || primaryTitle)} the clearest opportunity to sharpen the pre-event plan.`
  }
  if (lifecycle === 'DURING_EVENT') {
    if (strengthTitle && riskTitle) return `${strengthTitle} ${copula(strengthTitle)} carrying the experience, while ${lowerLead(riskTitle)} ${copula(riskTitle)} the live friction that still needs attention.`
    if (strengthTitle) return `${strengthTitle} ${copula(strengthTitle)} defining what is working across the live experience.`
    if (riskTitle) return `${riskTitle} ${copula(riskTitle)} the clearest live friction to address while there is still time.`
    return `${opportunityTitle || primaryTitle} ${copula(opportunityTitle || primaryTitle)} the clearest live opportunity.`
  }
  if (strengthTitle && riskTitle) return `${strengthTitle} defined the experience, while ${lowerLead(riskTitle)} became the clearest lesson to carry forward.`
  if (strengthTitle) return `${strengthTitle} ${copula(strengthTitle) === 'are' ? 'were' : 'was'} the defining strength to preserve.`
  if (riskTitle) return `${riskTitle} ${copula(riskTitle)} the clearest weakness to carry into the next event plan.`
  return `${opportunityTitle || primaryTitle} ${copula(opportunityTitle || primaryTitle)} the clearest learning to carry forward.`
}

function fallbackStory(lifecycle: EventEditorialLifecycle) {
  if (lifecycle === 'PRE_EVENT') {
    return {
      headline: 'The early signal is not yet strong enough to set a planning priority.',
      synopsis: 'No recurring expectation, source of excitement, or planning risk is established yet. Keep collecting attendee input before making a major agenda or experience decision. The next useful signal should clarify what people expect and where preparation needs to be sharper.',
      keyTakeaway: 'Build the plan around recurring attendee needs, not isolated comments.',
    }
  }
  if (lifecycle === 'DURING_EVENT') {
    return {
      headline: 'The event story is still forming.',
      synopsis: 'There is not yet a supported pattern strong enough to call a strength or a friction point. No event-wide priority should be inferred from isolated feedback. Keep the team close to live feedback so a recurring issue can be addressed while the event is still underway.',
      keyTakeaway: 'Wait for a repeated pattern before changing the live experience.',
    }
  }
  return {
    headline: 'The final story needs more supported attendee input.',
    synopsis: 'There is not enough recurring feedback to make a durable call on what carried the experience or what held it back. Isolated comments are not being promoted into event-wide lessons. Preserve the available follow-through and use the next event to build a clearer learning base.',
    keyTakeaway: 'Carry forward only lessons that recur across the event.',
  }
}

/** A deterministic, fact-only synthesis used in every lifecycle surface and as Sol's safe fallback. */
export function synthesizeEventEditorial(input: {
  lifecycle: EventEditorialLifecycle
  facts: EventEditorialFact[]
  eventName?: string | null
}): EventEditorialSynthesis {
  const facts = supportedFacts(input.facts).filter((fact) => factTitle(fact, input.eventName))
  if (facts.length === 0) return fallbackStory(input.lifecycle)

  const selectedFacts = prioritizedFacts(facts)
  const synopsisSentences = overviewSentences(input.lifecycle, selectedFacts, input.eventName)
  if (synopsisSentences.length < 2) {
    const primaryStatement = withoutEventName(humanStatement(selectedFacts[0]?.statement), input.eventName)
      || `${factTitle(selectedFacts[0], input.eventName)} remains the clearest recurring theme`
    synopsisSentences.push(`${clean(primaryStatement)}.`)
  }
  synopsisSentences.push(leadershipPrioritySentence(input.lifecycle, selectedFacts, input.eventName))
  const priorityTitles = listFactTitles(selectedFacts.slice(0, 3), input.eventName)
  const keyTakeaway = input.lifecycle === 'PRE_EVENT'
    ? `Keep ${priorityTitles} at the center of final planning.`
    : input.lifecycle === 'DURING_EVENT'
      ? `Keep attention on ${priorityTitles} while the event is still live.`
      : `Carry ${priorityTitles} into follow-through and the next event plan.`

  return {
    headline: headlineFor(input.lifecycle, selectedFacts, input.eventName),
    synopsis: synopsisSentences.slice(0, 5).join(' '),
    keyTakeaway,
  }
}

export function eventEditorialWritingRules(lifecycle: EventEditorialLifecycle) {
  const lifecycleFocus = lifecycle === 'PRE_EVENT'
    ? 'Synthesize what attendees expect, what excites them, the strongest planning opportunities, the main pre-door risks or questions, notable speaker/session/agenda/networking themes, and the two or three priorities leadership should care about before the event.'
    : lifecycle === 'DURING_EVENT'
      ? 'Synthesize what is working across the event, the strongest positive experience drivers, the biggest live friction, notable session/speaker/event-area patterns, any supported change from expectations, and the two or three priorities the team should care about while there is time to act.'
      : 'Synthesize what ultimately defined the experience, the strongest successes, the biggest weaknesses or friction, notable session/speaker/event-area outcomes, anything the additional post-event feedback explicitly confirmed or sharpened, and the two or three lessons leadership should carry forward.'
  return `Think like an analyst. Write like a sharp B2B marketer and executive strategist.
- ${lifecycleFocus}
- Treat the Overview as the whole event picture, not as a single finding. Use the breadth of the major evidence clusters and include multiple event dimensions when the supplied facts support them.
- Prioritize recurring, high-confidence themes. Do not reduce the story to one positive finding and one concern, enumerate every finding, or promote isolated evidence.
- Use only the structured facts supplied. Never invent a cause, recommendation, number, person, quote, or conclusion.
- Give the story first: a specific strength, tension, risk, or opportunity. Do not open with counts, sentiment percentages, coverage, methodology, or a list of findings.
- The headline is one strong sentence that captures the overall event story or tension. The synopsis is three to five concise sentences that cover the major supported themes in proportion to the evidence.
- The event name is already visible. Never repeat it in the headline or opening sentence.
- Do not sound like a dashboard, research paper, data scientist, or LLM. Avoid: "the evidence suggests", "an emerging signal indicates", "configured feedback points", "the data indicates", "based on the available evidence", and "feedback points to".
- Do not elevate ISOLATED or EMERGING facts into a major conclusion. Keep emerging facts explicitly early or directional when they add a genuinely distinct dimension.
- Do not repeat metric-card values in prose. Keep language specific, commercially aware, human, and easy to scan.`
}

export function hasMechanicalEditorialLanguage(value: string) {
  return MECHANICAL_LANGUAGE.test(value)
}
