import http from "http";
import { orchestrate } from "../../../execution/orchestrator/orchestrator";

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/execute") {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);

        const result = await orchestrate({
          input: data,
          metadata: {
            actor: "gateway",
          },
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400);
        res.end("Invalid request");
      }
    });

    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(3000);