import type { Language, SpiritTag } from '../types';
import storiesData from './stories.json';

// 52 fixed stories, one per week of the year (the source texts live in
// src/data/stories-src/ — run `npm run build:stories` after editing them).
// Nothing here is AI-generated: each is either a traditional tale retold in
// our own words or a short original written for Nouriva.

export interface StoryText {
  title: string;
  body: string;
  questions: string[];
}

export interface Story {
  week: number;
  tag: SpiritTag;
  source: 'traditional' | 'original';
  en: StoryText;
  'zh-Hant': StoryText;
  'zh-Hans': StoryText;
}

export const STORIES = storiesData as Story[];

/** ISO week number of `date` (weeks start on Monday), clamped to 1–52 so a
 * 53rd week simply repeats the last story. */
export function currentStoryWeek(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return Math.min(Math.max(week, 1), 52);
}

export function storyText(story: Story, language: Language): StoryText {
  return story[language] || story.en;
}
