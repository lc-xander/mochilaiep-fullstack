const fs = require('node:fs/promises');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const outputDirectory = path.join(repositoryRoot, 'dist');
const staticFiles = ['index.html', 'script.js', 'admin.html', 'admin.js', 'admin.css'];

function publicConfiguration() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const publicKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!supabaseUrl || !publicKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) in the Vercel build environment.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('SUPABASE_URL must be a valid absolute URL.');
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
    throw new Error('SUPABASE_URL must use HTTPS outside local development.');
  }

  const config = JSON.stringify({ url: parsedUrl.origin, anonKey: publicKey })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.MOCHILA_SUPABASE_CONFIG = Object.freeze(${config});\n`;
}

async function build() {
  const generatedConfig = publicConfiguration();
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all(staticFiles.map((file) => fs.copyFile(
    path.join(repositoryRoot, file),
    path.join(outputDirectory, file)
  )));
  await fs.writeFile(path.join(outputDirectory, 'supabase-config.js'), generatedConfig, { flag: 'wx' });
  console.log(`Static Supabase site built in ${path.relative(repositoryRoot, outputDirectory)}.`);
}

build().catch((error) => {
  console.error(`Static site build failed: ${error.message}`);
  process.exitCode = 1;
});
