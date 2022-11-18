import { expect } from 'aegir/chai';
import { duplexPair } from 'it-pair/duplex';
import { pbStream } from 'it-pb-stream';
import sinon from 'sinon';
import { Noise } from '../src/noise.js';
import { createPeerIdsFromFixtures } from './fixtures/peer.js';
function createCounterSpy() {
    return sinon.spy({
        increment: () => { },
        reset: () => { }
    });
}
describe('Index', () => {
    it('should expose class with tag and required functions', () => {
        const noise = new Noise();
        expect(noise.protocol).to.equal('/noise');
        expect(typeof (noise.secureInbound)).to.equal('function');
        expect(typeof (noise.secureOutbound)).to.equal('function');
    });
    it('should collect metrics', async () => {
        const [localPeer, remotePeer] = await createPeerIdsFromFixtures(2);
        const metricsRegistry = new Map();
        const metrics = {
            registerCounter: (name) => {
                const counter = createCounterSpy();
                metricsRegistry.set(name, counter);
                return counter;
            }
        };
        const noiseInit = new Noise({ metrics: metrics });
        const noiseResp = new Noise({});
        const [inboundConnection, outboundConnection] = duplexPair();
        const [outbound, inbound] = await Promise.all([
            noiseInit.secureOutbound(localPeer, outboundConnection, remotePeer),
            noiseResp.secureInbound(remotePeer, inboundConnection, localPeer)
        ]);
        const wrappedInbound = pbStream(inbound.conn);
        const wrappedOutbound = pbStream(outbound.conn);
        wrappedOutbound.writeLP(Buffer.from('test'));
        await wrappedInbound.readLP();
        expect(metricsRegistry.get('libp2p_noise_xxhandshake_successes_total')?.increment.callCount).to.equal(1);
        expect(metricsRegistry.get('libp2p_noise_xxhandshake_error_total')?.increment.callCount).to.equal(0);
        expect(metricsRegistry.get('libp2p_noise_encrypted_packets_total')?.increment.callCount).to.equal(1);
        expect(metricsRegistry.get('libp2p_noise_decrypt_errors_total')?.increment.callCount).to.equal(0);
    });
});
//# sourceMappingURL=index.spec.js.map