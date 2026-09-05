/**
 * Events Template
 * 
 * Configuration for voice surveys at conferences, trade shows, workshops, etc.
 * This template preserves the current admin UX and behavior.
 */

import { ProductTemplate, ThemeBucket, DefaultQuestion } from './types'

// Theme buckets for events (current behavior from admin-insights.ts)
const eventsThemeBuckets: ThemeBucket[] = [
  {
    name: 'Experience Quality',
    keywords: ['experience', 'quality', 'service', 'satisfaction', 'overall'],
  },
  {
    name: 'Staff & Service',
    keywords: ['staff', 'team', 'employee', 'service', 'help', 'support', 'friendly'],
  },
  {
    name: 'Venue & Facilities',
    keywords: ['venue', 'location', 'facility', 'space', 'room', 'environment', 'atmosphere'],
  },
  {
    name: 'Content & Program',
    keywords: ['content', 'program', 'session', 'presentation', 'speaker', 'topic', 'agenda'],
  },
  {
    name: 'Logistics & Operations',
    keywords: ['logistics', 'organization', 'timing', 'schedule', 'registration', 'food', 'catering'],
  },
  {
    name: 'Communication',
    keywords: ['communication', 'information', 'clarity', 'updates', 'signage'],
  },
]

// Default questions for events (current behavior from lib/event.ts)
const eventsDefaultQuestions: DefaultQuestion[] = [
  {
    key: 'overall_rating',
    text: 'How would you rate your overall experience?',
    order: 1,
    isRequired: true,
    isEnabled: true,
  },
  {
    key: 'liked_most',
    text: 'What did you like most about your experience?',
    order: 2,
    isRequired: true,
    isEnabled: true,
  },
  {
    key: 'improvements',
    text: 'What could we improve?',
    order: 3,
    isRequired: true,
    isEnabled: true,
  },
  {
    key: 'anything_else',
    text: 'Anything else you\'d like to share?',
    order: 4,
    isRequired: false,
    isEnabled: true,
  },
]

// High-impact action item keywords (current behavior)
const eventsHighImpactKeywords = [
  'immediately', 'urgent', 'critical', 'essential', 'must',
  'improve', 'increase', 'add', 'implement', 'create',
  'staff', 'training', 'quality', 'safety', 'security',
]

// Low-impact action item keywords (current behavior)
const eventsLowImpactKeywords = [
  'minor', 'consider', 'optional', 'nice to have', 'eventually',
  'cosmetic', 'aesthetic', 'signage', 'decor',
]

/**
 * Events Product Template
 * Preserves current behavior for conference/event voice surveys
 */
export const eventsTemplate: ProductTemplate = {
  useCase: 'events',
  
  displayName: 'Events & Conferences',
  description: 'Audio feedback for conferences, trade shows, workshops, and live events',
  icon: '🎤',
  
  // Admin Overview Sections (current behavior)
  // These will be implemented as React components in the overview page
  overviewSections: [
    {
      id: 'key-metrics',
      label: 'Key Metrics',
      order: 1,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
    {
      id: 'event-insights-header',
      label: 'Event Insights Header',
      order: 2,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
    {
      id: 'summary',
      label: 'Summary',
      order: 3,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
    {
      id: 'sentiment',
      label: 'Sentiment',
      order: 4,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
    {
      id: 'themes',
      label: 'Top Themes',
      order: 5,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
    {
      id: 'action-items',
      label: 'Action Items',
      order: 6,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
    {
      id: 'question-drilldown',
      label: 'Questions',
      order: 7,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
    {
      id: 'quick-links',
      label: 'Quick Links',
      order: 8,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
  ],
  
  // Kiosk Configuration
  defaultQuestions: eventsDefaultQuestions,
  consentText: 'We value your feedback! Your input helps us improve future events.',
  completionMessage: 'Thank you for sharing your thoughts!',
  
  // Analysis Configuration
  themeBuckets: eventsThemeBuckets,
  highImpactKeywords: eventsHighImpactKeywords,
  lowImpactKeywords: eventsLowImpactKeywords,
  
  // UI Customization
  primaryColor: '#007bff', // Blue
  brandingText: 'Event Feedback',
  
  // Behavior flags
  enableRealTimeNotifications: false,
  enableMultiLanguage: false,
  requireAttendeeId: false,
}

/**
 * Conference vertical (optional sub-template)
 * Customizes questions and theme buckets for conferences specifically
 */
export const conferenceVertical: Partial<ProductTemplate> = {
  vertical: 'conference',
  displayName: 'Conferences',
  description: 'Multi-day professional conferences',
  
  defaultQuestions: [
    {
      key: 'overall_rating',
      text: 'How would you rate the conference overall?',
      order: 1,
      isRequired: true,
      isEnabled: true,
    },
    {
      key: 'best_sessions',
      text: 'Which sessions did you find most valuable?',
      order: 2,
      isRequired: true,
      isEnabled: true,
    },
    {
      key: 'networking',
      text: 'How was the networking experience?',
      order: 3,
      isRequired: true,
      isEnabled: true,
    },
    {
      key: 'improvements',
      text: 'What would make this conference better next year?',
      order: 4,
      isRequired: false,
      isEnabled: true,
    },
  ],
  
  themeBuckets: [
    ...eventsThemeBuckets,
    {
      name: 'Networking',
      keywords: ['networking', 'connections', 'meet', 'connect', 'attendees', 'peers'],
    },
  ],
}
