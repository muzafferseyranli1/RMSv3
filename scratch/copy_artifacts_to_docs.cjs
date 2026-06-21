const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\muzaf\\.gemini\\antigravity\\brain\\5329b333-00a9-43ae-a9bc-bf23d287dda3';
const destDir = 'X:\\RMSv3\\docs';

const files = ['implementation_plan.md', 'task.md', 'walkthrough.md'];

files.forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file} successfully.`);
    } else {
        console.warn(`Source file not found: ${srcPath}`);
    }
});
