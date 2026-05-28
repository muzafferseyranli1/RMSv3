import fs from 'fs';
import path from 'path';

const symlinkPath = path.resolve('node_modules/@');

if (!fs.existsSync(symlinkPath)) {
  console.log('Creating symlink...');
  fs.symlinkSync(path.resolve('src'), symlinkPath, 'junction');
  console.log('Symlink created!');
} else {
  console.log('Symlink already exists.');
}

// Now try importing
import { findFastSalesChannel } from '@/lib/demoSalesGenerator';
console.log('Successfully imported findFastSalesChannel:', typeof findFastSalesChannel);
