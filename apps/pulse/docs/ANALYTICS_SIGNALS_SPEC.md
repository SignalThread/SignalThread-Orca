# Analytics Signals Specification

**Version:** 1.0  
**Last Updated:** 2026-01-29

---

## Overview

Deterministic computation rules for four synthesized analytics signals derived from customer feedback data.

**Data Model:** `Event → Response → Answer`

**Inputs Available:**
- `answer.sentimentScore` (float, -1.0 to 1.0)
- `answer.sentimentLabel` (string: POSITIVE, NEGATIVE, NEUTRAL, MIXED)
- `answerAnalysis.themesJson.themes` (string[])
- `answerAnalysis.actionsJson.actionItems` (ActionItem[])
- `response.startedAt` (timestamp)
- `response.status` (enum: COMPLETED, etc.)

---

## 1. PULSE

### Purpose
Overall health indicator combining sentiment quality, response volume, and feedback diversity.

### Formula
```
pulse_score = (sentiment_component * 0.50) + 
              (volume_component * 0.30) + 
              (diversity_component * 0.20)
```

### Component Calculations

#### Sentiment Component (0-50 points)
```sql
-- Step 1: Get raw sentiment average
raw_sentiment_avg = AVG(answer.sentimentScore) 
  WHERE answer.status = 'COMPLETED' 
  AND answer.answerAnalysis IS NOT NULL

-- Step 2: Normalize from -1→1 range to 0→1 range
normalized_sentiment = (raw_sentiment_avg + 1) / 2

-- Step 3: Scale to 50 points
sentiment_component = normalized_sentiment * 50
```

#### Volume Component (0-30 points)
```
completed_responses = COUNT(response) 
  WHERE response.status = 'COMPLETED'

volume_baseline = 50  // expected responses per period

volume_component = MIN((completed_responses / volume_baseline) * 30, 30)
// Capped at 30 even if > baseline
```

#### Diversity Component (0-20 points)
```
unique_themes = COUNT(DISTINCT theme) 
  FROM answerAnalysis.themesJson.themes

diversity_baseline = 10  // expected distinct themes

diversity_component = MIN((unique_themes / diversity_baseline) * 20, 20)
// Capped at 20 even if > baseline
```

### Total Score (0-100)
```
pulse_score = ROUND(sentiment_component + volume_component + diversity_component)
```

### Score → Label Mapping
| Score Range | Label |
|-------------|-------|
| 80-100 | `GREAT` |
| 60-79 | `GOOD` |
| 40-59 | `MIXED` |
| 0-39 | `NEEDS_ATTENTION` |

### Period Comparison (Delta)
```
current_period_pulse = compute_pulse(current_period_start, current_period_end)
previous_period_pulse = compute_pulse(previous_period_start, previous_period_end)

pulse_delta = current_period_pulse - previous_period_pulse

where:
  period_length = current_period_end - current_period_start
  previous_period_end = current_period_start - 1 day
  previous_period_start = previous_period_end - period_length
```

### Edge Cases
| Condition | Behavior |
|-----------|----------|
| 0 completed responses | `pulse_score: null, reason: "NO_DATA"` |
| < 3 completed responses | `pulse_score: computed, confidence: "LOW"` |
| No sentiment data | `sentiment_component = 25` (neutral baseline) |
| No themes | `diversity_component = 0` |
| Previous period has no data | `pulse_delta: null` |

### Output Schema
```typescript
{
  pulse: {
    score: number | null,        // 0-100
    label: 'GREAT' | 'GOOD' | 'MIXED' | 'NEEDS_ATTENTION' | null,
    delta: number | null,        // -100 to +100
    confidence: 'HIGH' | 'LOW' | null,
    components: {
      sentiment: number,         // 0-50
      volume: number,            // 0-30
      diversity: number          // 0-20
    },
    metadata: {
      responseCount: number,
      themeCount: number,
      avgSentiment: number       // raw -1 to 1
    }
  }
}
```

---

## 2. MOMENTUM

### Purpose
Directional trend indicator showing whether sentiment is improving, declining, or stable over time.

