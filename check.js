const babel = require('@babel/core');
const fs = require('fs');
const code = fs.readFileSync('src/pages/Home.js', 'utf8');
try {
  babel.transform(code, { filename: 'Home.js', presets: ['react-app'] });
  console.log('PARSE OK');
} catch (e) {
  console.log('PARSE ERROR:', e.message);
}
