import { randomUUID } from "crypto";
import { getModule } from "./registry";

export async function orchestrate(request: any) {
  const request_id = randomUUID();
  const start = Date.now();

  try {
    const { input, metadata } = request;

    const module = getModule("default");
    const output = await module(input);

    const duration = Date.now() - start;

    return {
      output,
      status: "ok",
      metadata: {
        request_id,
        duration_ms: duration,
      },
    };
  } catch (error) {
    const duration = Date.now() - start;

    return {
      output: null,
      status: "error",
      metadata: {
        request_id,
        duration_ms: duration,
      },
    };
  }
}