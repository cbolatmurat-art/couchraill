import os
import re

with open('backend/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(r"res\.status\(500\)\.json\(\{\s*success:\s*false,\s*error:\s*'Sunucu hatas[^\']*'\s*\}\);", 
           "res.status(500).json({ success: false, error: 'Sunucu hatası: ' + (error.message || error.toString()) });", 
           c)

with open('backend/server.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Replaced errors in server.js")
