import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { polishApiPlugin } from './server/vite-plugin-polish'

// GitHub Project Page: https://<user>.github.io/<repo>/
// Put VITE_BASE_PATH=/repo-name/ in .env.production (leading and trailing slash)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = (env.VITE_BASE_PATH || '/').trim() || '/'

  return {
    base,
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
      // Dev-only /api/polish endpoint; the key never reaches the client bundle
      polishApiPlugin({ apiKey: env.ANTHROPIC_API_KEY, model: env.POLISH_MODEL }),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
