const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/reports?type=all',
  method: 'GET',
  headers: {
    // Assuming checkAdminAuth might let it through or fail with 401
    // If it fails with 401, we know the server is up
  }
}, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', data);
  });
});

req.on('error', e => {
  console.error('Request error:', e.message);
});

req.end();
