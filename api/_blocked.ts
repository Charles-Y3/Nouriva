// Same list as src/utils/contentFilter.ts and the posts_no_blocked_content
// CHECK in db/schema.sql — shared by the owner edit route and the translation
// guard so a translation can't introduce a word the baseline filter blocks.
export const BLOCKED_PATTERN =
  /fuck|shit|bitch|asshole|bastard|cunt|dick|piss|nigger|nigga|faggot|retard|whore|slut|rape|kill\s*yourself|\bkys\b|操你|傻逼|傻屄|婊子|賤人|贱人|白痴|智障|死全家|干你娘|幹你娘/i;
