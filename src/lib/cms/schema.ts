/**
 * CMS Content Schema for SolDojo
 *
 * This defines the content types for Sanity CMS.
 * Use `sanity init` to create the studio, then import these schemas.
 *
 * Content hierarchy:
 *   Track → Course → Module → Lesson (content | challenge | video)
 */

// ==========================================
// Sanity Schema Definitions
// ==========================================

export const courseSchema = {
  name: 'course',
  title: 'Course',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string', validation: (Rule: { required: () => unknown }) => Rule.required() },
    { name: 'slug', title: 'Slug', type: 'slug', options: { source: 'title' } },
    { name: 'description', title: 'Description', type: 'text', rows: 3 },
    { name: 'thumbnail', title: 'Thumbnail', type: 'image', options: { hotspot: true } },
    {
      name: 'difficulty',
      title: 'Difficulty',
      type: 'string',
      options: { list: ['beginner', 'intermediate', 'advanced'] },
    },
    { name: 'duration', title: 'Duration (minutes)', type: 'number' },
    { name: 'xpReward', title: 'XP Reward', type: 'number' },
    {
      name: 'track',
      title: 'Learning Track',
      type: 'string',
      options: {
        list: [
          'solana-fundamentals',
          'rust-anchor',
          'defi-developer',
          'security',
          'frontend-web3',
        ],
      },
    },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },
    { name: 'instructorName', title: 'Instructor Name', type: 'string' },
    { name: 'instructorImage', title: 'Instructor Image', type: 'image' },
    {
      name: 'prerequisites',
      title: 'Prerequisites',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'learningOutcomes',
      title: 'Learning Outcomes',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'modules',
      title: 'Modules',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'module' }] }],
    },
    { name: 'isPublished', title: 'Published', type: 'boolean', initialValue: false },
    { name: 'sortOrder', title: 'Sort Order', type: 'number', initialValue: 0 },
  ],
  preview: {
    select: { title: 'title', subtitle: 'difficulty', media: 'thumbnail' },
  },
};

export const moduleSchema = {
  name: 'module',
  title: 'Module',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string', validation: (Rule: { required: () => unknown }) => Rule.required() },
    { name: 'sortOrder', title: 'Sort Order', type: 'number', initialValue: 0 },
    {
      name: 'lessons',
      title: 'Lessons',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'lesson' }] }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'sortOrder' },
    prepare: ({ title, subtitle }: { title: string; subtitle: number }) => ({
      title,
      subtitle: `Order: ${subtitle}`,
    }),
  },
};

export const lessonSchema = {
  name: 'lesson',
  title: 'Lesson',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string', validation: (Rule: { required: () => unknown }) => Rule.required() },
    { name: 'slug', title: 'Slug', type: 'slug', options: { source: 'title' } },
    {
      name: 'type',
      title: 'Type',
      type: 'string',
      options: { list: ['content', 'challenge', 'video'] },
      initialValue: 'content',
    },
    {
      name: 'content',
      title: 'Content',
      type: 'array',
      of: [
        { type: 'block' },
        {
          type: 'code',
          options: {
            language: 'rust',
            languageAlternatives: [
              { title: 'Rust', value: 'rust' },
              { title: 'TypeScript', value: 'typescript' },
              { title: 'JavaScript', value: 'javascript' },
              { title: 'JSON', value: 'json' },
              { title: 'TOML', value: 'toml' },
              { title: 'Shell', value: 'bash' },
            ],
          },
        },
        { type: 'image', options: { hotspot: true } },
      ],
    },
    { name: 'xpReward', title: 'XP Reward', type: 'number', initialValue: 25 },
    { name: 'duration', title: 'Duration (minutes)', type: 'number', initialValue: 10 },
    { name: 'sortOrder', title: 'Sort Order', type: 'number', initialValue: 0 },

    // Challenge-specific fields
    {
      name: 'starterCode',
      title: 'Starter Code',
      type: 'text',
      rows: 15,
      hidden: ({ parent }: { parent: { type: string } }) => parent?.type !== 'challenge',
    },
    {
      name: 'solutionCode',
      title: 'Solution Code',
      type: 'text',
      rows: 15,
      hidden: ({ parent }: { parent: { type: string } }) => parent?.type !== 'challenge',
    },
    {
      name: 'challengeLanguage',
      title: 'Challenge Language',
      type: 'string',
      options: { list: ['rust', 'typescript', 'json'] },
      initialValue: 'rust',
      hidden: ({ parent }: { parent: { type: string } }) => parent?.type !== 'challenge',
    },
    {
      name: 'testCases',
      title: 'Test Cases',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'description', title: 'Description', type: 'string' },
            { name: 'input', title: 'Input', type: 'text' },
            { name: 'expectedOutput', title: 'Expected Output', type: 'text' },
          ],
        },
      ],
      hidden: ({ parent }: { parent: { type: string } }) => parent?.type !== 'challenge',
    },
    {
      name: 'hints',
      title: 'Hints',
      type: 'array',
      of: [{ type: 'string' }],
      hidden: ({ parent }: { parent: { type: string } }) => parent?.type !== 'challenge',
    },

    // Video-specific fields
    {
      name: 'videoUrl',
      title: 'Video URL',
      type: 'url',
      hidden: ({ parent }: { parent: { type: string } }) => parent?.type !== 'video',
    },
  ],
  preview: {
    select: { title: 'title', type: 'type' },
    prepare: ({ title, type }: { title: string; type: string }) => ({
      title,
      subtitle: type?.toUpperCase() || 'CONTENT',
    }),
  },
};

export const trackSchema = {
  name: 'track',
  title: 'Learning Track',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'slug', title: 'Slug', type: 'slug', options: { source: 'title' } },
    { name: 'description', title: 'Description', type: 'text' },
    { name: 'icon', title: 'Icon', type: 'string' },
    { name: 'color', title: 'Color', type: 'string' },
    {
      name: 'courses',
      title: 'Courses',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'course' }] }],
    },
    { name: 'sortOrder', title: 'Sort Order', type: 'number', initialValue: 0 },
  ],
};

// Export all schemas for Sanity studio
export const schemas = [trackSchema, courseSchema, moduleSchema, lessonSchema];
