export const cryptoLayerPlane = "crypto_layer";
export function encryptData(data: string): string {
    return Buffer.from(data).toString('base64');
}