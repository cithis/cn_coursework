import {Graph, Node} from "@msagl/core";
import {TopologyModel} from "./Model/TopologyModel.ts";
import {Connection} from "./Model/serializable.ts";

type DistanceMap = Map<Node, number>;
type PredecessorMap = Map<Node, Node | null>;
type BellmanFordResult = {
    distances: DistanceMap,
    predecessors: PredecessorMap
};

function bellmanFord(model: TopologyModel, graph: Graph, node: Node): BellmanFordResult {
    const distances: DistanceMap = new Map();
    const predecessors: PredecessorMap = new Map();

    for (const node of graph.shallowNodes)
        predecessors.set(node, null);

    distances.set(node, 0);

    for (let i = 0; i < graph.shallowNodeCount - 1; i++) {
        for (const edge of graph.shallowEdges) {
            const u = edge.source;
            const v = edge.target;

            // @ts-ignore
            const weight = model.getConnectionByPair(edge.source.id, edge.target.id).weight;

            const newDistance = (distances.get(u) ?? Infinity) + weight;
            if (newDistance < (distances.get(v) ?? Infinity)) {
                distances.set(v, newDistance);
                predecessors.set(v, u);
            }
        }
    }

    return { distances, predecessors };
}

export function doFindRoute(model: TopologyModel, from: string, to: string): Array<Connection> | null {
    if (model.typeOf(from) != "endpoint" && model.typeOf(from) != "router")
        return null;
    else if (model.typeOf(to) != "endpoint" && model.typeOf(to) != "router")
        return null;

    let graph = model.graph.graph;
    let sourceNode = graph.findNode(from);
    let targetNode = graph.findNode(to);

    let bf = bellmanFord(model, graph, sourceNode);
    let path: Node[] = [];
    let currentNode: Node | null = targetNode;
    while (currentNode) {
        path.unshift(currentNode);
        currentNode = bf.predecessors.get(currentNode) ?? null;
    }

    let connections: Connection[] = [];
    for (let i = 0; i < path.length - 1; i++) {
        let nodeA = path[i];
        let nodeB = path[i + 1];
        let conn = model.getConnectionByPair(nodeA.id, nodeB.id);

        // @ts-ignore
        connections.push(conn);
    }

    return connections;
}