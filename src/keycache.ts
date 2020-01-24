import {PeerId} from "./@types/libp2p";
import {bytes, bytes32} from "./@types/basic";

/**
 * Storage for static keys of previously connected peers.
 */
class Keycache {
  private storage = new Map<bytes, bytes32>();

  public store(peerId: PeerId, key: bytes32): void {
    this.storage.set(peerId.id, key);
  }

  public load(peerId: PeerId): bytes32|undefined {
    return this.storage.get(peerId.id);
  }

  public resetStorage(): void {
    this.storage.clear();
  }

}

const KeyCache = new Keycache();
export {
  KeyCache,
}
