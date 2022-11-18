import type { Metrics } from '@libp2p/interface-metrics';
export declare type MetricsRegistry = ReturnType<typeof registerMetrics>;
export declare function registerMetrics(metrics: Metrics): {
    xxHandshakeSuccesses: import("@libp2p/interface-metrics").Counter;
    xxHandshakeErrors: import("@libp2p/interface-metrics").Counter;
    encryptedPackets: import("@libp2p/interface-metrics").Counter;
    decryptedPackets: import("@libp2p/interface-metrics").Counter;
    decryptErrors: import("@libp2p/interface-metrics").Counter;
};
//# sourceMappingURL=metrics.d.ts.map