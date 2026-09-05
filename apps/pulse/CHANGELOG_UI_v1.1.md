# Customer Feedback Kiosk Dashboard UI Polish (v1.1)

**Branch:** `ui-kiosk-dashboard-v1-1`  
**Status:** Ready for review (not committed)

---

## Summary of Changes

This update polishes the retail dashboard layout and improves copy to be more store-friendly and human.

---

## Changes Made

### 1. **Executive Summary Moved to Top**
- Relocated from insights section to directly below the page header
- Now the first thing users see after the event title and controls
- **Lines affected:** 490-498 (new position)

### 2. **New Top Row Layout: Pulse + Recommendations**
- **Left side (50%):** Pulse module with circular score ring
- **Right side (50%):** Recommendations panel, vertically aligned with Pulse height
- Replaced previous layout where Pulse took 2/3 width and KPIs were stacked on the right
- **Lines affected:** 546-597

### 3. **Recommendations Panel Improvements**
- Shows **top 4 recommendations by default**
- Added **"View more / Show less" toggle** for expanding/collapsing
- Displays remaining count (e.g., "View 6 more →")
- Action text rewritten to be **store-friendly and human**:
  - ✅ "Set up quality checks" (not "Implement quality control")
  - ✅ "Look into pricing strategy" (not "Evaluate pricing strategy")
  - ✅ "Consider seasonal menu items" (not "Explore seasonal menu items")
  - ✅ "Improve WiFi system" (not "Optimize WiFi infrastructure")
- Priority badges remain unchanged (High/Medium/Low with colors)
- **Lines affected:** 
  - Helper function `humanizeAction()`: 473-485
  - State: 469
  - Panel rendering: 560-594

### 4. **4 Stat Cards in Single Row**
- Moved below the Pulse + Recommendations row
- Changed from vertically stacked (in right column) to horizontal grid
- Equal width, responsive (2 cols on mobile, 4 on desktop)
- Cards: Responses, Sentiment, Sentiment Score, Answers
- **Lines affected:** 596-612

### 5. **Color-Coded Theme Chips**
- Added sentiment-based color coding:
  - 🟢 **Green** = Positive themes (e.g., "Great Service", "Coffee Quality")
  - 🔴 **Red** = Negative themes (e.g., "Wait Time", "Slow Service")
  - ⚫ **Gray** = Neutral themes (default)
- Uses simple heuristic keyword matching (no new API calls)
- Helper function `getThemeColor()` detects sentiment from theme text
- **Lines affected:**
  - Helper function: 487-513
  - Theme rendering: 664-684

### 6. **Code Quality Improvements**
- Added state for recommendations expand/collapse: `showAllRecommendations`
- Duplicate sections removed (Executive Summary and Action Items were showing twice)
- Action Items section now conditionally renders:
  - **Retail:** Only in top Recommendations panel (not in insights section)
  - **Non-retail:** Remains in insights section with humanized copy
- Maintained all existing functionality and data flow

---

## Files Changed

### `app/app/events/[eventId]/page.tsx`
**Why:** Main dashboard component - all layout and UI changes

**Key changes:**
1. Added `showAllRecommendations` state (line 469)
2. Added `humanizeAction()` helper (lines 473-485)
3. Added `getThemeColor()` helper (lines 487-513)
4. Moved Executive Summary to top (lines 490-498)
5. Rebuilt retail layout: Pulse + Recommendations side-by-side (lines 546-612)
6. Updated theme chips with color coding (lines 664-684)
7. Made action items conditional (retail vs non-retail) (lines 686-705)

---

## Visual Changes Summary

### Before
```
[Header with controls]

[Pulse (2/3 width) | KPIs stacked (1/3 width)]

[Timeline chart]

[Executive Summary]
[Sentiment]
[Themes - plain gray chips]
[Action Items - full list]
```

### After
```
[Header with controls]

[Executive Summary] ← Moved to top

[Pulse (50%) | Recommendations (50%)] ← New layout
                  ↑ Shows 4, expandable
                  ↑ Store-friendly copy

[4 Stat Cards in horizontal row] ← Below Pulse

[Timeline chart]

[Sentiment]
[Themes - color-coded chips] ← Green/Red/Gray
[Action Items] ← Only for non-retail
```

---

## Testing Notes

- ✅ Build passes (`npm run build`)
- ✅ No new dependencies added
- ✅ Existing components and styling preserved
- ✅ Responsive design maintained
- ✅ Dark mode compatibility unchanged

---

## Recommendation Copy Examples

### Original AI Output → Humanized Version

| Original (Robotic) | Humanized (Store-Friendly) |
|-------------------|---------------------------|
| Implement quality control for drink temperature | Set up quality checks for drink temperature |
| Evaluate pricing strategy relative to competitors | Look into pricing strategy relative to competitors |
| Explore seasonal menu offerings | Consider seasonal menu offerings |
| Optimize WiFi infrastructure | Improve WiFi system |
| Conduct staff training on customer service | Do staff training on customer service |
| Ensure consistent inventory management | Make sure consistent inventory management |

---

## Theme Color Heuristic

Simple keyword-based detection (no API changes):

**Positive keywords:**
- great, excellent, friendly, quality, fast, clean

**Negative keywords:**
- slow, wait, dirty, poor, issue, problem, complaint

**Default:** Neutral (gray) for everything else

---

## Next Steps

1. Review this changelog
2. Test in browser (especially mobile responsive)
3. Verify theme color heuristic matches expectations
4. Commit if approved
5. Deploy to production

---

**No commit made yet. Ready for your review.**
