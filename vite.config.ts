import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

// One id per build, baked into the client bundle as __APP_BUILD_ID__ (via
// `define` below) and also written out as a small static version.json in
// the same build. A tab can poll version.json and compare it against the id
// baked into its own already-loaded JS to detect a newer deploy and prompt
// a refresh, without depending on a service worker.
function versionFilePlugin(buildId: string): Plugin {
  return {
    name: 'write-version-file',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir || 'dist';
      fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ buildId }));
    },
  };
}

const BUILD_ID = String(Date.now());

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), versionFilePlugin(BUILD_ID)],
    define: {
      __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
