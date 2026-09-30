// Blunt, always-on baseline moderation — no AI key required, so it works
// even for visitors who haven't configured an AI provider. Blocks the most
// unambiguous cases (slurs, explicit profanity) before a post ever reaches
// the network; the same list also backs a Postgres CHECK constraint (see
// db/schema.sql) as defense-in-depth against a request that bypasses the
// UI entirely. Same approach as small-steps-to-great-harmony's
// src/utils/profanity.ts.
//
// What this deliberately does NOT catch: anything requiring judgment —
// illegal activity described in clean language, harassment that isn't
// slur-based, misinformation, spam. A keyword list can't do that; report +
// admin review (see README's Moderation section) is the real backstop for
// everything this list misses. Nouriva has no accounts, so there's also no
// way to escalate consequences beyond removing the one post.
const BLOCKED_PATTERN =
  /fuck|shit|bitch|asshole|bastard|cunt|dick|piss|nigger|nigga|faggot|retard|whore|slut|rape|kill\s*yourself|\bkys\b|操你|傻逼|傻屄|婊子|賤人|贱人|白痴|智障|死全家|干你娘|幹你娘/i;

export function containsBlockedContent(...fields: (string | undefined | null)[]): boolean {
  const combined = fields.filter(Boolean).join(' ');
  return BLOCKED_PATTERN.test(combined);
}