### Method
Linear regression on daily average sentiment scores.

### Calculation Steps

#### Step 1: Build Daily Sentiment Series
```sql
daily_sentiment = 
  SELECT DATE(response.startedAt) as day,
         AVG(answer.sentimentScore) as avg_sentiment
  FROM responses
  WHERE response.status = 'COMPLETED'
  AND answer.answerAnalysis IS NOT NULL
  GROUP BY DATE(response.startedAt)
  ORDER BY day ASC
```

#### Step 2: Compute Linear Regression
```
Given: points (x, y) where x = day_index (0, 1, 2, ..., n-1)
                        and y = daily_sentiment[day]

slope (m) = (n * Σ(xy) - Σx * Σy) / (n * Σ(x²) - (Σx)²)

where:
  n = number of days with data
  Σxy = sum of (day_index * sentiment) for all days
  Σx = sum of day_index
  Σy = sum of sentiment
  Σ(x²) = sum of (day_index²)
```

#### Step 3: Compute Confidence (R²)
```
r² = 1 - (SS_residual / SS_total)

where:
  SS_residual = Σ(y_actual - y_predicted)²
  SS_total = Σ(y_actual - y_mean)²
```

### Slope → Label Mapping
| Condition | Label |
|-----------|-------|
| `slope > +0.02` AND `r² >= 0.3` | `IMPROVING` |
| `slope < -0.02` AND `r² >= 0.3` | `DECLINING` |
| `-0.02 <= slope <= +0.02` | `FLAT` |
| `r² < 0.3` | `FLAT` (low confidence = treat as stable) |

### Thresholds Explained
- **±0.02 slope threshold:** Represents ~2% sentiment change per day, filters noise
- **0.3 r² threshold:** Minimum explained variance to trust trend direction
- If trend is weak (low r²), default to FLAT regardless of slope

### Minimum Data Requirements
| Requirement | Threshold | Fallback |
|-------------|-----------|----------|
| Days with data | >= 7 | Return `null` |
| Total responses | >= 10 | Return `null` |
| Min responses per day | >= 1 | Include day in regression |

### Edge Cases
| Condition | Behavior |
|-----------|----------|
| < 7 days of data | `momentum: null, reason: "INSUFFICIENT_DAYS"` |
| < 10 total responses | `momentum: null, reason: "INSUFFICIENT_VOLUME"` |
| All sentiment scores identical | `slope: 0, label: "FLAT", r²: 1.0` |
| Only 1 day has data | `momentum: null, reason: "INSUFFICIENT_DAYS"` |

### Output Schema
```typescript
{
  momentum: {
    label: 'IMPROVING' | 'FLAT' | 'DECLINING' | null,
    slope: number | null,        // daily rate of change
    confidence: number | null,   // r² value (0-1)
    metadata: {
      daysWithData: number,
      totalResponses: number,
      dateRange: {
        start: string,           // ISO date
        end: string              // ISO date
      }
    }
  }
}
```

---

## 3. TOP FRICTION

### Purpose
Identify the single most impactful negative theme driving poor customer experience.

### Algorithm Overview
1. Filter to negative themes only
2. Compute friction score (frequency + severity + recency)
3. Select theme with highest score
4. Apply tie-breaking rules

### Step 1: Filter Negative Themes
```sql
negative_themes = 
  SELECT theme, 
         COUNT(*) as mention_count,
         AVG(answer.sentimentScore) as avg_sentiment,
         MAX(response.startedAt) as last_mention
  FROM answerAnalysis.themesJson.themes
  WHERE answer.sentimentScore < -0.3
  GROUP BY theme
```

**Threshold:** Theme must have `avg_sentiment < -0.3` to qualify as negative

### Step 2: Compute Friction Score
```
friction_score = (frequency_weight * 0.50) +
                 (severity_weight * 0.35) +
                 (recency_weight * 0.15)
```

#### Frequency Weight (0-1)
```
frequency_weight = theme.mention_count / max_mention_count

where:
  max_mention_count = MAX(mention_count) among all negative themes
```

