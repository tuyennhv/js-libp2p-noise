import { HKDF } from '@stablelib/hkdf';
import * as x25519 from '@stablelib/x25519';
import { SHA256, hash } from '@stablelib/sha256';
import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305';
export const stablelib = {
    hashSHA256(data) {
        return hash(data);
    },
    getHKDF(ck, ikm) {
        const hkdf = new HKDF(SHA256, ikm, ck);
        const okmU8Array = hkdf.expand(96);
        const okm = okmU8Array;
        const k1 = okm.subarray(0, 32);
        const k2 = okm.subarray(32, 64);
        const k3 = okm.subarray(64, 96);
        return [k1, k2, k3];
    },
    generateX25519KeyPair() {
        const keypair = x25519.generateKeyPair();
        return {
            publicKey: keypair.publicKey,
            privateKey: keypair.secretKey
        };
    },
    generateX25519KeyPairFromSeed(seed) {
        const keypair = x25519.generateKeyPairFromSeed(seed);
        return {
            publicKey: keypair.publicKey,
            privateKey: keypair.secretKey
        };
    },
    generateX25519SharedKey(privateKey, publicKey) {
        return x25519.sharedKey(privateKey, publicKey);
    },
    chaCha20Poly1305Encrypt(plaintext, nonce, ad, k) {
        const ctx = new ChaCha20Poly1305(k);
        return ctx.seal(nonce, plaintext, ad);
    },
    chaCha20Poly1305Decrypt(ciphertext, nonce, ad, k, dst) {
        const ctx = new ChaCha20Poly1305(k);
        return ctx.open(nonce, ciphertext, ad, dst);
    }
};
//# sourceMappingURL=stablelib.js.map