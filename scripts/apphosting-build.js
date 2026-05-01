const fs = require('fs');
const { spawnSync } = require('child_process');

const configPath = 'next.config.ts';
const original = fs.readFileSync(configPath, 'utf8');
const patched = original.replace(/^\s*output:\s*['"]export['"],?\s*\r?\n/m, '');
const isAppHostingBuild = Boolean(process.env.FIREBASE_CONFIG || process.env.FIREBASE_WEBAPP_CONFIG);

if (patched !== original) {
  fs.writeFileSync(configPath, patched);
}

try {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', 'build'], { stdio: 'inherit' });

  process.exitCode = result.status ?? 1;
} finally {
  if (patched !== original && !isAppHostingBuild) {
    fs.writeFileSync(configPath, original);
  }
}
