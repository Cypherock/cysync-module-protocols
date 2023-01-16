export * from './sleep';
export { default as logger, logLevel } from './logger';

export function stringToUTF8Bytes(str: any) {
    return new TextEncoder().encode(str);
}

export function bytesToHex(bytes: Uint8Array) {
    return Array.from(
      bytes,
      byte => byte.toString(16).padStart(2, "0")
    ).join("");
}