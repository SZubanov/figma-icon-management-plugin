const esbuild = require('esbuild');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

fs.mkdirSync('dist', { recursive: true });

async function buildUI() {
  const result = await esbuild.build({
    entryPoints: ['src/ui/ui.tsx'],
    bundle: true,
    write: false,
    platform: 'browser',
    target: 'es6',
  });
  const js = result.outputFiles[0].text;
  const html = fs.readFileSync('src/ui/ui.html', 'utf8');
  fs.writeFileSync('dist/ui.html', html.replace('</body>', `<script>${js}</script></body>`));
}

async function main() {
  if (isWatch) {
    const codeCtx = await esbuild.context({
      entryPoints: ['src/code.ts'],
      bundle: true,
      outfile: 'dist/code.js',
      platform: 'browser',
      target: 'es6',
    });

    const uiCtx = await esbuild.context({
      entryPoints: ['src/ui/ui.tsx'],
      bundle: true,
      write: false,
      platform: 'browser',
      target: 'es6',
      plugins: [{
        name: 'ui-inject',
        setup(build) {
          build.onEnd(result => {
            if (result.errors.length === 0) {
              const js = result.outputFiles[0].text;
              const html = fs.readFileSync('src/ui/ui.html', 'utf8');
              fs.writeFileSync('dist/ui.html', html.replace('</body>', `<script>${js}</script></body>`));
              console.log('ui.html rebuilt');
            }
          });
        },
      }],
    });

    await codeCtx.watch();
    await uiCtx.watch();
    console.log('Watching...');
  } else {
    await esbuild.build({
      entryPoints: ['src/code.ts'],
      bundle: true,
      outfile: 'dist/code.js',
      platform: 'browser',
      target: 'es6',
    });
    await buildUI();
    console.log('Build complete');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
