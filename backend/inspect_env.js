const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

console.log('--- Raw .env Character Codes ---');
for (let i = 0; i < envContent.length; i++) {
    const code = envContent.charCodeAt(i);
    const char = envContent[i];
    if (code === 10) console.log('[LF]');
    else if (code === 13) console.log('[CR]');
    else console.log(`'${char}' (${code})`);
}

const config = dotenv.parse(envContent);
console.log('\n--- Parsed Values ---');
for (const key in config) {
    const val = config[key];
    console.log(`${key}: "${val}" (Length: ${val.length})`);
    if (val.includes('\r')) console.log(`  !! Contains CR at index ${val.indexOf('\r')}`);
}
