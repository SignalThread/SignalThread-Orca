-- Update questions for retail-demo event with retail-specific wording
-- Run: psql -d your_database_name -f scripts/update-retail-questions.sql
-- Or copy-paste into your database client

-- First, ensure the event exists
-- (If it doesn't exist yet, visit http://localhost:3000/kiosk?eventId=retail-demo first)

-- Update Question 1: Product quality (food/beverage)
UPDATE "Question"
SET 
  "text" = 'How would you rate the quality of your food or beverage?',
  "order" = 1,
  "isRequired" = true,
  "isEnabled" = true
WHERE 
  "eventId" = 'retail-demo' 
  AND "key" = 'overall_rating';

-- Update Question 2: Speed of service
UPDATE "Question"
SET 
  "text" = 'How was the speed of service during your visit?',
  "order" = 2,
  "isRequired" = true,
  "isEnabled" = true
WHERE 
  "eventId" = 'retail-demo' 
  AND "key" = 'liked_most';

-- Update Question 3: Staff experience
UPDATE "Question"
SET 
  "text" = 'How would you describe your experience with our staff?',
  "order" = 3,
  "isRequired" = true,
  "isEnabled" = true
WHERE 
  "eventId" = 'retail-demo' 
  AND "key" = 'improvements';

-- Update Question 4: Generic follow-up (freeform)
UPDATE "Question"
SET 
  "text" = 'Is there anything else you''d like to share about your visit today?',
  "order" = 4,
  "isRequired" = false,
  "isEnabled" = true
WHERE 
  "eventId" = 'retail-demo' 
  AND "key" = 'anything_else';

-- Verify the changes
SELECT 
  "eventId",
  "key",
  "order",
  "text",
  "isRequired"
FROM "Question"
WHERE "eventId" = 'retail-demo'
ORDER BY "order" ASC;
