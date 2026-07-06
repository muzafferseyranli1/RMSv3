import fs from 'fs';
import path from 'path';

const srcDir = path.resolve('personel-android');
const destDir = path.resolve('garson-android');

// 1. Copy project excluding build and gradle cache folders using precise segment matching
function copyProject() {
  console.log(`Copying from ${srcDir} to ${destDir}...`);
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  
  fs.cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const relative = path.relative(srcDir, src);
      if (!relative) return true; // root dir itself
      
      const segments = relative.split(path.sep);
      const isExclude = 
        segments.includes('.gradle') || 
        segments.includes('.kotlin') || 
        segments.includes('build');
      return !isExclude;
    }
  });
  console.log('Project copied successfully.');
}

// 2. Rename Java/Kotlin package directories
function renamePackages() {
  console.log('Renaming package directories...');
  const srcPkgDir = path.join(destDir, 'app/src/main/java/com/suitable/personel');
  const destPkgDir = path.join(destDir, 'app/src/main/java/com/suitable/garson');
  
  if (fs.existsSync(srcPkgDir)) {
    fs.renameSync(srcPkgDir, destPkgDir);
    console.log(`Renamed package directory to com/suitable/garson.`);
  } else {
    console.error('Source package directory not found!');
  }
}

// 3. Recursive replacement in files
function processFiles(dir) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processFiles(filePath);
    } else {
      const ext = path.extname(filePath);
      if (['.kt', '.xml', '.kts', '.properties', '.gradle', '.txt'].includes(ext)) {
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('com.suitable.personel')) {
          content = content.replaceAll('com.suitable.personel', 'com.suitable.garson');
          fs.writeFileSync(filePath, content, 'utf8');
        }
      }
    }
  }
}

// 4. Update specific properties (app_name, settings.gradle.kts)
function updateConfigs() {
  console.log('Updating configurations...');
  
  // App name in strings.xml
  const stringsPath = path.join(destDir, 'app/src/main/res/values/strings.xml');
  if (fs.existsSync(stringsPath)) {
    let content = fs.readFileSync(stringsPath, 'utf8');
    content = content.replace('Personel App', 'Garson App');
    fs.writeFileSync(stringsPath, content, 'utf8');
    console.log('Updated app_name to "Garson App" in strings.xml');
  }
  
  // rootProject.name in settings.gradle.kts
  const settingsPath = path.join(destDir, 'settings.gradle.kts');
  if (fs.existsSync(settingsPath)) {
    let content = fs.readFileSync(settingsPath, 'utf8');
    content = content.replace('rootProject.name = "Personel App"', 'rootProject.name = "Garson App"');
    fs.writeFileSync(settingsPath, content, 'utf8');
    console.log('Updated settings.gradle.kts rootProject.name');
  }
}

// 5. Delete unneeded files in the new garson-android project
function cleanUnusedFiles() {
  console.log('Cleaning unused files from garson-android...');
  const filesToDelete = [
    'app/src/main/java/com/suitable/garson/ui/main/HomeScreen.kt',
    'app/src/main/java/com/suitable/garson/ui/main/TasksScreen.kt',
    'app/src/main/java/com/suitable/garson/ui/main/ShiftPlanScreen.kt',
    'app/src/main/java/com/suitable/garson/ui/main/FeedbackScreen.kt',
    'app/src/main/java/com/suitable/garson/ui/main/CampaignsScreen.kt',
    'app/src/main/java/com/suitable/garson/ui/main/CouponsScreen.kt',
    'app/src/main/java/com/suitable/garson/data/TaskRepository.kt',
    'app/src/main/java/com/suitable/garson/data/CustomerRepository.kt'
  ];
  
  for (const relPath of filesToDelete) {
    const fullPath = path.join(destDir, relPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted: ${relPath}`);
    }
  }
}

// Run the steps
copyProject();
renamePackages();
console.log('Processing files for package rename...');
processFiles(destDir);
updateConfigs();
cleanUnusedFiles();
console.log('Split completed successfully!');
