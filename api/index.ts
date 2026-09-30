import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApiApp } from './_app.js';

// Vercel serverless entry point — catches every /api/* request via the
// vercel.json rewrite and hands it to the same Express app server.ts uses
// for local/traditional hosting.
//
// The .js extension on the import above is required, not stylistic: this
// project has "type": "module" in package.json, so Vercel's Node runtime
// executes the compiled output under Node's native ESM loader, which
// (unlike CommonJS require() or bundler tooling such as tsx, used for local
// dev) does NOT infer file extensions on relative imports — omitting it
// here causes every request to fail with "Cannot find module '.../_app'"
// despite the exact same code running fine locally.
const app = createApiApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Express processes req/res asynchronously (middleware chain, route
  // handlers, some of them awaiting an AI/Supabase/Blob call) but calling
  // app(req, res) directly doesn't return a promise tied to that — it just
  // kicks the chain off and returns immediately. Without waiting for the
  // response to actually finish, Vercel's runtime can tear the function
  // down before Express ever writes a response.
  return new Promise<void>((resolve, reject) => {
    res.on('finish', resolve);
    res.on('error', reject);
    app(req as any, res as any);
  });
}
