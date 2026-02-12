/**
 * Sanity CMS Client for SolDojo
 *
 * Provides typed queries for fetching course content.
 * Replace NEXT_PUBLIC_SANITY_PROJECT_ID and NEXT_PUBLIC_SANITY_DATASET
 * in .env to connect to your Sanity project.
 */

const SANITY_PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';
const SANITY_DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const SANITY_API_VERSION = '2024-01-01';

function sanityUrl(query: string, params?: Record<string, string>): string {
  const encodedQuery = encodeURIComponent(query);
  let url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encodedQuery}`;

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url += `&$${key}="${encodeURIComponent(value)}"`;
    });
  }

  return url;
}

async function sanityFetch<T>(query: string, params?: Record<string, string>): Promise<T> {
  if (!SANITY_PROJECT_ID) {
    console.warn('[CMS] No Sanity project ID configured. Using mock data.');
    return [] as unknown as T;
  }

  const res = await fetch(sanityUrl(query, params), {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Sanity fetch failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.result as T;
}

// ==========================================
// GROQ Queries
// ==========================================

const COURSE_LIST_QUERY = `
  *[_type == "course" && isPublished == true] | order(sortOrder asc) {
    _id,
    title,
    "slug": slug.current,
    description,
    "thumbnail": thumbnail.asset->url,
    difficulty,
    duration,
    xpReward,
    track,
    tags,
    instructorName,
    "instructorImage": instructorImage.asset->url,
    "totalLessons": count(modules[]->lessons[]),
    sortOrder
  }
`;

const COURSE_DETAIL_QUERY = `
  *[_type == "course" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    description,
    "thumbnail": thumbnail.asset->url,
    difficulty,
    duration,
    xpReward,
    track,
    tags,
    instructorName,
    "instructorImage": instructorImage.asset->url,
    prerequisites,
    learningOutcomes,
    modules[]-> {
      _id,
      title,
      sortOrder,
      lessons[]-> {
        _id,
        title,
        "slug": slug.current,
        type,
        xpReward,
        duration,
        sortOrder
      } | order(sortOrder asc)
    } | order(sortOrder asc)
  }
`;

const LESSON_QUERY = `
  *[_type == "lesson" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    type,
    content,
    xpReward,
    duration,
    starterCode,
    solutionCode,
    challengeLanguage,
    testCases,
    hints,
    videoUrl
  }
`;

// ==========================================
// Typed Fetch Functions
// ==========================================

export interface CMSCourse {
  _id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: number;
  xpReward: number;
  track: string;
  tags: string[];
  instructorName: string | null;
  instructorImage: string | null;
  totalLessons: number;
  sortOrder: number;
}

export interface CMSCourseDetail extends CMSCourse {
  prerequisites: string[];
  learningOutcomes: string[];
  modules: {
    _id: string;
    title: string;
    sortOrder: number;
    lessons: {
      _id: string;
      title: string;
      slug: string;
      type: 'content' | 'challenge' | 'video';
      xpReward: number;
      duration: number;
      sortOrder: number;
    }[];
  }[];
}

export interface CMSLesson {
  _id: string;
  title: string;
  slug: string;
  type: 'content' | 'challenge' | 'video';
  content: unknown[]; // Sanity Portable Text
  xpReward: number;
  duration: number;
  starterCode?: string;
  solutionCode?: string;
  challengeLanguage?: string;
  testCases?: { description: string; input: string; expectedOutput: string }[];
  hints?: string[];
  videoUrl?: string;
}

export async function getCourses(): Promise<CMSCourse[]> {
  return sanityFetch<CMSCourse[]>(COURSE_LIST_QUERY);
}

export async function getCourseBySlug(slug: string): Promise<CMSCourseDetail | null> {
  return sanityFetch<CMSCourseDetail | null>(COURSE_DETAIL_QUERY, { slug });
}

export async function getLessonBySlug(slug: string): Promise<CMSLesson | null> {
  return sanityFetch<CMSLesson | null>(LESSON_QUERY, { slug });
}
