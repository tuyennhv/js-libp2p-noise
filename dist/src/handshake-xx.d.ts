import type { PeerId } from '@libp2p/interface-peer-id';
import type { ProtobufStream } from 'it-pb-stream';
import type { bytes, bytes32 } from './@types/basic.js';
import type { NoiseSession } from './@types/handshake.js';
import type { KeyPair } from './@types/libp2p.js';
import type { IHandshake } from './@types/handshake-interface.js';
import type { ICryptoInterface } from './crypto.js';
import { XX } from './handshakes/xx.js';
import type { NoiseExtensions } from './proto/payload.js';
export declare class XXHandshake implements IHandshake {
    isInitiator: boolean;
    session: NoiseSession;
    remotePeer: PeerId;
    remoteExtensions: NoiseExtensions;
    protected payload: bytes;
    protected connection: ProtobufStream;
    protected xx: XX;
    protected staticKeypair: KeyPair;
    private readonly prologue;
    constructor(isInitiator: boolean, payload: bytes, prologue: bytes32, crypto: ICryptoInterface, staticKeypair: KeyPair, connection: ProtobufStream, remotePeer?: PeerId, handshake?: XX);
    propose(): Promise<void>;
    exchange(): Promise<void>;
    finish(): Promise<void>;
    encrypt(plaintext: Uint8Array, session: NoiseSession): bytes;
    decrypt(ciphertext: Uint8Array, session: NoiseSession, dst?: Uint8Array): {
        plaintext: bytes;
        valid: boolean;
    };
    getRemoteStaticKey(): bytes;
    private getCS;
    protected setRemoteNoiseExtension(e: NoiseExtensions | null | undefined): void;
}
//# sourceMappingURL=handshake-xx.d.ts.map