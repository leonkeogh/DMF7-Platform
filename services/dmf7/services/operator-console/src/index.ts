export const serviceName = "operator-console";

export function health() {
  return { ok: true, service: serviceName };
}