#### Severity Weight (0-1)
```
severity_weight = ABS(theme.avg_sentiment) / 1.0

// More negative sentiment = higher severity
// e.g., sentiment of -0.8 → severity_weight = 0.8
```

#### Recency Weight (0-1)
```
days_since_last_mention = (current_date - theme.last_mention) / 1 day

recency_weight = EXP(-days_since_last_mention / 7.0)

// Exponential decay with 7-day half-life
// Recent mention (0 days) → 1.0
// 7 days ago → 0.37
// 14 days ago → 0.14
```

### Step 3: Select Top Theme
```
top_friction = theme WHERE friction_score = MAX(friction_score)
```

### Tie-Breaking (if scores within 0.01)
**Priority order:**
1. Higher `mention_count`
2. More negative `avg_sentiment`
3. More recent `last_mention`
4. Alphabetical (deterministic fallback)

### Edge Cases
| Condition | Behavior |
|-----------|----------|
| No themes with `avg_sentiment < -0.3` | `topFriction: null` |
| Only 1 negative theme | Return it (no comparison needed) |
| < 5 total responses | `topFriction: null, reason: "INSUFFICIENT_DATA"` |
| All negative themes have 1 mention | Tie-break by severity |

### Output Schema
```typescript
{
  topFriction: {
    theme: string | null,
    frictionScore: number | null,    // 0-1
    mentionCount: number | null,
    avgSentiment: number | null,     // -1 to 0
    lastMention: string | null,      // ISO timestamp
    components: {
      frequencyWeight: number,
      severityWeight: number,
      recencyWeight: number
    }
  }
}
```

---

## 4. BIGGEST OPPORTUNITY

### Purpose
Identify high-impact, low-effort improvement opportunity distinct from current friction points.

### Algorithm Overview
1. Build candidate pool (neutral themes + medium actions)
2. Exclude top friction overlap
3. Compute opportunity score
4. Select highest-scoring candidate

### Step 1: Build Candidate Pool

#### Source A: Neutral Themes
```sql
neutral_themes = 
  SELECT theme,
         COUNT(*) as mention_count,
         AVG(answer.sentimentScore) as avg_sentiment
  FROM answerAnalysis.themesJson.themes
  WHERE answer.sentimentScore BETWEEN -0.3 AND 0.3
  GROUP BY theme
  HAVING COUNT(*) >= 3  -- min 3 mentions
```

#### Source B: Medium-Priority Actions
```sql
medium_actions = 
  SELECT actionItem.text,
         actionItem.priority,
         COUNT(*) as derived_count
  FROM answerAnalysis.actionsJson.actionItems
  WHERE actionItem.priority = 'Medium'
  GROUP BY actionItem.text
  HAVING COUNT(*) >= 2  -- min 2 occurrences
```

### Step 2: Exclusion Rules
**Exclude candidate if ANY of:**
- `candidate.text` contains `topFriction.theme` (case-insensitive substring match)
- `candidate.text` matches any High-priority action exactly
- `candidate` was top_friction in previous 2 time periods
- `candidate.mention_count < 3` (themes only)

### Step 3: Compute Opportunity Score
```
opportunity_score = (improvement_potential * 0.40) +
                    (frequency_signal * 0.35) +
                    (effort_estimate * 0.25)
```

#### Improvement Potential (0-1)

**For themes:**
```
improvement_potential = 0.5 + (avg_sentiment * -0.5)

// Sentiment of -0.3 → potential = 0.5 + 0.15 = 0.65
// Sentiment of  0.0 → potential = 0.5 + 0.0  = 0.50
// Sentiment of +0.3 → potential = 0.5 - 0.15 = 0.35

// Logic: Slightly negative themes have more upside than neutral/positive
```

**For actions:**
```
improvement_potential = 0.6  // fixed for Medium priority
```

#### Frequency Signal (0-1)

**For themes:**
```
frequency_signal = theme.mention_count / max_mention_count_in_pool
```

**For actions:**
```
frequency_signal = action.derived_count / max_action_count_in_pool
```

