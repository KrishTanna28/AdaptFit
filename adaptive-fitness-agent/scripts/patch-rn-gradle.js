const fs = require('fs');
const path = require('path');

const filePath = path.resolve(
  'node_modules/@react-native/gradle-plugin/gradle/libs.versions.toml'
);

if (fs.existsSync(filePath)) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('agp = "8.11.0"')) {
    content = content.replace('agp = "8.11.0"', 'agp = "8.7.3"');
    fs.writeFileSync(filePath, content);
    console.log('✅ Patched AGP version: 8.11.0 → 8.7.3');
  } else {
    console.log('ℹ️ AGP version already patched or not found');
  }
} else {
  console.log('❌ File not found:', filePath);
}