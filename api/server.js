const express = require('express');
const app = express();

app.get('/ping', (req, res) => {
  res.json({ status: "ok" });
});

app.get('/', (req, res) => {
  res.send("DMF7 API LIVE");
});

app.listen(3000, () => console.log("DMF7 running on 3000"));
