ALTER TABLE "EventAttendee"
ADD COLUMN IF NOT EXISTS "housingHotelName" TEXT,
ADD COLUMN IF NOT EXISTS "housingRoomNumber" TEXT;