#### Effort Estimate (0-1)
```
word_count = LENGTH(candidate.text.split(' '))

effort_estimate = 1.0 - (word_count / 20.0)

// Cap word_count at 20
// Shorter text = assumed lower implementation effort
// 5 words  → effort = 0.75
// 10 words → effort = 0.50
// 20 words → effort = 0.00
```

### Step 4: Select Top Candidate
```
biggest_opportunity = candidate WHERE opportunity_score = MAX(opportunity_score)
```

### Tie-Breaking (if scores within 0.01)
**Priority order:**
1. Higher `frequency_signal`
2. Lower word count (easier to implement)
3. Type preference: `action` > `theme`
4. Alphabetical

### Edge Cases
| Condition | Behavior |
|-----------|----------|
| No candidates after exclusions | `biggestOpportunity: null` |
| < 5 total responses | `biggestOpportunity: null, reason: "INSUFFICIENT_DATA"` |
| Top friction is `null` | Skip exclusion check, process all candidates |
| All candidates excluded | `biggestOpportunity: null, reason: "ALL_EXCLUDED"` |

### Output Schema
```typescript
{
  biggestOpportunity: {
    type: 'theme' | 'action' | null,
    text: string | null,
    opportunityScore: number | null,  // 0-1
    mentionCount: number | null,
    priority: string | null,          // for actions only
    components: {
      improvementPotential: number,
      frequencySignal: number,
      effortEstimate: number
    }
  }
}
```

---

## Combined Output Schema

```typescript
interface AnalyticsSignals {
  pulse: {
    score: number | null,
    label: 'GREAT' | 'GOOD' | 'MIXED' | 'NEEDS_ATTENTION' | null,
    delta: number | null,
    confidence: 'HIGH' | 'LOW' | null,
    components: {
      sentiment: number,
      volume: number,
      diversity: number
    },
    metadata: {
      responseCount: number,
      themeCount: number,
      avgSentiment: number
    }
  },

  momentum: {
    label: 'IMPROVING' | 'FLAT' | 'DECLINING' | null,
    slope: number | null,
    confidence: number | null,
    metadata: {
      daysWithData: number,
      totalResponses: number,
      dateRange: {
        start: string,
        end: string
      }
    }
  },

  topFriction: {
    theme: string | null,
    frictionScore: number | null,
    mentionCount: number | null,
    avgSentiment: number | null,
    lastMention: string | null,
    components: {
      frequencyWeight: number,
      severityWeight: number,
      recencyWeight: number
    }
  },

  biggestOpportunity: {
    type: 'theme' | 'action' | null,
    text: string | null,
    opportunityScore: number | null,
    mentionCount: number | null,
    priority: string | null,
    components: {
      improvementPotential: number,
      frequencySignal: number,
      effortEstimate: number
    }
  },

  metadata: {
    periodStart: string,        // ISO timestamp
    periodEnd: string,          // ISO timestamp
    totalResponses: number,
    completedResponses: number,
    totalAnswers: number,
    computedAt: string          // ISO timestamp
  }
}
```

---

## Data Requirements Summary

| Signal | Min Responses | Min Days | Additional Requirements |
|--------|---------------|----------|------------------------|
| Pulse | 1 (null if 0) | 1 | Low confidence if < 3 responses |
| Momentum | 10 | 7 | Must have >= 7 days with data |
| Top Friction | 5 | 1 | At least 1 theme with sentiment < -0.3 |
| Biggest Opportunity | 5 | 1 | At least 1 neutral theme OR medium action |

---

## Implementation Notes

### Computation Order
1. Pulse (independent)
2. Momentum (independent)
3. Top Friction (independent)
4. Biggest Opportunity (depends on Top Friction for exclusion)

### Caching Considerations
- All signals are deterministic given fixed input data
- Safe to cache for duration of period window
- Invalidate cache on new response completion

### Testing Edge Cases
Required test scenarios:
- Empty dataset (0 responses)
- Minimal dataset (1-2 responses)
- No negative themes (all positive/neutral)
- No neutral themes (all positive/negative)
- Single-day data burst
- Sparse multi-day data
- All sentiment scores identical
- Ties in friction/opportunity scoring

---

**End of Specification**
