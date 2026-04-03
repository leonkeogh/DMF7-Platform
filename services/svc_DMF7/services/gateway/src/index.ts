export const serviceName = "gateway";

export function health() {
  return { ok: true, service: serviceName };
}
