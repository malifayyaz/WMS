const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/jobwork/pools',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMTAyZDk3Mzk0ZTFkNTczNDEzMzgwNiIsImlhdCI6MTc4OTA1MjQ3NH0.Slv7l0jdSxMqSvgb1ov-AXM4d59N53o2ozpDgL8GNr0'
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
        const json = JSON.parse(data);
        if (json.data) {
            json.data.forEach(p => console.log(p.customerName + ': ' + p.remainingKg + ' (' + p.customerId + ')'));
        } else {
            console.log("No data:", json);
        }
    } catch(e) {
        console.log("Error parsing:", data);
    }
  });
});

req.on('error', error => console.error(error));
req.end();
