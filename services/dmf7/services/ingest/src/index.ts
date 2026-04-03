export const serviceName = "ingest";

export function health() {
  return { ok: true, service: serviceName };
}
