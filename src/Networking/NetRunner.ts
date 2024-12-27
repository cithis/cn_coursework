import {TopologyModel} from "../Model/TopologyModel.ts";

export type NetRunnerReport = {
    time: {
        clean: number,
        retransmission: number
    },
    traffic: {
        service: number,
        payload: {
            clean: number,
            retransmission: number
        }
    },
    packets: {
        service: number,
        payload: number,
    },
    quality: {
        delivered: number,
        corrected: number,
        lost: number
    }
};

export function createReport(): NetRunnerReport {
    return {
        time: {
            clean: 0,
            retransmission: 0
        },
        traffic: {
            service: 0,
            payload: {
                clean: 0,
                retransmission: 0
            }
        },
        packets: {
            service: 0,
            payload: 0,
        },
        quality: {
            delivered: 0,
            corrected: 0,
            lost: 0
        }
    }
}

export enum ProtocolType {
    TCP,
    UDP
}

export class NetRunnerUninitializedException extends Error {}
export class NetRunnerNoRouteException extends Error {}

export interface NetRunner {
    setModel(model: TopologyModel): void;
    runTest(from: string, to: string, mtu: number, pktSize: number): NetRunnerReport;
}