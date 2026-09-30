// Deterministic backstop for Browse's "Inspire me": Buddhist-style
// vegetarian — no meat, no fish, and none of the five pungent vegetables
// (onion, garlic, chives, green onion/scallion, leek) or asafoetida (hing).
// Eggs and dairy are fine.
//
// The system prompt asks the model to follow this, but a model only ever
// PROPOSES — this check runs on every suggestion before it reaches the user
// and a failing one is regenerated or dropped, never shown. It's a blunt
// keyword scan (English + Chinese), tuned to over-reject rather than let a
// forbidden ingredient through; a false positive just costs one retry.

// Phrases that contain a forbidden word but are fine, removed before scanning.
const ALLOWED_EN = /(plant[- ]based|vegetarian|vegan|mock|faux|imitation)\s+(meat|chicken|fish|beef|pork|sausage|ham|bacon|duck|shrimp|prawn|crab)s?|oyster\s+mushrooms?|meat[- ]?free|meatless|egg\s*plant|coconut\s+bacon/gi;
const ALLOWED_ZH = /素肉|素雞|素鸡|素魚|素鱼|素鴨|素鸭|素火腿|素蝦|素虾|素蟹|素排|素香腸|素香肠|人造肉|植物肉|肉桂|肉豆蔻|肉豆蒄|牛奶|牛乳|牛油果|牛蒡|牛油|羊肚菌|羊栖菜|羊棲菜|雞蛋|鸡蛋|鴨蛋|鸭蛋|鵪鶉蛋|鹌鹑蛋|雞油菌|鸡油菌|魚腥草|鱼腥草/g;

const FORBIDDEN_EN = /\b(onions?|garlic|chives?|scallions?|green\s+onions?|spring\s+onions?|leeks?|shallots?|alliums?|asafoetida|asafetida|hing|chicken|beef|pork|lamb|mutton|veal|turkey|duck|goose|bacon|ham|sausages?|salami|prosciutto|pepperoni|meat|meatballs?|fish|salmon|tuna|cod|anchov(?:y|ies)|sardines?|shrimps?|prawns?|crabs?|lobsters?|squid|octopus|oysters?|clams?|mussels?|scallops?|lard|tallow|gelatine?|bone\s+broth|fish\s+sauce|oyster\s+sauce|shrimp\s+paste)\b/i;
const FORBIDDEN_ZH = /洋葱|洋蔥|大蒜|蒜|葱|蔥|韭|阿魏|薤|肉|豬|猪|牛|羊|雞|鸡|鴨|鸭|鵝|鹅|魚|鱼|蝦|虾|蟹|蠔|蚝|蛤|蚌|魷|鱿|章魚|章鱼|海鮮|海鲜|蝦米|虾米|蠔油|蚝油|魚露|鱼露|豬油|猪油|牛油/;

/** Returns the first forbidden term found in `text`, or null if it's clean. */
export function findDietViolation(text: string): string | null {
  const cleaned = text.replace(ALLOWED_EN, ' ').replace(ALLOWED_ZH, ' ');
  const en = cleaned.match(FORBIDDEN_EN);
  if (en) return en[0];
  const zh = cleaned.match(FORBIDDEN_ZH);
  if (zh) return zh[0];
  return null;
}
