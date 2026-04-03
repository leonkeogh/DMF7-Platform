export const serviceName = "retrieval";

export function health() {
  return { ok: true, service: serviceName };
}
