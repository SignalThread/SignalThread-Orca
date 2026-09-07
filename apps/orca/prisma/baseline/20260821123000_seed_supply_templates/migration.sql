-- The clean baseline already contains the Supplies schema from the original
-- 20260820 migration stack. Seed the system templates separately so a fresh
-- database has the same product defaults as an upgraded Planner OS database.
INSERT INTO "SupplyTemplate" (
  "key",
  "name",
  "triggerType",
  "triggerMeta",
  "isSystem",
  "updatedAt"
) VALUES
  ('meal-service', 'Meal service', 'MEAL_SERVICE', '{"keywords":["meal","lunch","dinner","breakfast","reception"]}', true, CURRENT_TIMESTAMP),
  ('general-session', 'General session', 'GENERAL_SESSION', '{"keywords":["general","keynote","plenary"]}', true, CURRENT_TIMESTAMP),
  ('workshop', 'Workshop', 'WORKSHOP', '{"keywords":["workshop","breakout","training"]}', true, CURRENT_TIMESTAMP),
  ('registration-arrival', 'Registration / arrival', 'REGISTRATION', '{"keywords":["registration","arrival","check-in"]}', true, CURRENT_TIMESTAMP),
  ('sponsor-activation', 'Sponsor activation', 'SPONSOR', '{"keywords":["sponsor","activation","expo"]}', true, CURRENT_TIMESTAMP),
  ('accessibility', 'Accessibility', 'ACCESSIBILITY', '{"always":true}', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") WHERE "isSystem" DO NOTHING;

-- Remove superseded registration defaults from the original V1 seed while
-- preserving the final refined registration template.
DELETE FROM "SupplyTemplateItem"
WHERE "templateId" IN (
  SELECT "id"
  FROM "SupplyTemplate"
  WHERE "key" = 'registration-arrival' AND "isSystem"
)
AND "name" NOT IN (
  'Badge stock',
  'Lanyards',
  'VIP badge sleeves',
  'Accessibility check-in kit',
  'Registration desk supplies',
  'Badge holders',
  'Registration desk pens',
  'Welcome cards',
  'Hand sanitizer',
  'Backup materials'
);

INSERT INTO "SupplyTemplateItem" (
  "templateId",
  "name",
  "category",
  "unit",
  "rationale",
  "quantityRule",
  "quantityFactor",
  "fixedQuantity",
  "sortOrder"
)
SELECT
  template."id",
  item."name",
  item."category",
  item."unit",
  item."rationale",
  item."rule"::"SupplyQuantityRule",
  item."factor",
  item."fixed",
  item."sort"
FROM "SupplyTemplate" AS template
JOIN (VALUES
  ('meal-service', 'Menu cards', 'Meal service', 'per table', 'Helps guests review the meal at each table.', 'PER_TABLE', 1.0, NULL, 1),
  ('meal-service', 'Dietary tent cards', 'Meal service', 'each', 'Identifies special meals for service staff.', 'FIXED', NULL, 6, 2),
  ('meal-service', 'Buffet labels', 'Meal service', 'per station', 'Labels dishes at each service station.', 'PER_STATION', 2.0, NULL, 3),
  ('general-session', 'Speaker water', 'Speaker support', 'bottle', 'Keeps presenters supplied on stage.', 'FIXED', NULL, 4, 1),
  ('general-session', 'Presentation clicker', 'Production', 'each', 'Supports presenter slide control.', 'FIXED', NULL, 1, 2),
  ('general-session', 'Notepads and pens', 'Participant materials', 'set', 'Useful for attendee note-taking.', 'PER_ATTENDEE', 1.0, NULL, 3),
  ('workshop', 'Workbooks', 'Workshop materials', 'each', 'One working copy per participant.', 'PER_ATTENDEE', 1.0, NULL, 1),
  ('workshop', 'Facilitator kits', 'Workshop materials', 'kit', 'One kit per working table.', 'PER_TABLE', 1.0, NULL, 2),
  ('workshop', 'Flip charts and markers', 'Workshop materials', 'set', 'Supports group exercises.', 'PER_TABLE', 1.0, NULL, 3),
  ('registration-arrival', 'Badge stock', 'Registration', 'each', 'One badge for each expected attendee.', 'PER_ATTENDEE', 1.0, NULL, 1),
  ('registration-arrival', 'Lanyards', 'Registration', 'each', 'One lanyard for each expected attendee.', 'PER_ATTENDEE', 1.0, NULL, 2),
  ('registration-arrival', 'VIP badge sleeves', 'Registration', 'each', 'Keeps VIP credentials easy to identify at a dedicated desk.', 'FIXED', NULL, 25, 3),
  ('registration-arrival', 'Accessibility check-in kit', 'Accessibility', 'kit', 'Supports a dedicated accessible check-in position.', 'FIXED', NULL, 1, 4),
  ('registration-arrival', 'Registration desk supplies', 'Registration', 'kit', 'One pens, tape, clips, and labels kit per check-in station.', 'PER_STATION', 1.0, NULL, 5),
  ('registration-arrival', 'Badge holders', 'Registration', 'each', 'Provides a holder for each expected attendee badge.', 'PER_ATTENDEE', 1.0, NULL, 6),
  ('registration-arrival', 'Registration desk pens', 'Registration', 'pack', 'Keeps each check-in station stocked for exceptions.', 'PER_STATION', 1.0, NULL, 7),
  ('registration-arrival', 'Welcome cards', 'Registration', 'each', 'One arrival card for each expected attendee.', 'PER_ATTENDEE', 1.0, NULL, 8),
  ('registration-arrival', 'Hand sanitizer', 'Registration', 'bottle', 'One bottle at each check-in station.', 'PER_STATION', 1.0, NULL, 9),
  ('registration-arrival', 'Backup materials', 'Registration', 'kit', 'A small backup kit for every three check-in stations.', 'PER_STATION', 0.3334, NULL, 10),
  ('sponsor-activation', 'Giveaways', 'Sponsor', 'each', 'Provides one branded item per expected visitor.', 'PER_ATTENDEE', 1.0, NULL, 1),
  ('sponsor-activation', 'Display stands', 'Sponsor', 'each', 'Supports branded activation materials.', 'FIXED', NULL, 2, 2),
  ('accessibility', 'Large-print materials', 'Accessibility', 'each', 'Provides an accessible reading option when requested.', 'MANUAL', NULL, NULL, 1),
  ('accessibility', 'Reserved-seat markers', 'Accessibility', 'each', 'Identifies accessible reserved seating.', 'MANUAL', NULL, NULL, 2)
) AS item("templateKey", "name", "category", "unit", "rationale", "rule", "factor", "fixed", "sort")
  ON item."templateKey" = template."key"
WHERE template."isSystem"
ON CONFLICT ("templateId", "name") DO UPDATE SET
  "category" = EXCLUDED."category",
  "unit" = EXCLUDED."unit",
  "rationale" = EXCLUDED."rationale",
  "quantityRule" = EXCLUDED."quantityRule",
  "quantityFactor" = EXCLUDED."quantityFactor",
  "fixedQuantity" = EXCLUDED."fixedQuantity",
  "sortOrder" = EXCLUDED."sortOrder",
  "active" = true;
