const fs = require('fs');
const path = require('path');

const serverJsPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverJsPath, 'utf8');

const logsToComment = [
  /console\.log\(`\[SOCKET\] Client connected: \$\{socket\.id\}`\);/g,
  /console\.log\(`\[SOCKET\] User connected: \$\{userId\} with socket ID: \$\{socket\.id\}`\);/g,
  /console\.log\(`\[SOCKET\] Client disconnected: \$\{socket\.id\}`\);/g,
  /console\.log\('CREATE_LISTING_BODY', req\.body\);/g,
  /console\.log\('CREATE_LISTING_SAVED_DBJSON', newListing\.id\);/g,
  /console\.log\('CREATE_LISTING_SAVED_PG', JSON\.stringify\([\s\S]*?\)\);/g,
  /console\.log\("BACKEND DELETE GELDI:", req\.params\.id\);/g,
  /console\.log\("POSTS VAR MI:", typeof db\.posts !== "undefined"\);/g,
  /console\.log\("POST SAYISI BEFORE:", db\.posts\?\.length\);/g,
  /console\.log\("POST SAYISI AFTER:", db\.posts\.length\);/g,
  /console\.log\("SILINEMEDI: ID BULUNAMADI", postId\);/g,
  /console\.log\("SILINDI:", postId\);/g,
  /console\.log\(`\[API REQUEST\] \$\{req\.method\} \$\{req\.originalUrl\}`\);/g,
  /console\.log\('\[API BODY\]', req\.body\);/g,
  /console\.log\(`\[API RESPONSE\] \d+`, responseBody\);/g,
  /console\.log\(`\[PUSH\] Sending to \$\{token\} with data:`, data\);/g,
  /console\.log\(`\[LOGIN_ATTEMPT\] identifier: \$\{identifier\}, activeUserFound: \$\{!!activeUser\}, deletedDuplicateCount: \$\{deletedDuplicateCount\}`\);/g,
  /console\.log\(`\[LOGIN_RESULT\] identifier: \$\{identifier\} -> success`\);/g,
  /console\.log\(`\[POST \/api\/verification\/request\] req\.body:`, req\.body\);/g,
  /console\.log\(`\[POST \/api\/verification\/request\] req\.files keys:`, req\.files \? Object\.keys\(req\.files\) : 'null'\);/g,
  /console\.log\("CREATE_REQUEST", JSON\.stringify\([\s\S]*?\)\);/g,
  /console\.log\("ACCEPT_REQUEST_HIT", JSON\.stringify\([\s\S]*?\)\);/g,
  /console\.log\("ACCEPT_REQUEST_FOUND", JSON\.stringify\([\s\S]*?\)\);/g,
  /console\.log\("REQUEST_ACCEPTED_NOTIFICATION_CREATED", \{[\s\S]*?\}\);/g,
  /console\.log\('HOST_REQUESTS', JSON\.stringify\([\s\S]*?\)\);/g,
  /console\.log\("BREVO_SENDERS_RESPONSE_STATUS:", sendersRes\.status\);/g,
  /console\.log\("BREVO_SENDERS_RESPONSE_BODY:", JSON\.stringify\(sendersData\)\);/g,
  /console\.log\("BREVO_API_RESPONSE_STATUS:", response\.status\);/g,
  /console\.log\("BREVO_API_RESPONSE_BODY:", JSON\.stringify\(responseData\)\);/g
];

for (const pattern of logsToComment) {
  content = content.replace(pattern, (match) => `if (process.env.NODE_ENV !== 'production') { ${match.trim()} }`);
}

fs.writeFileSync(serverJsPath, content, 'utf8');
console.log('Log cleaning complete!');
