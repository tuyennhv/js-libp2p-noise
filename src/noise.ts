import { x25519 } from 'bcrypto';
import { Buffer } from "buffer";
import Wrap from 'it-pb-rpc';
import DuplexPair from 'it-pair/duplex';
import ensureBuffer from 'it-buffer';
import pipe from 'it-pipe';
import lp from 'it-length-prefixed';

import { XXHandshake } from "./handshake-xx";
import { IKHandshake } from "./handshake-ik";
import { XXFallbackHandshake } from "./handshake-xx-fallback";
import { generateKeypair, getPayload } from "./utils";
import { uint16BEDecode, uint16BEEncode } from "./encoder";
import { decryptStream, encryptStream } from "./crypto";
import { bytes } from "./@types/basic";
import { INoiseConnection, PeerId, KeyPair, SecureOutbound } from "./@types/libp2p";
import { Duplex } from "./@types/it-pair";
import {IHandshake} from "./@types/handshake-interface";
import {KeyCache} from "./keycache";
import {logger} from "./logger";

export type WrappedConnection = ReturnType<typeof Wrap>;

type HandshakeParams = {
  connection: WrappedConnection;
  isInitiator: boolean;
  localPeer: PeerId;
  remotePeer: PeerId;
};

export class Noise implements INoiseConnection {
  public protocol = "/noise";

  private readonly prologue = Buffer.from(this.protocol);
  private readonly staticKeys: KeyPair;
  private readonly earlyData?: bytes;
  private useNoisePipes: boolean;

  constructor(staticNoiseKey?: bytes, earlyData?: bytes, useNoisePipes = true) {
    this.earlyData = earlyData || Buffer.alloc(0);
    this.useNoisePipes = useNoisePipes;

    if (staticNoiseKey) {
      const publicKey = x25519.publicKeyCreate(staticNoiseKey); // TODO: verify this
      this.staticKeys = {
        privateKey: staticNoiseKey,
        publicKey,
      }
    } else {
      this.staticKeys = generateKeypair();
    }
  }

  /**
   * Encrypt outgoing data to the remote party (handshake as initiator)
   * @param {PeerId} localPeer - PeerId of the receiving peer
   * @param connection - streaming iterable duplex that will be encrypted
   * @param {PeerId} remotePeer - PeerId of the remote peer. Used to validate the integrity of the remote peer.
   * @returns {Promise<SecureOutbound>}
   */
  public async secureOutbound(localPeer: PeerId, connection: any, remotePeer: PeerId): Promise<SecureOutbound> {
    const wrappedConnection = Wrap(connection);
    const handshake = await this.performHandshake({
      connection: wrappedConnection,
      isInitiator: true,
      localPeer,
      remotePeer,
    });
    const conn = await this.createSecureConnection(wrappedConnection, handshake);

    return {
      conn,
      remotePeer,
    }
  }

  /**
   * Decrypt incoming data (handshake as responder).
   * @param {PeerId} localPeer - PeerId of the receiving peer.
   * @param connection - streaming iterable duplex that will be encryption.
   * @param {PeerId} remotePeer - optional PeerId of the initiating peer, if known. This may only exist during transport upgrades.
   * @returns {Promise<SecureOutbound>}
   */
  public async secureInbound(localPeer: PeerId, connection: any, remotePeer: PeerId): Promise<SecureOutbound> {
    const wrappedConnection = Wrap(connection);
    const handshake = await this.performHandshake({
      connection: wrappedConnection,
      isInitiator: false,
      localPeer,
      remotePeer
    });
    const conn = await this.createSecureConnection(wrappedConnection, handshake);

    return {
      conn,
      remotePeer,
    };
  }

  /**
   * If Noise pipes supported, tries IK handshake first with XX as fallback if it fails.
   * If noise pipes disabled or remote peer static key is unknown, use XX.
   * @param connection
   * @param isInitiator
   * @param libp2pPublicKey
   * @param remotePeer
   */
  private async performHandshake(params: HandshakeParams): Promise<IHandshake> {
    const payload = await getPayload(params.localPeer, this.staticKeys.publicKey, this.earlyData);

    let tryIK = this.useNoisePipes;
    const foundRemoteStaticKey = await KeyCache.load(params.remotePeer);
    if (tryIK && params.isInitiator && !foundRemoteStaticKey) {
      tryIK = false;
      logger(`Static key not found.`)
    }

    // Try IK if acting as responder or initiator that has remote's static key.
    if (tryIK) {
      // Try IK first
      const { remotePeer, connection, isInitiator } = params;
      if (!foundRemoteStaticKey) {
        // TODO: Recheck. Possible that responder should not have it here.
        throw new Error("Remote static key should be initialized.");
      }

      const IKhandshake = new IKHandshake(isInitiator, Buffer.from(payload), this.prologue, this.staticKeys, connection, remotePeer, foundRemoteStaticKey);
      try {
        return await this.performIKHandshake(IKhandshake);
      } catch (e) {
        // IK failed, go to XX fallback
        let ephemeralKeys;
        if (params.isInitiator) {
          ephemeralKeys = IKhandshake.getRemoteEphemeralKeys();
        }
        return await this.performXXFallbackHandshake(params, payload, e.initialMsg, ephemeralKeys);
      }
    } else {
      // Noise pipes not supported, use XX
      return await this.performXXHandshake(params, payload);
    }
  }

  private async performXXFallbackHandshake(
    params: HandshakeParams,
    payload: bytes,
    initialMsg: bytes,
    ephemeralKeys?: KeyPair,
  ): Promise<XXFallbackHandshake> {
    const { isInitiator, remotePeer, connection } = params;
    const handshake =
      new XXFallbackHandshake(isInitiator, payload, this.prologue, this.staticKeys, connection, remotePeer, initialMsg, ephemeralKeys);

    try {
      await handshake.propose();
      await handshake.exchange();
      await handshake.finish();
    } catch (e) {
      logger(e);
      throw new Error(`Error occurred during XX Fallback handshake: ${e.message}`);
    }

    return handshake;
  }

  private async performXXHandshake(
    params: HandshakeParams,
    payload: bytes,
  ): Promise<XXHandshake> {
    const { isInitiator, remotePeer, connection } = params;
    const handshake = new XXHandshake(isInitiator, payload, this.prologue, this.staticKeys, connection, remotePeer);

    try {
      await handshake.propose();
      await handshake.exchange();
      await handshake.finish();

      if (this.useNoisePipes) {
        await KeyCache.store(remotePeer, handshake.getRemoteStaticKey());
      }
    } catch (e) {
      throw new Error(`Error occurred during XX handshake: ${e.message}`);
    }

    return handshake;
  }

  private async performIKHandshake(
    handshake: IKHandshake,
  ): Promise<IKHandshake> {

    await handshake.stage0();
    await handshake.stage1();

    return handshake;
  }

  private async createSecureConnection(
    connection: WrappedConnection,
    handshake: IHandshake,
  ): Promise<Duplex> {
    // Create encryption box/unbox wrapper
    const [secure, user] = DuplexPair();
    const network = connection.unwrap();

    pipe(
      secure, // write to wrapper
      ensureBuffer, // ensure any type of data is converted to buffer
      encryptStream(handshake), // data is encrypted
      lp.encode({ lengthEncoder: uint16BEEncode }), // prefix with message length
      network, // send to the remote peer
      lp.decode({ lengthDecoder: uint16BEDecode }), // read message length prefix
      ensureBuffer, // ensure any type of data is converted to buffer
      decryptStream(handshake), // decrypt the incoming data
      secure // pipe to the wrapper
    );

    return user;
  }


}
