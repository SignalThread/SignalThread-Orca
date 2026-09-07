import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { keepTemporaryAiSuggestions, removeTemporaryAiSuggestion, replaceTemporaryAiSuggestion, updateTemporaryAiSuggestionText, type AdvancedBuilderQuestion } from '@/lib/advanced-temporary-ai-suggestions'
import { changeAdvancedQuestionType } from '@/lib/advanced-survey-question-type'

const newSurveyPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/[eventId]/surveys/new/page.tsx'),
  'utf8',
)

describe('events new survey page', () => {
  it('edits temporary suggestion wording in-place without changing its question type, then keeps that edited state', () => {
    const suggestions: AdvancedBuilderQuestion[] = [
      { id: 'one', text: 'How was the event?', type: 'OPEN_RESPONSE', required: true },
      { id: 'two', text: 'Would you return?', type: 'YES_NO', required: true },
    ]

    const edited = updateTemporaryAiSuggestionText(suggestions, 'two', 'Would you attend another event like this?')

    expect(edited).toEqual([
      suggestions[0],
      { ...suggestions[1], text: 'Would you attend another event like this?' },
    ])
    expect(edited[1].type).toBe('YES_NO')
    const savedIds = ['saved-one', 'saved-two']
    expect(keepTemporaryAiSuggestions(edited, () => savedIds.shift()!)).toEqual([
      { ...suggestions[0], id: 'saved-one' },
      { ...suggestions[1], id: 'saved-two', text: 'Would you attend another event like this?' },
    ])
  })

  it('promotes mixed AI suggestions into the existing canonical builder list without replacing questions', () => {
    const existing: AdvancedBuilderQuestion[] = [
      { id: 'existing', text: 'What should we improve?', type: 'OPEN_RESPONSE', required: true },
    ]
    const suggestions: AdvancedBuilderQuestion[] = [
      { id: 'temporary-open', text: 'How was the venue?', type: 'OPEN_RESPONSE', required: true },
      { id: 'temporary-rating', text: 'How satisfied were you?', type: 'RATING_1_TO_5', required: true },
      { id: 'temporary-yes-no', text: 'Would you return?', type: 'YES_NO', required: true },
    ]
    const generatedIds = ['kept-open', 'kept-rating', 'kept-yes-no']

    const next = [...existing, ...keepTemporaryAiSuggestions(suggestions, () => generatedIds.shift()!)]

    expect(next).toEqual([
      existing[0],
      { ...suggestions[0], id: 'kept-open' },
      { ...suggestions[1], id: 'kept-rating' },
      { ...suggestions[2], id: 'kept-yes-no' },
    ])
    expect(next.map((question) => question.type)).toEqual(['OPEN_RESPONSE', 'OPEN_RESPONSE', 'RATING_1_TO_5', 'YES_NO'])
  })

  it('replaces only the selected temporary AI suggestion and preserves all others', () => {
    const suggestions: AdvancedBuilderQuestion[] = [
      { id: 'one', text: 'First', type: 'OPEN_RESPONSE', required: true },
      { id: 'two', text: 'Second', type: 'YES_NO', required: true },
      { id: 'three', text: 'Third', type: 'RATING_1_TO_5', required: true },
    ]

    expect(replaceTemporaryAiSuggestion(suggestions, 'two', { text: 'Replacement', type: 'SINGLE_CHOICE', required: true, options: ['Yes', 'No'] })).toEqual([
      suggestions[0],
      { id: 'two', text: 'Replacement', type: 'SINGLE_CHOICE', required: true, options: ['Yes', 'No'] },
      suggestions[2],
    ])
  })

  it('preserves the original suggestion on regeneration failure and keeps remove scoped to that suggestion', () => {
    const suggestions: AdvancedBuilderQuestion[] = [
      { id: 'one', text: 'First', type: 'OPEN_RESPONSE', required: true },
      { id: 'two', text: 'Second', type: 'YES_NO', required: true },
    ]
    const regenerationBlock = newSurveyPageSource.match(/const regenerateAiSuggestion = async[\s\S]*?\n  const keepAiSuggestions/)?.[0] || ''

    expect(regenerationBlock).toContain('if (!response.ok || !body?.success || !replacement) throw new Error')
    expect(regenerationBlock).toContain('setAiError(error instanceof Error ? error.message')
    expect(regenerationBlock).not.toContain('setAiSuggestions([])')
    expect(removeTemporaryAiSuggestion(suggestions, 'one')).toEqual([suggestions[1]])
  })

  it('keeps whole-set regeneration and the per-suggestion controls independent', () => {
    expect(newSurveyPageSource).toContain('action: \'REGENERATE_AI_SUGGESTION\'')
    expect(newSurveyPageSource).toContain('aria-label={`Regenerate suggestion ${index + 1}`}')
    expect(newSurveyPageSource).toContain('onClick={generateWithAi}')
    expect(newSurveyPageSource).toContain('removeTemporaryAiSuggestion(current, question.id)')
    expect(newSurveyPageSource).toContain('aria-busy={isRegenerating}')
  })

  it('shows the current type in the expanded editor and immediately drives the collapsed badge from the changed question', () => {
    const changed = changeAdvancedQuestionType({ id: 'question_1', text: 'How was it?', type: 'OPEN_RESPONSE', required: true }, 'YES_NO')

    expect(changed.type).toBe('YES_NO')
    expect(newSurveyPageSource).toContain('Question type')
    expect(newSurveyPageSource).toContain('aria-label={`Question ${index + 1} type`}')
    expect(newSurveyPageSource).toContain('value={question.type}')
    expect(newSurveyPageSource).toContain('changeAdvancedQuestionType(item, event.target.value as AdvancedQuestionType)')
    expect(newSurveyPageSource).toContain('advancedSurveyQuestionTypeLabel(surveyContext, question.type)')
  })

  it('immediately renders the speaker-feedback default in the collapsed question card', () => {
    const changed = changeAdvancedQuestionType({ id: 'question_1', text: '', type: 'OPEN_RESPONSE', required: true }, 'SPEAKER_FEEDBACK')

    expect(changed.text).toBe('How would you rate {speaker_name}?')
    expect(newSurveyPageSource).toContain("{question.text.trim() || 'Untitled question'}")
    expect(newSurveyPageSource).toContain('Multiple speakers detected')
    expect(newSurveyPageSource).toContain('Ask once per speaker.')
  })

  it('creates editable smart defaults from survey context and question type', () => {
    expect(newSurveyPageSource).toContain('data-testid="advanced-survey-context"')
    expect(newSurveyPageSource).toContain('defaultAdvancedSurveyQuestion({ context: surveyContext, type, eventName: event.name })')
    expect(newSurveyPageSource).toContain("['VOICE_ONLY', 'Voice first'")
    expect(newSurveyPageSource).toContain("['TEXT_ONLY', 'Text / tap'")
    expect(newSurveyPageSource).toContain("['VOICE_AND_TEXT', 'Attendee chooses'")
  })

  it('uses the shared compact Events type roles in the Advanced builder', () => {
    for (const role of ['event-workspace-type', 'event-type-page-title', 'event-type-summary', 'event-type-section-title', 'event-type-row-title', 'event-type-meta', 'event-type-control', 'event-type-input', 'event-type-pill']) {
      expect(newSurveyPageSource).toContain(role)
    }
  })

  it('keeps the Advanced-only builder data-first and keyboard operable', () => {
    expect(newSurveyPageSource).toContain("if (event.eventType === 'ADVANCED' || isSimpleEvent)")
    expect(newSurveyPageSource).toContain('advancedSurveyQuestionTypeOptions(surveyContext)')
    expect(newSurveyPageSource).toContain('advancedSurveyQuestionTypeLabel(surveyContext, question.type)')
    expect(newSurveyPageSource).toContain("surveyContext === 'SESSIONS'")
    expect(newSurveyPageSource).toContain('Speaker feedback becomes available when Survey context is set to Sessions.')
    expect(newSurveyPageSource).toContain("event.key === 'ArrowDown'")
    expect(newSurveyPageSource).toContain("event.key === 'Enter'")
    expect(newSurveyPageSource).toContain('fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25')
    expect(newSurveyPageSource).toContain('max-w-[900px] -translate-y-[6vh]')
    expect(newSurveyPageSource).toContain('aria-modal="true"')
    expect(newSurveyPageSource).not.toContain('sm:absolute sm:inset-x-auto')
    expect(newSurveyPageSource).toContain('Multiple speakers detected')
    expect(newSurveyPageSource).toContain('Question deleted')
  })

  it('uses the shared builder for Simple Events while removing targeting', () => {
    expect(newSurveyPageSource).toContain("const isSimpleEvent = event.eventType === 'BLANK'")
    expect(newSurveyPageSource).toContain('<SimpleEventSurveyStartingPoint')
    expect(newSurveyPageSource).toContain('data-testid="simple-event-wide-survey-context"')
    expect(newSurveyPageSource).toContain('This survey covers the whole event — nothing to assign.')
    expect(newSurveyPageSource).toContain('Save &amp; Finish')
    expect(newSurveyPageSource).toContain('isSimpleEvent={isSimpleEvent}')
  })

  it('uses the canonical Voice-first default and derives presentation from the one response-mode setting', () => {
    expect(newSurveyPageSource).toContain('defaultNewEventSurveyExperience')
    expect(newSurveyPageSource).toContain("useState<'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'>(defaultNewEventSurveyExperience.responseMode)")
    expect(newSurveyPageSource).toContain('setOpenResponseMethod(survey.responseMode ?? defaultNewEventSurveyExperience.responseMode)')
    expect(newSurveyPageSource).toContain('const presentationMode = presentationModeForResponseMode(openResponseMethod)')
    expect(newSurveyPageSource).toContain('responseMode: openResponseMethod, surveyContext, speakerFeedbackMode, ttsVoice: questionVoice')
    expect(newSurveyPageSource).not.toContain('presentationMode, responseMode: openResponseMethod')
    expect(newSurveyPageSource).toContain('responseMode={openResponseMethod}')
    expect(newSurveyPageSource).toContain('presentationMode={presentationMode}')
  })

  it('uses the approved tabbed builder and keeps response mode exclusively in Experience', () => {
    expect(newSurveyPageSource).toContain("const [activeTab, setActiveTab] = useState<AdvancedBuilderTab>('QUESTIONS')")
    expect(newSurveyPageSource).toContain("{ id: 'QUESTIONS', label: 'Questions' }")
    expect(newSurveyPageSource).toContain("{ id: 'EXPERIENCE', label: 'Experience' }")
    expect(newSurveyPageSource).toContain("{ id: 'AVAILABILITY', label: 'Availability' }")
    expect(newSurveyPageSource).toContain("{ id: 'REVIEW', label: 'Review' }")
    expect(newSurveyPageSource).toContain("tab.id === 'QUESTIONS' && <span")
    expect(newSurveyPageSource).toContain("activeTab === 'QUESTIONS'")
    expect(newSurveyPageSource).toContain("activeTab === 'EXPERIENCE'")
    expect(newSurveyPageSource).toContain("activeTab === 'AVAILABILITY'")
    expect(newSurveyPageSource).toContain("activeTab === 'REVIEW'")
    expect(newSurveyPageSource).toContain('Change in Experience')
    expect(newSurveyPageSource).toContain("onClick={() => setActiveTab('EXPERIENCE')}")
    expect(newSurveyPageSource).toContain("activeTab === 'EXPERIENCE' && <section")
    expect(newSurveyPageSource).toContain('aria-label="Response mode"')
    expect(newSurveyPageSource).not.toContain('Question presentation')
    expect(newSurveyPageSource).not.toContain('How should this survey run?')
    expect(newSurveyPageSource).not.toContain('Who chooses presentation?')
    expect(newSurveyPageSource).not.toContain('Attendee at start')
    expect(newSurveyPageSource).not.toContain('Fine-tune')
    expect(newSurveyPageSource).not.toContain('experiencePreset')
  })

  it('keeps only a Simple creation flow in the starting-point route while preserving normal survey back navigation', () => {
    expect(newSurveyPageSource).toContain("const simpleCreationFlow = searchParams.get('simpleCreation') === '1'")
    expect(newSurveyPageSource).toContain("query.set('simpleCreation', '1')")
    expect(newSurveyPageSource).toContain('const simpleStartingPointPath = (() => {')
    expect(newSurveyPageSource).toContain('simpleCreationFlow={simpleCreationFlow}')
    expect(newSurveyPageSource).toContain('simpleStartingPointPath={simpleStartingPointPath}')
    expect(newSurveyPageSource).toContain("const backPath = isSimpleEvent && simpleCreationFlow && simpleStartingPointPath ? simpleStartingPointPath : surveysPath")
    expect(newSurveyPageSource).toContain('data-testid="simple-creation-builder-back"')
  })

  it('loads an existing Advanced survey into the same canonical builder', () => {
    expect(newSurveyPageSource).toContain("const existingSurveyId = searchParams.get('survey')?.trim() || ''")
    expect(newSurveyPageSource).toContain('initialSurveyId={existingSurveyId}')
    expect(newSurveyPageSource).toContain('&survey=${encodeURIComponent(initialSurveyId)}')
    expect(newSurveyPageSource).toContain('setSurveyName(survey.name ?? \'\')')
    expect(newSurveyPageSource).toContain('setQuestions((survey.questions ?? []).map')
    expect(newSurveyPageSource).toContain('buildAdvancedSurveyBuilderSnapshot(survey)')
    expect(newSurveyPageSource).toContain('setSurveyStatus(next.surveyStatus)')
    expect(newSurveyPageSource).toContain("surveyStatus === 'ACTIVE' ? 'Active'")
  })

  it('holds existing surveys behind a deterministic hydration boundary', () => {
    const loadingBoundary = newSurveyPageSource.indexOf('if (existingSurveyIsLoading)')
    const editableBuilder = newSurveyPageSource.indexOf('data-testid="advanced-event-survey-builder"')

    expect(newSurveyPageSource).toContain("status: 'loading' | 'ready' | 'error'")
    expect(newSurveyPageSource).toContain('data-testid="advanced-survey-loading"')
    expect(newSurveyPageSource).toContain('Loading existing survey…')
    expect(newSurveyPageSource).toContain('data-testid="advanced-survey-load-error"')
    expect(newSurveyPageSource).toContain("setExistingSurveyLoad({ surveyId: initialSurveyId, status: 'ready', error: null })")
    expect(loadingBoundary).toBeGreaterThan(-1)
    expect(loadingBoundary).toBeLessThan(editableBuilder)
  })

  it('uses only the survey-scoped GET when hydrating an existing survey', () => {
    const existingSurveyGet = newSurveyPageSource.match(/fetch\(`\/api\/app\/events\/\$\{event\.id\}\/advanced-survey-builder\?account=\$\{encodeURIComponent\(accountSlug\)\}&survey=\$\{encodeURIComponent\(initialSurveyId\)\}`/g)

    expect(existingSurveyGet).toHaveLength(1)
    expect(newSurveyPageSource).not.toContain("method: 'GET'")
  })

  it('renders field-specific validation on collapsed questions and focuses review issues', () => {
    expect(newSurveyPageSource).toContain('advancedSurveyQuestionValidationIssues(question, index)')
    expect(newSurveyPageSource).toContain("data-validation-state={hasValidationIssue ? 'invalid' : 'valid'}")
    expect(newSurveyPageSource).toContain('Needs attention')
    expect(newSurveyPageSource).toContain("issue.field === 'text'")
    expect(newSurveyPageSource).toContain('focusQuestionReviewIssue(questionIssue)')
    expect(newSurveyPageSource).toContain('document.getElementById(targetId)?.focus()')
    expect(newSurveyPageSource).toContain("!editedRef.current && saveState === 'saved'")
  })

  it('keeps Advanced assignment, response mode, and availability in their approved tabs', () => {
    expect(newSurveyPageSource).toContain("['EVENT', 'Event-wide']")
    expect(newSurveyPageSource).toContain("['SESSION', 'Sessions']")
    expect(newSurveyPageSource).toContain("['SPEAKER', 'Speakers']")
    expect(newSurveyPageSource).toContain("['LOCATION', 'Event Areas']")
    expect(newSurveyPageSource).toContain("setAssignmentSelection('ALL')")
    expect(newSurveyPageSource).toContain('Save assignment')
    expect(newSurveyPageSource).toContain('Choose how attendees answer this survey.')
    expect(newSurveyPageSource).toContain('Ratings, Yes/No, and other structured answers are still stored as structured data.')
    expect(newSurveyPageSource).not.toContain('Type decides what Pulse stores')
    expect(newSurveyPageSource).not.toContain('Voice first is on. Every question')
    expect(newSurveyPageSource).toContain("['VOICE_ONLY', 'Voice first'")
    expect(newSurveyPageSource).toContain("['TEXT_ONLY', 'Text / tap'")
    expect(newSurveyPageSource).toContain("['VOICE_AND_TEXT', 'Attendee chooses'")
    expect(newSurveyPageSource).toContain('advancedLabels')
    expect(newSurveyPageSource).toContain('lockTimezone')
  })

  it('uses the canonical curated voice catalog and safe preview endpoint in the Advanced experience card', () => {
    expect(newSurveyPageSource).toContain('Pulse voice')
    expect(newSurveyPageSource).toContain('Pulse language')
    expect(newSurveyPageSource).toContain('TTS_LOCALE_LABELS')
    expect(newSurveyPageSource).toContain('handleQuestionVoiceLocaleChange')
    expect(newSurveyPageSource).toContain('TTS_VOICE_PROFILE_OPTIONS')
    expect(newSurveyPageSource).toContain('getCuratedVoiceOptionsForGender(questionVoiceProfile)')
    expect(newSurveyPageSource).toContain('handlePreviewQuestionVoice')
    expect(newSurveyPageSource).toContain('/api/app/question-audio/preview?account=${encodeURIComponent(accountSlug)}')
    expect(newSurveyPageSource).toContain('text: QUESTION_AUDIO_PREVIEW_TEXT')
    expect(newSurveyPageSource).toContain('ttsVoice: questionVoice')
    expect(newSurveyPageSource).toContain('Preview plays a short sample only.')
    expect(newSurveyPageSource).toContain('option.name ?? option.label')
    expect(newSurveyPageSource).toContain('option.description ?? option.label')
    expect(newSurveyPageSource).not.toContain('Tone &amp; delivery')
  })

  it('tracks Pulse previewing by the requested voice without changing the selected voice', () => {
    const previewHandler = newSurveyPageSource.match(/const handlePreviewQuestionVoice = async[\s\S]*?\n  \}/)?.[0] || ''

    expect(newSurveyPageSource).toContain('const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)')
    expect(previewHandler).toContain('setPreviewingVoiceId(voice)')
    expect(previewHandler).toContain('const requestId = ++previewVoiceRequestIdRef.current')
    expect(previewHandler).toContain('if (requestId === previewVoiceRequestIdRef.current)')
    expect(previewHandler).toContain('setPreviewingVoiceId((current) => current === voice ? null : current)')
    expect(previewHandler).not.toContain('setQuestionVoice(')
    expect(newSurveyPageSource).toContain("previewingVoiceId === option.value ? 'Previewing…' : 'Preview'")
    expect(newSurveyPageSource).toContain('disabled={!accountSlug}')
    expect(newSurveyPageSource).not.toContain('previewingQuestionVoice')
  })

  it('normalizes only unsupported initial Events-builder voices and never renders a legacy current-voice option', () => {
    expect(newSurveyPageSource).toContain('useState(() => normalizeCuratedTtsVoice(event.ttsVoice))')
    expect(newSurveyPageSource).toContain('setQuestionVoice(normalizeCuratedTtsVoice(survey.ttsVoice || event.ttsVoice))')
    expect(newSurveyPageSource).toContain('setQuestionVoice(normalizeCuratedTtsVoice(nextVoice))')
    expect(newSurveyPageSource).toContain('questionVoiceToneOptions.map((option)')
    expect(newSurveyPageSource).not.toContain('questionVoiceToneOptionsWithCurrent')
    expect(newSurveyPageSource).not.toContain("name: 'Current Pulse voice'")
    expect(newSurveyPageSource).toContain('ttsVoice: questionVoice')
    expect(newSurveyPageSource).toContain('voice,')
  })

  it('opens a separate end-to-end survey preview without persisting preview state', () => {
    expect(newSurveyPageSource).toContain('title="Survey Preview"')
    expect(newSurveyPageSource).toContain('data-testid="advanced-full-survey-preview"')
    expect(newSurveyPageSource).toContain("import { OrganizerSurveyPreview } from '@/components/kiosk/OrganizerSurveyPreview'")
    expect(newSurveyPageSource).toContain('variant="full"')
    expect(newSurveyPageSource).toContain('variant="inline"')
    expect(newSurveyPageSource).toContain('setPreviewStartDetails')
    expect(newSurveyPageSource).toContain('speakerName={previewSpeakerName}')
    expect(newSurveyPageSource).toContain('Preview only — responses are not recorded.')
    const previewMarkup = newSurveyPageSource.slice(newSurveyPageSource.indexOf('data-testid="advanced-full-survey-preview"'))
    expect(previewMarkup).not.toContain('markEdited')
    expect(previewMarkup).not.toContain('updateQuestions')
    expect(previewMarkup).not.toContain('/api/response/create')
  })

  it('confirms forward-only reassignment when a persisted Advanced survey has responses', () => {
    expect(newSurveyPageSource).toContain('setResponseCount(next.responseCount)')
    expect(newSurveyPageSource).toContain('setPendingResponseHistoryAssignment(nextSpecs)')
    expect(newSurveyPageSource).toContain('title="Change survey assignment?"')
    expect(newSurveyPageSource).toContain('Existing responses will remain associated with their original assignment.')
  })

  it('surfaces canonical speakerless-session assignment warnings without blocking the assignment', () => {
    expect(newSurveyPageSource).toContain('setAssignmentWarning(body.data.assignmentWarnings?.map')
    expect(newSurveyPageSource).toContain('role="status"')
    expect(newSurveyPageSource).toContain('{assignmentWarning}</p>')
  })

  it('keeps question autosave active while skipping unchanged server snapshot writes', () => {
    expect(newSurveyPageSource).toContain('applyAdvancedSurveyBuilderSnapshot(appliedSurveySnapshotFingerprintRef.current, snapshot')
    expect(newSurveyPageSource).toContain('appliedSurveySnapshotFingerprintRef.current = result.fingerprint')
    expect(newSurveyPageSource).toContain('setQuestions(next)')
    expect(newSurveyPageSource).toMatch(/\[accountSlug, availability, collectionPhase, event\.id, openResponseMethod, questionVoice, questions, speakerFeedbackMode, surveyContext, surveyName\]/)
  })

  it('keeps Advanced AI suggestions temporary, rewrites explicit, and publish review actionable', () => {
    expect(newSurveyPageSource).toContain('Suggestions stay temporary until you keep them')
    expect(newSurveyPageSource).toContain('Temporary suggestions')
    expect(newSurveyPageSource).toContain('Keep questions')
    expect(newSurveyPageSource).toContain('Regenerate')
    expect(newSurveyPageSource).toContain('Accept wording')
    expect(newSurveyPageSource).toContain('Original')
    expect(newSurveyPageSource).toContain('Suggested')
    expect(newSurveyPageSource).toContain('{lifecyclePresentation.reviewTitle}')
    expect(newSurveyPageSource).toContain('Assignment is optional and can be added later.')
    expect(newSurveyPageSource).toContain("method: 'PATCH'")
  })

  it('renders temporary wording as an inline editable field backed by the suggestion state', () => {
    expect(newSurveyPageSource).toContain('const [editingAiSuggestion, setEditingAiSuggestion]')
    expect(newSurveyPageSource).toContain('aria-label={`Edit suggestion ${index + 1}`}')
    expect(newSurveyPageSource).toContain('value={question.text}')
    expect(newSurveyPageSource).toContain('updateTemporaryAiSuggestionText(current, question.id, event.target.value)')
    expect(newSurveyPageSource).toContain("event.key === 'Enter'")
    expect(newSurveyPageSource).toContain("event.key === 'Escape'")
    const keepHandler = newSurveyPageSource.match(/const keepAiSuggestions = \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
    expect(keepHandler).toContain('keepTemporaryAiSuggestions(aiSuggestions, () => crypto.randomUUID())')
    expect(keepHandler).toContain('updateQuestions([...questions, ...keptQuestions])')
    expect(keepHandler).toContain('setAiPanelOpen(false)')
    expect(keepHandler).toContain('setAiError(message)')
    expect(keepHandler).not.toContain('crypto.randomUUID)')
  })

  it('derives draft-only actions and their errors from persisted survey lifecycle presentation', () => {
    expect(newSurveyPageSource).toContain('resolveAdvancedSurveyBuilderLifecyclePresentation(surveyStatus)')
    expect(newSurveyPageSource).toContain('lifecyclePresentation.isDraft && !questionsLocked && aiPanelOpen')
    expect(newSurveyPageSource).toContain('lifecyclePresentation.isDraft && <button type="button" onClick={() => { setAiPanelOpen(true)')
    expect(newSurveyPageSource).toContain('lifecyclePresentation.isDraft && <button type="button" onClick={publishSurvey}')
    expect(newSurveyPageSource).toContain('{lifecyclePresentation.reviewTitle}')
    expect(newSurveyPageSource).not.toContain('The current persisted survey configuration is shown below.')
    expect(newSurveyPageSource).toContain('setPublishError(error instanceof Error ? error.message')
    expect(newSurveyPageSource).toContain('publishError && <p role="alert"')
    expect(newSurveyPageSource).toContain('id="advanced-survey-name" value={surveyName}')
    expect(newSurveyPageSource).toContain('onChange={(event) => updateQuestions(')
  })

  it('uses the shared portal action menu and a canonical attendee viewport in both previews', () => {
    expect(newSurveyPageSource).toContain("import { EventRowActionOverflow } from '@/components/events/EventRowActionControl'")
    expect(newSurveyPageSource).toContain('<EventRowActionOverflow label={`Question ${index + 1} actions`}')
    expect(newSurveyPageSource).toContain('<Copy className="h-3.5 w-3.5" /> Duplicate')
    expect(newSurveyPageSource).toContain('<Trash2 className="h-3.5 w-3.5" /> Delete')
    expect(newSurveyPageSource).not.toContain('<details className="relative">')
    expect(newSurveyPageSource).toContain("import { OrganizerSurveyPreview } from '@/components/kiosk/OrganizerSurveyPreview'")
    expect(newSurveyPageSource).toContain('<OrganizerSurveyPreview')
    expect(newSurveyPageSource).not.toContain("previewQuestion.type === 'OPEN_RESPONSE' && openResponseMethod !== 'TEXT_ONLY'")
    expect(newSurveyPageSource).not.toContain('<p className="mt-3 text-sm font-bold text-slate-900">Tap to answer</p>')
    expect(newSurveyPageSource).not.toContain('aria-label="Preview previous question"')
    expect(newSurveyPageSource).not.toContain('aria-label="Preview next question"')
    expect(newSurveyPageSource).not.toContain('Their answer…')
  })

  it('keeps assignment in Availability and context independent from assignment', () => {
    expect(newSurveyPageSource).toContain("activeTab === 'AVAILABILITY' && (!isSimpleEvent")
    expect(newSurveyPageSource).toContain('Assignment is optional. It controls where this survey runs.')
    expect(newSurveyPageSource).not.toContain('Assign this survey to a session, speaker, or event area to enable context-aware questions.')
  })

  it('keeps preview and review copy consistent with the current assignment', () => {
    expect(newSurveyPageSource).toContain("previewContextLabel ? 'Assignment context is shown in the preview.'")
    expect(newSurveyPageSource).toContain("assignmentTargets.length > 0 ? 'Ready to publish.' : 'Ready to publish. Assignment may remain empty.'")
  })

  it('waits for canonical saved review state and never combines a save error with Ready to publish', () => {
    expect(newSurveyPageSource).toContain("const publishReadinessPending = editedRef.current || saveState !== 'saved'")
    expect(newSurveyPageSource).toContain('publishReadinessPending ? <p role="status"')
    expect(newSurveyPageSource).toContain('Checking publish readiness…')
    expect(newSurveyPageSource).not.toContain('Assign a specific session before publishing speaker feedback.')
  })


  it('keeps safe survey fields editable while visibly locking response-bearing question structure', () => {
    expect(newSurveyPageSource).toContain('const questionsLocked = responseCount > 0')
    expect(newSurveyPageSource).toContain('Questions are locked because this survey has responses. Survey details and voice settings can still be updated.')
    expect(newSurveyPageSource).toContain('id="advanced-survey-name" value={surveyName} onChange=')
    expect(newSurveyPageSource).not.toContain('advanced-survey-intro')
    expect(newSurveyPageSource).not.toContain('setDescription(')
    expect(newSurveyPageSource).toContain('readOnly={questionsLocked}')
    expect(newSurveyPageSource).toContain('draggable={!questionsLocked}')
    expect(newSurveyPageSource).toContain('disabled={questionsLocked || index === 0}')
    expect(newSurveyPageSource).toContain('disabled={questionsLocked} className="inline-flex items-center gap-1.5 rounded-lg border')
    expect(newSurveyPageSource).toContain('handleQuestionVoiceToneChange')
    expect(newSurveyPageSource).not.toContain('Surveys with responses cannot use builder autosave')
  })

  it('is a dedicated Events-only route with back and cancel navigation', () => {
    expect(newSurveyPageSource).toContain('function NewEventSurveyContent()')
    expect(newSurveyPageSource).toContain('Back to Surveys')
    expect(newSurveyPageSource).toContain('New Survey')
    expect(newSurveyPageSource).toContain('Cancel')
    expect(newSurveyPageSource).toContain("`/app/events/${eventId}?account=${accountSlug}&tab=surveys`")
    expect(newSurveyPageSource).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
  })

  it('opens directly on survey content with exactly two visible steps', () => {
    expect(newSurveyPageSource).toContain("{ number: 1, label: 'Survey' }")
    expect(newSurveyPageSource).toContain("{ number: 2, label: 'Voice & Review' }")
    expect(newSurveyPageSource).not.toContain("{ number: 1, label: 'Survey Focus' }")
    expect(newSurveyPageSource).not.toContain("{ number: 3, label: 'Voice & Review' }")
    expect(newSurveyPageSource).not.toContain('>Survey Focus</h2>')
    expect(newSurveyPageSource).toContain('{step === 1 && (')
    expect(newSurveyPageSource).toContain('>Survey</h2>')
    expect(newSurveyPageSource).toContain('<QuestionBuilder')
    expect(newSurveyPageSource).toContain('step < 2')
  })

  it('keeps the launch target as compact context and resolves direct speaker targets', () => {
    expect(newSurveyPageSource).toContain('const targetLabel = isBulkSessionSurvey')
    expect(newSurveyPageSource).toContain("speakerTarget?.name ? `Speaker: ${speakerTarget.name}` : 'Selected speaker'")
    expect(newSurveyPageSource).toContain("selectedSurveyStructureItemId: preselectedSpeakerId ? '' : selectedStructureItemId")
    expect(newSurveyPageSource).toContain(";(createSurveyPayload as Record<string, unknown>).surveyTargetId = preselectedTargetId")
    expect(newSurveyPageSource).toContain("targetCategory: preselectedSpeakerId ? 'SPEAKER' : 'EVENT'")
    expect(newSurveyPageSource).toContain(";(createSurveyPayload as Record<string, unknown>).speakerId = preselectedSpeakerId")
    expect(newSurveyPageSource).not.toContain('Speakers cannot be survey targets')
    expect(newSurveyPageSource).not.toContain('This destination was selected from Survey coverage')
    expect(newSurveyPageSource).not.toContain('This survey will collect feedback for the selected event target')
  })

  it('removes introductory content copy while preserving the canonical create flow', () => {
    expect(newSurveyPageSource).not.toContain('Sets up a listening point for')
    expect(newSurveyPageSource).not.toContain('Name this survey and add the questions attendees will answer.')
    expect(newSurveyPageSource).toContain('buildEventVoiceSurveyCreatePayload')
    expect(newSurveyPageSource).toContain('fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`')
    expect(newSurveyPageSource).toContain('body: JSON.stringify({ ...createSurveyPayload, collectionPhase, availability, creationRequestId })')
    expect(newSurveyPageSource).toContain('router.push(createdSurveyId ? surveyEditPath(createdSurveyId) : surveysPath)')
  })

  it('keeps response window, voice, and review together in the second step', () => {
    expect(newSurveyPageSource).toContain('{step === 2 && (')
    expect(newSurveyPageSource).toContain('Response method &amp; review')
    expect(newSurveyPageSource).toContain('<SurveyAvailabilityEditor')
    expect(newSurveyPageSource).toContain('scheduleUnavailableReason={scheduleUnavailableReason}')
    expect(newSurveyPageSource).toContain('Change voice')
    expect(newSurveyPageSource).toContain('The survey is created as a draft.')
  })
})
