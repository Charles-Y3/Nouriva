import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createApiApp } from "./api/_app";

dotenv.config();

const PORT = 3000;

// Vite Middleware for development / Static Server for production. The API
// routes themselves live in api/_app.ts, shared with the Vercel serverless
// entry point at api/index.ts — this file only adds what's specific to
// running as a traditional long-lived Node process (local dev or self-hosted).
async function startServer() {
  const app = createApiApp();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
