const esbuild = require('esbuild');
const watch = process.argv.includes('--watch');

esbuild.context({
  entryPoints: ['app.jsx'],
  bundle: true,
  outfile: 'dist/bundle.js',
  loader: { '.jsx': 'jsx' },
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  sourcemap: true,
  target: ['chrome120', 'safari17'],
}).then(ctx => watch ? ctx.watch() : ctx.rebuild().then(() => ctx.dispose()));
