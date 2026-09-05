/**
 * Seed script for multi-tenant data model
 * 
 * Creates sample Accounts, Locations, Events with retail-focused data
 * 
 * Usage:
 *   npx ts-node prisma/seed-multi-tenant.ts
 */

import { PrismaClient, AccountType, EventType, EventStatus } from '@prisma/client';
import { syncEventQuestions } from '../lib/questions';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding multi-tenant data...\n');

  // ============================================================
  // 1. Create Accounts
  // ============================================================
  console.log('📦 Creating Accounts...');

  const retailAccount = await prisma.account.upsert({
    where: { slug: 'acme-coffee' },
    update: {},
    create: {
      slug: 'acme-coffee',
      name: 'Acme Coffee Company',
      accountType: AccountType.RETAIL,
      tier: 'growth',
      isActive: true,
      email: 'support@acmecoffee.com',
      phone: '+1-555-0100',
      settingsJson: {
        branding: {
          primaryColor: '#6B4226',
          logoUrl: null
        },
        features: {
          textToSpeech: true,
          multiLanguage: false
        }
      }
    }
  });
  console.log(`  ✅ Created/Updated Account: ${retailAccount.name} (${retailAccount.slug})`);

  const eventsAccount = await prisma.account.upsert({
    where: { slug: 'techconf-events' },
    update: {},
    create: {
      slug: 'techconf-events',
      name: 'TechConf Events',
      accountType: AccountType.EVENTS,
      tier: 'enterprise',
      isActive: true,
      email: 'info@techconf.io',
      phone: '+1-555-0200',
      settingsJson: {
        branding: {
          primaryColor: '#0066CC',
          logoUrl: null
        },
        features: {
          textToSpeech: true,
          multiLanguage: true,
          advancedAnalytics: true
        }
      }
    }
  });
  console.log(`  ✅ Created/Updated Account: ${eventsAccount.name} (${eventsAccount.slug})`);

  const demoVideoAccount = await prisma.account.upsert({
    where: { slug: 'demo-video' },
    update: {},
    create: {
      slug: 'demo-video',
      name: 'Demo Video',
      accountType: AccountType.RETAIL,
      tier: 'starter',
      isActive: true,
      email: 'demo@example.com',
      settingsJson: {
        branding: { primaryColor: '#6B4226', logoUrl: null },
        features: { textToSpeech: true, multiLanguage: false },
      },
    },
  });
  console.log(`  ✅ Created/Updated Account: ${demoVideoAccount.name} (${demoVideoAccount.slug})\n`);

  // ============================================================
  // 2. Create Locations
  // ============================================================
  console.log('📍 Creating Locations...');

  const sfLocation = await prisma.location.upsert({
    where: { 
      accountId_slug: {
        accountId: retailAccount.id,
        slug: 'downtown-sf'
      }
    },
    update: {},
    create: {
      accountId: retailAccount.id,
      slug: 'downtown-sf',
      name: 'Downtown San Francisco',
      address: '123 Market Street',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94102',
      country: 'US',
      timezone: 'America/Los_Angeles',
      isActive: true,
      settingsJson: {
        operatingHours: {
          monday: '6:00 AM - 8:00 PM',
          tuesday: '6:00 AM - 8:00 PM',
          wednesday: '6:00 AM - 8:00 PM',
          thursday: '6:00 AM - 8:00 PM',
          friday: '6:00 AM - 9:00 PM',
          saturday: '7:00 AM - 9:00 PM',
          sunday: '7:00 AM - 7:00 PM'
        },
        manager: 'Sarah Chen',
        phone: '+1-415-555-0101'
      }
    }
  });
  console.log(`  ✅ Created/Updated Location: ${sfLocation.name}`);

  const nyLocation = await prisma.location.upsert({
    where: { 
      accountId_slug: {
        accountId: retailAccount.id,
        slug: 'midtown-nyc'
      }
    },
    update: {},
    create: {
      accountId: retailAccount.id,
      slug: 'midtown-nyc',
      name: 'Midtown Manhattan',
      address: '456 5th Avenue',
      city: 'New York',
      state: 'NY',
      postalCode: '10018',
      country: 'US',
      timezone: 'America/New_York',
      isActive: true,
      settingsJson: {
        operatingHours: {
          monday: '6:00 AM - 9:00 PM',
          tuesday: '6:00 AM - 9:00 PM',
          wednesday: '6:00 AM - 9:00 PM',
          thursday: '6:00 AM - 9:00 PM',
          friday: '6:00 AM - 10:00 PM',
          saturday: '7:00 AM - 10:00 PM',
          sunday: '7:00 AM - 8:00 PM'
        },
        manager: 'David Rodriguez',
        phone: '+1-212-555-0102'
      }
    }
  });
  console.log(`  ✅ Created/Updated Location: ${nyLocation.name}`);

  const conferenceLocation = await prisma.location.upsert({
    where: { 
      accountId_slug: {
        accountId: eventsAccount.id,
        slug: 'moscone-center'
      }
    },
    update: {},
    create: {
      accountId: eventsAccount.id,
      slug: 'moscone-center',
      name: 'Moscone Convention Center',
      address: '747 Howard St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94103',
      country: 'US',
      timezone: 'America/Los_Angeles',
      isActive: true,
      settingsJson: {
        capacity: 2000,
        rooms: ['North Hall', 'South Hall', 'West Hall'],
        eventCoordinator: 'Emily Johnson',
        phone: '+1-415-555-0300'
      }
    }
  });
  console.log(`  ✅ Created/Updated Location: ${conferenceLocation.name}`);

  const demoVideoLocation = await prisma.location.upsert({
    where: {
      accountId_slug: {
        accountId: demoVideoAccount.id,
        slug: 'buffalo-ny',
      },
    },
    update: {},
    create: {
      accountId: demoVideoAccount.id,
      slug: 'buffalo-ny',
      name: 'Buffalo, NY',
      city: 'Buffalo',
      state: 'NY',
      country: 'US',
      timezone: 'America/New_York',
      isActive: true,
    },
  });
  console.log(`  ✅ Created/Updated Location: ${demoVideoLocation.name}\n`);

  // ============================================================
  // 3. Create Events
  // ============================================================
  console.log('🎯 Creating Events...');

  const retailFeedbackQuestions = [
    {
      key: 'q1_overall_rating',
      label: 'On a scale of 1 to 5, how would you rate your visit today?',
      order: 1,
      required: true,
    },
    {
      key: 'q2_recommend',
      label: 'Would you recommend us to a friend or colleague?',
      order: 2,
      required: true,
    },
    {
      key: 'q3_feedback',
      label: 'What did you think of your experience? Please share any feedback.',
      order: 3,
      required: true,
    },
  ];

  const conferenceFeedbackQuestions = [
    {
      key: 'q1_overall_rating',
      label: 'How would you rate your overall conference experience?',
      order: 1,
      required: true,
    },
    {
      key: 'q2_best_session',
      label: 'What was your favorite session or speaker?',
      order: 2,
      required: false,
    },
    {
      key: 'q3_improvements',
      label: 'What could we improve for next year?',
      order: 3,
      required: false,
    },
  ];

  const demoVideoQuestions = [
    {
      key: 'q1_overall_rating',
      label: 'On a scale of 1 to 5, how would you rate your experience?',
      order: 1,
      required: true,
    },
    {
      key: 'q2_well',
      label: 'What did we do well?',
      order: 2,
      required: true,
    },
    {
      key: 'q3_improve',
      label: 'What could we improve?',
      order: 3,
      required: true,
    },
  ];

  const sfEvent = await prisma.$transaction(async (tx) => {
    const event = await tx.event.upsert({
      where: { id: 'retail-sf-jan-2026' },
      update: {
        questionsJson: retailFeedbackQuestions,
      },
      create: {
        id: 'retail-sf-jan-2026',
        locationId: sfLocation.id,
        name: 'January Customer Feedback',
        description: 'Monthly customer satisfaction survey for Downtown SF location',
        eventType: EventType.KIOSK,
        status: EventStatus.ACTIVE,
        isActive: true,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
        questionsJson: retailFeedbackQuestions,
      },
    });

    await syncEventQuestions(tx, event.id, retailFeedbackQuestions);
    return event;
  });
  console.log(`  ✅ Created/Updated Event: ${sfEvent.name} (${sfEvent.id})`);

  const nyEvent = await prisma.$transaction(async (tx) => {
    const event = await tx.event.upsert({
      where: { id: 'retail-nyc-jan-2026' },
      update: {
        questionsJson: retailFeedbackQuestions,
      },
      create: {
        id: 'retail-nyc-jan-2026',
        locationId: nyLocation.id,
        name: 'January Customer Feedback',
        description: 'Monthly customer satisfaction survey for Midtown NYC location',
        eventType: EventType.KIOSK,
        status: EventStatus.ACTIVE,
        isActive: true,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
        questionsJson: retailFeedbackQuestions,
      },
    });

    await syncEventQuestions(tx, event.id, retailFeedbackQuestions);
    return event;
  });
  console.log(`  ✅ Created/Updated Event: ${nyEvent.name} (${nyEvent.id})`);

  const conferenceEvent = await prisma.$transaction(async (tx) => {
    const event = await tx.event.upsert({
      where: { id: 'techconf-2026' },
      update: {
        questionsJson: conferenceFeedbackQuestions,
        eventType: EventType.ADVANCED,
      },
      create: {
        id: 'techconf-2026',
        locationId: conferenceLocation.id,
        name: 'TechConf 2026 - Attendee Feedback',
        description: 'Post-conference feedback collection',
        eventType: EventType.ADVANCED,
        status: EventStatus.ACTIVE,
        isActive: true,
        startDate: new Date('2026-03-15'),
        endDate: new Date('2026-03-17'),
        questionsJson: conferenceFeedbackQuestions,
      },
    });

    await syncEventQuestions(tx, event.id, conferenceFeedbackQuestions);
    return event;
  });
  console.log(`  ✅ Created/Updated Event: ${conferenceEvent.name} (${conferenceEvent.id})`);

  const demoVideoEvent = await prisma.$transaction(async (tx) => {
    const event = await tx.event.upsert({
      where: { id: 'demo-video-kiosk' },
      update: {
        questionsJson: demoVideoQuestions,
      },
      create: {
        id: 'demo-video-kiosk',
        locationId: demoVideoLocation.id,
        name: 'Customer Feedback Kiosk',
        description: 'Demo kiosk for voice feedback collection',
        eventType: EventType.KIOSK,
        status: EventStatus.ACTIVE,
        isActive: true,
        questionsJson: demoVideoQuestions,
      },
    });

    await syncEventQuestions(tx, event.id, demoVideoQuestions);
    return event;
  });
  console.log(`  ✅ Created/Updated Event: ${demoVideoEvent.name} (${demoVideoEvent.id})\n`);

  // ============================================================
  // Summary
  // ============================================================
  console.log('✨ Seed complete!\n');
  console.log('Summary:');
  console.log(`  • 3 Accounts created`);
  console.log(`  • 4 Locations created`);
  console.log(`  • 4 Events created\n`);

  console.log('Test URLs (once frontend is built):');
  console.log(`  • Demo Video: /app?account=demo-video`);
  console.log(`  • Retail SF: /kiosk?eventId=retail-sf-jan-2026`);
  console.log(`  • Retail NYC: /kiosk?eventId=retail-nyc-jan-2026`);
  console.log(`  • Conference: /kiosk?eventId=techconf-2026\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
