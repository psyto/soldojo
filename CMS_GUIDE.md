# CMS Guide

## Overview

SolDojo uses [Sanity](https://www.sanity.io/) as its headless CMS. Course content is managed through Sanity Studio and fetched via GROQ queries.

## Setup

### 1. Create Sanity Project

```bash
npm create sanity@latest -- --project-id <your-id> --dataset production --template clean
```

### 2. Configure Environment

Add to `.env`:

```
NEXT_PUBLIC_SANITY_PROJECT_ID=your-project-id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=your-token  # For write operations
```

### 3. Import Schemas

The schema definitions are in `src/lib/cms/schema.ts`. Import them into your Sanity Studio's `schemaTypes/index.ts`.

## Content Types

### Track (Learning Path)

A track groups related courses into a progression path.

| Field | Type | Description |
|-------|------|-------------|
| title | string | Track name (e.g., "Solana Fundamentals") |
| slug | slug | URL-friendly identifier |
| description | text | Brief description |
| icon | string | Icon identifier |
| color | string | Theme color class |
| courses | reference[] | Ordered list of courses |

### Course

A course is the main learning unit.

| Field | Type | Description |
|-------|------|-------------|
| title | string | Course title |
| slug | slug | URL slug |
| description | text | Course description |
| thumbnail | image | Cover image |
| difficulty | string | beginner / intermediate / advanced |
| duration | number | Total minutes |
| xpReward | number | XP awarded on completion |
| track | string | Associated learning track |
| tags | string[] | Search/filter tags |
| modules | reference[] | Ordered list of modules |
| isPublished | boolean | Draft/published toggle |

### Module

A module groups lessons within a course.

| Field | Type | Description |
|-------|------|-------------|
| title | string | Module title |
| sortOrder | number | Display order |
| lessons | reference[] | Ordered list of lessons |

### Lesson

A lesson is the atomic learning unit. Three types:

#### Content Lesson
Standard reading material with markdown and code blocks.

| Field | Type | Description |
|-------|------|-------------|
| title | string | Lesson title |
| slug | slug | URL slug |
| type | string | "content" |
| content | portable text | Rich content with code blocks |
| xpReward | number | XP for completion |
| duration | number | Estimated minutes |

#### Challenge Lesson
Interactive coding challenge with test cases.

| Field | Type | Description |
|-------|------|-------------|
| type | string | "challenge" |
| starterCode | text | Pre-populated code |
| solutionCode | text | Reference solution |
| challengeLanguage | string | rust / typescript / json |
| testCases | object[] | Array of { description, input, expectedOutput } |
| hints | string[] | Progressive hints |

#### Video Lesson

| Field | Type | Description |
|-------|------|-------------|
| type | string | "video" |
| videoUrl | url | Video embed URL |

## Creating a Course

1. **Create Lessons** — Start with individual lessons. Set type, content, XP rewards.
2. **Create Modules** — Group lessons into logical modules. Set sort order.
3. **Create Course** — Add metadata, link modules, set difficulty and track.
4. **Publish** — Toggle `isPublished` to true when ready.

## Content Guidelines

### Code Blocks
Use Sanity's code block with language selection. Supported:
- Rust, TypeScript, JavaScript, JSON, TOML, Shell

### Challenge Design
- **Starter code** should compile but be incomplete
- **Test cases** should test one concept each
- **Hints** should progress from vague to specific
- **Solution** should follow best practices

### XP Rewards (Recommended)

| Action | XP Range |
|--------|----------|
| Content lesson | 10–25 |
| Easy challenge | 25–50 |
| Medium challenge | 50–75 |
| Hard challenge | 75–100 |
| Course completion bonus | 500–2,000 |

## Querying Content

Content is fetched via the client at `src/lib/cms/client.ts`:

```typescript
import { getCourses, getCourseBySlug, getLessonBySlug } from '@/lib/cms/client';

// List all published courses
const courses = await getCourses();

// Get course with modules and lessons
const course = await getCourseBySlug('anchor-framework');

// Get lesson content
const lesson = await getLessonBySlug('what-is-anchor');
```

## Fallback to Mock Data

When `NEXT_PUBLIC_SANITY_PROJECT_ID` is not set, the app falls back to mock data defined in the page components. This enables development without a CMS instance.
