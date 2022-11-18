import type { Uint8ArrayList } from 'uint8arraylist';
import type { Codec } from 'protons-runtime';
export interface NoiseExtensions {
    webtransportCerthashes: Uint8Array[];
}
export declare namespace NoiseExtensions {
    const codec: () => Codec<NoiseExtensions>;
    const encode: (obj: NoiseExtensions) => Uint8Array;
    const decode: (buf: Uint8Array | Uint8ArrayList) => NoiseExtensions;
}
export interface NoiseHandshakePayload {
    identityKey: Uint8Array;
    identitySig: Uint8Array;
    extensions?: NoiseExtensions;
}
export declare namespace NoiseHandshakePayload {
    const codec: () => Codec<NoiseHandshakePayload>;
    const encode: (obj: NoiseHandshakePayload) => Uint8Array;
    const decode: (buf: Uint8Array | Uint8ArrayList) => NoiseHandshakePayload;
}
//# sourceMappingURL=payload.d.ts.map