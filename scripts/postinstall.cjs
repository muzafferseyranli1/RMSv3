const { execSync } = require('child_process');

// Railway veya Nixpacks ortamında, ya da SKIP_ELECTRON_POSTINSTALL=true ise adımı atla.
const isCloud = !!process.env.RAILWAY_STATIC_URL || !!process.env.NIXPACKS;
const isProd = process.env.NODE_ENV === 'production';

if (isCloud || isProd || process.env.SKIP_ELECTRON_POSTINSTALL === 'true') {
  console.log('Skipping electron-builder install-app-deps in cloud/production environment.');
  process.exit(0);
}

try {
  console.log('Running electron-builder install-app-deps...');
  execSync('npx electron-builder install-app-deps', { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to run electron-builder install-app-deps:', error.message);
  process.exit(1);
}
