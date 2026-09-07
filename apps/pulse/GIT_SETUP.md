# Git Repository Setup

## Initialize Repository

Run these commands to initialize Git and make your first commit:

```bash
cd "/Users/ali/Documents/Booth Audio"

# Initialize Git repository
git init

# Add all files
git add .

# Create initial commit for Phase 1
git commit -m "feat: Phase 1 - Core infrastructure and presigned upload API

- Initialize Next.js 14 with TypeScript and App Router
- Configure Prisma with comprehensive database schema
- Implement Session model with granular status pipeline
- Add Transcript, Analysis, and ProcessingLog models
- Create presigned upload API endpoint with security validation
- Implement session confirmation endpoint (idempotent)
- Add session status query endpoint
- Set up S3 utilities with presigned URL generation
- Configure request validation with Zod
- Add TypeScript types and API response interfaces
- Include comprehensive README with setup instructions
- Configure environment variables template

Security features:
- File size and MIME type validation
- Short-lived presigned URLs (5 min expiry)
- Idempotent operations
- Provider-agnostic AI service design"

# Create main branch
git branch -M main

# (Optional) Add remote and push
# git remote add origin https://github.com/yourusername/booth-audio.git
# git push -u origin main
```

## Recommended Commit Strategy for Future Phases

### Phase 2 commits:
```bash
git add app/kiosk
git commit -m "feat: Add kiosk recording UI with MediaRecorder"

git add lib/processing.ts lib/ai
git commit -m "feat: Implement background processing and AI integrations"
```

### Phase 3 commits:
```bash
git add app/api/auth app/admin
git commit -m "feat: Add NextAuth and admin dashboard"
```

## Branch Strategy

For feature development:
```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "feat: description of changes"

# Push and create PR
git push origin feature/your-feature
```

## Conventional Commits

Use these prefixes:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation only
- `style:` - Code style/formatting
- `refactor:` - Code restructuring
- `test:` - Adding tests
- `chore:` - Maintenance tasks
