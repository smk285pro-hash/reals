const http = require('http');

http.get('http://localhost:3000/en', (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', res.headers);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('BODY:', body.slice(0, 1000)));
}).on('error', (e) => {
  console.error('ERROR:', e);
});
