-- Safe idempotent User table creation for production
-- This migration ONLY creates the User table and related objects
-- All statements are guarded to prevent failures if objects already exist

-- Create UserRole enum (skip if exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER');
  END IF;
END $$;

-- Create User table (skip if exists)
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "accountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Create unique index on email (skip if exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'User_email_key' 
    AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
  END IF;
END $$;

-- Create index on email (skip if exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'User_email_idx' 
    AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "User_email_idx" ON "User"("email");
  END IF;
END $$;

-- Create index on accountId (skip if exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'User_accountId_idx' 
    AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "User_accountId_idx" ON "User"("accountId");
  END IF;
END $$;

-- Create index on role (skip if exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'User_role_idx' 
    AND n.nspname = 'public'
  ) THEN
    CREATE INDEX "User_role_idx" ON "User"("role");
  END IF;
END $$;

-- Add foreign key to Account (skip if exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'User_accountId_fkey'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" 
      FOREIGN KEY ("accountId") REFERENCES "Account"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
