import {
    createReport,
    NetRunner,
    NetRunnerNoRouteException,
    NetRunnerReport,
    NetRunnerUninitializedException
} from "./NetRunner.ts";
import {TopologyModel} from "../Model/TopologyModel.ts";
import {Connection} from "../Model/serializable.ts";

export class TcpRunner implements NetRunner {
    private model: TopologyModel | null = null;

    protected sendPacket(route: Connection[], report: NetRunnerReport, sz: number, svc: boolean): void {
        let delivered = false, retry = false;
        while (!delivered) {
            for (let i = 0; i < route.length; i++) {
                let r = route[i];
                let t = r.weight * (r.duplex ? 1 : 2) * (sz + 60);

                report.time[retry ? "retransmission" : "clean"] += t;

                report.traffic.service += 60;
                if (svc)
                    report.traffic.service += sz;
                else
                    report.traffic.payload[retry ? "retransmission" : "clean"] += sz;

                report.packets[svc ? "service" : "payload"]++;

                if (Math.random() <= (r.errors / 100)) {
                    report.quality.corrected++;
                    retry = true;
                    break;
                }

                report.quality.delivered++;

                if (i == route.length - 1) {
                    if (!svc)
                        this.sendPacket(route, report, 0, true); // Simulate ACK response

                    delivered = true;
                }
            }
        }
    }

    runTest(from: string, to: string, mtu: number, pktSize: number): NetRunnerReport {
        if (!this.model)
            throw new NetRunnerUninitializedException();

        if (!this.model.get(from) || !this.model.get(to))
            throw new NetRunnerNoRouteException("Either one or both hosts are not registered in network");

        let route = this.model.findRoute(from, to);
        if (!route)
            throw new NetRunnerNoRouteException("Route not found");

        let report = createReport();

        this.sendPacket(route, report, 0, true); // TCP SYN
        this.sendPacket(route, report, 0, true); // TCP SYN+ACK
        this.sendPacket(route, report, 0, true); // TCP ACK

        let segmentsCount = Math.floor(pktSize / mtu);
        let remainder = pktSize - segmentsCount * mtu;
        let segments = [...[...Array(segmentsCount).keys()].map(_ => mtu)];
        if (remainder)
            segments.push(remainder);

        segments.forEach(sz => this.sendPacket(route, report, sz, false));

        this.sendPacket(route, report, 0, true); // TCP FIN

        return report;
    }

    setModel(model: TopologyModel): void {
        this.model = model;
    }
}