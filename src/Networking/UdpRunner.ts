import {
    createReport,
    NetRunner,
    NetRunnerNoRouteException,
    NetRunnerReport,
    NetRunnerUninitializedException
} from "./NetRunner.ts";
import {TopologyModel} from "../Model/TopologyModel.ts";

export class UdpRunner implements NetRunner {
    private model: TopologyModel | null = null;

    runTest(from: string, to: string, mtu: number, pktSize: number): NetRunnerReport {
        if (!this.model)
            throw new NetRunnerUninitializedException();

        if (!this.model.get(from) || !this.model.get(to))
            throw new NetRunnerNoRouteException("Either one or both hosts are not registered in network");

        let route = this.model.findRoute(from, to);
        if (!route)
            throw new NetRunnerNoRouteException("Route not found");

        let segmentsCount = Math.floor(pktSize / mtu);
        let remainder = pktSize - segmentsCount * mtu;
        let segments = [...[...Array(segmentsCount).keys()].map(_ => mtu)];
        if (remainder)
            segments.push(remainder);

        let report = createReport();
        segments.forEach(sz => {
            for (let i = 0; i < route.length; i++) {
                let r = route[i];
                let t = r.weight * (r.duplex ? 1 : 2) * (sz + 28);

                report.traffic.service += 20 + 8; // IP + UDP headers;
                report.traffic.payload.clean += sz;
                report.packets.payload++; // UDP doesn't send any service packets
                report.time.clean += t;

                if (Math.random() <= (r.errors / 100)) {
                    report.quality.lost++;
                    break; // Whoops packet lost
                }

                report.quality.delivered++;
            }
        });

        return report;
    }

    setModel(model: TopologyModel): void {
        this.model = model;
    }
}