#!/bin/bash

cd /root/DMF7-NextGen

git pull

pkill -f siteGenerator.js
node services/workers/siteGenerator.js > generator.log 2>&1 &
systemctl restart nginx

echo "DEPLOYED"
