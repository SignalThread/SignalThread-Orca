/**
 * Retail Template
 * 
 * Configuration for voice feedback at retail locations (coffee shops, pizza, bakery, etc.)
 * This is a stub to prove the template architecture works.
 */

import { ProductTemplate, ThemeBucket, DefaultQuestion } from './types'

// Theme buckets for retail
const retailThemeBuckets: ThemeBucket[] = [
  {
    name: 'Product Quality',
    keywords: ['product', 'quality', 'taste', 'fresh', 'flavor', 'delicious', 'food', 'drink'],
  },
  {
    name: 'Service Speed',
    keywords: ['fast', 'slow', 'wait', 'quick', 'speed', 'time', 'line', 'queue'],
  },
  {
    name: 'Staff & Friendliness',
    keywords: ['staff', 'friendly', 'helpful', 'rude', 'polite', 'smile', 'customer service'],
  },
  {
    name: 'Cleanliness & Ambiance',
    keywords: ['clean', 'dirty', 'ambiance', 'atmosphere', 'music', 'seating', 'comfortable'],
  },
  {
    name: 'Value & Pricing',
    keywords: ['price', 'expensive', 'cheap', 'value', 'cost', 'affordable', 'worth'],
  },
  {
    name: 'Location & Convenience',
    keywords: ['location', 'parking', 'access', 'convenient', 'easy', 'find'],
  },
]

// Default questions for retail (exactly 3)
const retailDefaultQuestions: DefaultQuestion[] = [
  {
    key: 'q1_overall_rating',
    text: 'On a scale of 1 to 5, how would you rate your visit today?',
    order: 1,
    isRequired: true,
    isEnabled: true,
  },
  {
    key: 'q2_recommend',
    text: 'Would you recommend us to a friend or colleague?',
    order: 2,
    isRequired: true,
    isEnabled: true,
  },
  {
    key: 'q3_feedback',
    text: 'What did you think of your experience? Please share any feedback.',
    order: 3,
    isRequired: true,
    isEnabled: true,
  },
]

// High-impact keywords for retail (focus on operational issues)
const retailHighImpactKeywords = [
  'immediately', 'urgent', 'never', 'always', 'horrible', 'terrible',
  'improve', 'fix', 'change', 'add', 'hire', 'train',
  'dirty', 'rude', 'slow', 'cold', 'burnt', 'wrong',
]

// Low-impact keywords for retail
const retailLowImpactKeywords = [
  'minor', 'consider', 'maybe', 'could', 'suggestion',
  'decor', 'music', 'color', 'nice to have',
]

/**
 * Retail Product Template
 * Voice feedback for retail locations (coffee, pizza, bakery, etc.)
 */
export const retailTemplate: ProductTemplate = {
  useCase: 'retail',
  
  displayName: 'Retail & Food Service',
  description: 'Audio feedback for coffee shops, restaurants, bakeries, and retail stores',
  icon: '🛍️',
  
  // Admin Overview Sections (retail-specific)
  // Note: Different order and sections than events
  overviewSections: [
    {
      id: 'key-metrics',
      label: 'Location Metrics', // Retail-specific label
      order: 1,
      enabled: true,
      renderer: () => null, // Implemented in overview page
    },
    {
      id: 'location-insights-header',
      label: 'Customer Feedback Insights', // Retail-specific label
      order: 2,
      enabled: true,
      renderer: () => null,
    },
    {
      id: 'action-items',
      label: 'Priority Action Items', // Retail: Action items FIRST (higher priority)
      order: 3,
      enabled: true,
      renderer: () => null,
    },
    {
      id: 'retail-ops-summary',
      label: 'Weekly Operations Summary', // RETAIL-ONLY section
      order: 4,
      enabled: true,
      renderer: () => null,
    },
    {
      id: 'sentiment',
      label: 'Customer Satisfaction', // Retail-specific label
      order: 5,
      enabled: true,
      renderer: () => null,
    },
    {
      id: 'themes',
      label: 'Feedback Categories', // Retail-specific label
      order: 6,
      enabled: true,
      renderer: () => null,
    },
    {
      id: 'summary',
      label: 'Executive Summary', // Lower priority for retail
      order: 7,
      enabled: true,
      renderer: () => null,
    },
    {
      id: 'retail-review-cta',
      label: 'Google Review Campaign', // RETAIL-ONLY section
      order: 8,
      enabled: true,
      renderer: () => null,
    },
    // Note: No question drilldown for retail (different UX)
    {
      id: 'quick-links',
      label: 'Quick Links',
      order: 9,
      enabled: true,
      renderer: () => null,
    },
  ],
  
  // Kiosk Configuration
  defaultQuestions: retailDefaultQuestions,
  consentText: 'We\'d love to hear about your visit! Your feedback helps us serve you better.',
  completionMessage: 'Thanks for your feedback! See you next time!',
  
  // Analysis Configuration
  themeBuckets: retailThemeBuckets,
  highImpactKeywords: retailHighImpactKeywords,
  lowImpactKeywords: retailLowImpactKeywords,
  
  // UI Customization
  primaryColor: '#10b981', // Green
  brandingText: 'Customer Feedback',
  
  // Behavior flags
  enableRealTimeNotifications: true, // More important for retail
  enableMultiLanguage: false,
  requireAttendeeId: false, // Anonymous for retail
}

/**
 * Coffee Shop Vertical
 */
export const coffeeVertical: Partial<ProductTemplate> = {
  vertical: 'coffee',
  displayName: 'Coffee Shop',
  description: 'Coffee shop and café feedback',
  
  defaultQuestions: [
    {
      key: 'q1_overall_rating',
      text: 'On a scale of 1 to 5, how would you rate your visit today?',
      order: 1,
      isRequired: true,
      isEnabled: true,
    },
    {
      key: 'q2_coffee_quality',
      text: 'How was your coffee or drink?',
      order: 2,
      isRequired: true,
      isEnabled: true,
    },
    {
      key: 'q3_feedback',
      text: 'What else would you like to share about your experience?',
      order: 3,
      isRequired: true,
      isEnabled: true,
    },
  ],
  
  themeBuckets: [
    {
      name: 'Coffee Quality',
      keywords: ['coffee', 'espresso', 'latte', 'cappuccino', 'brew', 'roast', 'flavor', 'taste'],
    },
    ...retailThemeBuckets,
  ],
}

/**
 * Pizza Shop Vertical
 */
export const pizzaVertical: Partial<ProductTemplate> = {
  vertical: 'pizza',
  displayName: 'Pizza Restaurant',
  description: 'Pizza restaurant feedback',
  
  defaultQuestions: [
    {
      key: 'q1_overall_rating',
      text: 'On a scale of 1 to 5, how would you rate your visit today?',
      order: 1,
      isRequired: true,
      isEnabled: true,
    },
    {
      key: 'q2_pizza_quality',
      text: 'How was your pizza?',
      order: 2,
      isRequired: true,
      isEnabled: true,
    },
    {
      key: 'q3_feedback',
      text: 'What else would you like to share about your experience?',
      order: 3,
      isRequired: true,
      isEnabled: true,
    },
  ],
  
  themeBuckets: [
    {
      name: 'Pizza Quality',
      keywords: ['pizza', 'crust', 'toppings', 'cheese', 'sauce', 'hot', 'fresh', 'crispy'],
    },
    ...retailThemeBuckets,
  ],
}
