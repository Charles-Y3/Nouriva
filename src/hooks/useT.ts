import { useApp } from '../context/AppContext';
import { getTranslation } from '../i18n/translations';

/** Returns the active-language translation object — components index it
 * directly, e.g. `t.settings.heading` (see i18n/translations.ts). */
export function useT() {
  const { preferences } = useApp();
  return getTranslation(preferences.language);
}
