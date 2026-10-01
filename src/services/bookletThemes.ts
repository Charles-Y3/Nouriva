// Kept apart from recipeBooklet.tsx so the booklet dialog can show the theme
// swatches without pulling @react-pdf/renderer into the main bundle.

export type BookletThemeId = 'forest' | 'terracotta' | 'indigo' | 'plum' | 'saffron' | 'ocean';

export interface BookletTheme {
  deep: string;    // cover / back cover / accents panels
  accent: string;  // gold-ish highlight on deep backgrounds
  strong: string;  // accent colour on paper (rules, labels)
  tint: string;    // soft panel on paper
  paper: string;
  ink: string;
  muted: string;
}

export const BOOKLET_THEMES: Record<BookletThemeId, BookletTheme> = {
  forest:     { deep: '#2F3A2A', accent: '#D9C08A', strong: '#8A6D3B', tint: '#F1E8D2', paper: '#FBF7EE', ink: '#2B2B26', muted: '#6F675A' },
  terracotta: { deep: '#7A3B24', accent: '#EBC9A4', strong: '#A2532F', tint: '#F6E6D8', paper: '#FCF7F1', ink: '#2E2420', muted: '#7A6558' },
  indigo:     { deep: '#232B4A', accent: '#E0BE7C', strong: '#3F4C86', tint: '#E8EAF3', paper: '#FAFAF7', ink: '#22253A', muted: '#62667D' },
  saffron:    { deep: '#8A5A12', accent: '#F3D9A0', strong: '#B07A1E', tint: '#F8EBCF', paper: '#FFFAEF', ink: '#33261A', muted: '#80694B' },
  ocean:      { deep: '#1F4A52', accent: '#E8D5B0', strong: '#2F7480', tint: '#E2EEF0', paper: '#F8FAF9', ink: '#1F2D30', muted: '#5C7378' },
  plum:       { deep: '#4A2740', accent: '#EBC4AE', strong: '#8A3F6E', tint: '#F3E6EE', paper: '#FCF8FA', ink: '#2D2029', muted: '#725F6B' },
};
