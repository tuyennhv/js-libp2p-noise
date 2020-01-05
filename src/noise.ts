import { x25519 } from 'bcrypto';
import { Buffer } from "buffer";
import Wrap from 'it-pb-rpc';
import DuplexPair from 'it-pair/duplex';
import ensureBuffer from 'it-buffer';
import pipe from 'it-pipe';
import lp from 'it-length-prefixed';

import { Handshake as XX } from "./handshake-xx";
import { Handshake as IK } from "./handshake-ik";
import { Handshake as XXFallback } from "./handshake-xx-fallback";
import { generateKeypair } from "./utils";
import { uint16BEDecode, uint16BEEncode } from "./encoder";
import { decryptStream, encryptStream } from "./crypto";
import { bytes } from "./@types/basic";
import { NoiseConnection, PeerId, KeyPair, SecureOutbound } from "./@types/libp2p";
import { Duplex } from "./@types/it-pair";
import {XXHandshake} from "./handshakes/xx";
import {HandshakeInterface} from "./@types/handshake-interface";

export type WrappedConnection = ReturnType<typeof Wrap>;

type HandshakeParams = {
  connection: WrappedConnection;
  isInitiator: boolean;
  libp2pPublicKey: bytes;
  remotePeer: PeerId;
};

export class Noise implements NoiseConnection {
  public protocol = "/noise";

  private readonly prologue = Buffer.from(this.protocol);
  private readonly privateKey: bytes;
  private readonly staticKeys: KeyPair;
  private readonly earlyData?: bytes;

  constructor(privateKey: bytes, staticNoiseKey?: bytes, earlyData?: bytes) {
    this.privateKey = privateKey;
    this.earlyData = earlyData || Buffer.alloc(0);

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
    const libp2pPublicKey = localPeer.marshalPubKey();
    const handshake = await this.performHandshake({
      connection: wrappedConnection,
      isInitiator: true,
      libp2pPublicKey,
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
    const libp2pPublicKey = localPeer.marshalPubKey();
    const handshake = await this.performHandshake({
      connection: wrappedConnection,
      isInitiator: false,
      libp2pPublicKey,
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
   * If remote peer static key is unknown, use XX.
   * @param connection
   * @param isInitiator
   * @param libp2pPublicKey
   * @param remotePeer
   */
  private async performHandshake(params: HandshakeParams): Promise<HandshakeInterface> {
    // TODO: Implement noise pipes

    if (false) {
      let IKhandshake;
      try {
        IKhandshake = await this.performIKHandshake(params);
        return IKhandshake;
      } catch (e) {
        // XX fallback
        const ephemeralKeys = IKhandshake.getRemoteEphemeralKeys();
        return await this.performXXFallbackHandshake(params, ephemeralKeys, e.initialMsg);
      }
    } else {
      return await this.performXXHandshake(params);
    }
  }

  private async performXXFallbackHandshake(
    params: HandshakeParams,
    ephemeralKeys: KeyPair,
    initialMsg: bytes,
  ): Promise<XXFallback> {
    const { isInitiator, libp2pPublicKey, remotePeer, connection } = params;
    const handshake =
      new XXFallback(isInitiator, this.privateKey, libp2pPublicKey, this.prologue, this.staticKeys, connection, remotePeer, ephemeralKeys, initialMsg);

    try {
      await handshake.propose();
      await handshake.exchange();
      await handshake.finish(this.earlyData);
    } catch (e) {
      throw new Error(`Error occurred during XX Fallback handshake: ${e.message}`);
    }

    return handshake;
  }

  private async performXXHandshake(
    params: HandshakeParams,
  ): Promise<XX> {
    const { isInitiator, libp2pPublicKey, remotePeer, connection } = params;
    const handshake = new XX(isInitiator, this.privateKey, libp2pPublicKey, this.prologue, this.staticKeys, connection, remotePeer);

    try {
      await handshake.propose();
      await handshake.exchange();
      await handshake.finish(this.earlyData);
    } catch (e) {
      throw new Error(`Error occurred during XX handshake: ${e.message}`);
    }

    return handshake;
  }

  private async performIKHandshake(
    params: HandshakeParams,
  ): Promise<IK> {
    const { isInitiator, libp2pPublicKey, remotePeer, connection } = params;
    const handshake = new IK(params.isInitiator, this.privateKey, params.libp2pPublicKey, this.prologue, this.staticKeys, params.connection, remotePeer);

    // TODO

    return handshake;
  }

  private async createSecureConnection(
    connection: WrappedConnection,
    handshake: HandshakeInterface,
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
