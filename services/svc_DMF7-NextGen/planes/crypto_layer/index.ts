// TODO(wire): base64 only — NOT production crypto, replace before wiring
export const cryptoLayerPlane = "crypto_layer";
export function encryptData(data: string): string {
    return Buffer.from(data).toString('base64');
}