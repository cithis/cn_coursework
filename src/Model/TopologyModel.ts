import {
    Connection,
    ConnectionType,
    Endpoint,
    EntityCoordinates,
    Gadget,
    GadgetType,
    ModelSnapshot,
    Router
} from "./serializable.ts";
import ipaddr from "ipaddr.js";
import {
    CurveFactory,
    Edge,
    GeomEdge,
    GeomGraph,
    GeomNode,
    Graph,
    layoutGeomGraph,
    Node,
    Point
} from "@msagl/core";
import {doFindRoute} from "../algorithms.ts";

export type SerializableModel = Endpoint | Router | Gadget | Connection;

export class TopologyChangeEvent extends Event {
    public kind: string;
    public affectedObjects: SerializableModel[];

    constructor(kind: string, affectedObjects: SerializableModel[]) {
        super("changed", {
            bubbles: false,
            cancelable: false,
            composed: true
        });

        this.kind = kind;
        this.affectedObjects = affectedObjects;
    }
}

export class TopologyAddedEvent extends Event {
    public kind: string;
    public object: SerializableModel;

    constructor(kind: string, object: SerializableModel) {
        super("added", {
            bubbles: false,
            cancelable: false,
            composed: true
        });

        this.kind = kind;
        this.object = object;
    }
}

export class TopologyRemovedEvent extends Event {
    public multi: boolean;
    public kind: string;
    public id: string;

    constructor(kind: string, id: string, multi: boolean = false) {
        super("removed", {
            bubbles: false,
            cancelable: false,
            composed: true
        });

        this.multi = multi;
        this.kind = kind;
        this.id = id;
    }
}

export class AlreadyExistsException extends Error {
    public newObject: SerializableModel;

    constructor(newObject: SerializableModel) {
        super("Object " + ((newObject as any).name || (newObject as any).hostname) + " already exists");
        this.newObject = newObject;
    }
}

export class IpAddressConflictException extends Error {
    constructor(ip: string) {
        super(`IP ${ip} already exists in this network`);
    }
}

export class MalformedIpAddressException extends Error {
    constructor(ip: string) {
        super(`IP ${ip} is not a valid IP address`);
    }
}

export class HostNameUnresolvedException extends Error {
    constructor(hostname: string) {
        super(`Hostname ${hostname} is unresolved`);
    }
}

export class DuplicateConnectionException extends Error {
    constructor(a: string, b: string) {
        super(`Connection ${a} <-> ${b} already exists`);
    }
}

export class TopologyModel implements EventTarget {
    protected snapshot_: ModelSnapshot = ModelSnapshot.create();

    protected onAdded: EventListenerOrEventListenerObject | null = null;
    protected onChange: EventListenerOrEventListenerObject | null = null;
    protected onRemoved: EventListenerOrEventListenerObject | null = null;

    public get snapshot(): Uint8Array {
        return ModelSnapshot.encode(this.snapshot_).finish();
    }

    public set snapshot(snapshot: ModelSnapshot | Uint8Array) {
        this.importSnapshot(snapshot);
    }

    public get hostnames(): Array<string> {
        return [
            ...this.snapshot_.endpoints.map(e => e.hostname),
            ...this.snapshot_.routers.map(r => r.hostname)
        ];
    }

    public get connections(): Array<string> {
        return this.snapshot_.connections.map(c => c.name);
    }

    public get graph(): GeomGraph {
        let internalGraph = new Graph();
        let nodes: Record<string, GeomNode> = {};

        this.snapshot_.gadgets.forEach(({coords, name}) => {
            coords = coords || EntityCoordinates.create();
            let node = new Node(name);
            internalGraph.addNode(node);
            nodes[name] = new GeomNode(node);
            nodes[name].boundaryCurve = CurveFactory.mkCircle(128, new Point(0, 0));
        });

        [...this.snapshot_.endpoints, ...this.snapshot_.routers].forEach(({coords, hostname}) => {
            coords = coords || EntityCoordinates.create();
            let node = new Node(hostname);
            internalGraph.addNode(node);
            nodes[hostname] = new GeomNode(node);
            nodes[hostname].boundaryCurve = CurveFactory.mkCircle(128, new Point(0, 0));
        });

        this.snapshot_.connections.forEach(connection => {
            let e1 = new Edge(nodes[connection.from].node, nodes[connection.to].node);
            let e2 = new Edge(nodes[connection.to].node, nodes[connection.from].node);
            new GeomEdge(e1);
            new GeomEdge(e2);
        });

        return new GeomGraph(internalGraph);
    }

    public getEndpoint(hostname: string): Endpoint | null {
        for (let i = 0; i < this.snapshot_.endpoints.length; i ++)
            if (this.snapshot_.endpoints[i].hostname === hostname)
                return this.snapshot_.endpoints[i];

        return null;
    }

    public getEndpointByIP(ip: string, routerHostname: string): Endpoint | null {
        let router = this.getRouter(routerHostname);
        if (!router)
            throw new HostNameUnresolvedException(routerHostname);

        let connections = this.getConnectionsByHostname(routerHostname);
        for (let i = 0; i < connections.length; i++) {
            let connection = connections[i];
            let peer = connection.to == routerHostname ? connection.from : connection.to;
            let endpoint = this.getEndpoint(peer);
            if (endpoint && endpoint.ipAddr == ip)
                return endpoint;
        }

        return null;
    }

    public getRouter(hostname: string): Router | null {
        for (let i = 0; i < this.snapshot_.routers.length; i ++)
            if (this.snapshot_.routers[i].hostname === hostname)
                return this.snapshot_.routers[i];

        return null;
    }

    public getRouterByExternalIP(ip: string): Router | null {
        for (let i = 0; i < this.snapshot_.routers.length; i ++)
            if (this.snapshot_.routers[i].extIpAddr === ip)
                return this.snapshot_.routers[i];

        return null;
    }

    public getConnection(name: string): Connection | null {
        for (let i = 0; i < this.snapshot_.connections.length; i ++)
            if (this.snapshot_.connections[i].name === name)
                return this.snapshot_.connections[i];

        return null;
    }

    public getConnectionByPair(a: string, b: string): Connection | null {
        for (let i = 0; i < this.snapshot_.connections.length; i++)
            if ((this.snapshot_.connections[i].from == a && this.snapshot_.connections[i].to == b)
                || (this.snapshot_.connections[i].from == b && this.snapshot_.connections[i].to == a))
                return this.snapshot_.connections[i];

        return null;
    }

    public getConnectionsByHostname(hostname: string, onlyRouters: boolean = false): Connection[] {
        let res = [];
        for (let i = 0; i < this.snapshot_.connections.length; i++) {
            let connection = this.snapshot_.connections[i];
            if (onlyRouters) {
                if (connection.from == hostname && !!this.getRouter(connection.to))
                    res.push(connection);
                else if (connection.to == hostname && !!this.getRouter(connection.from))
                    res.push(connection);
            } else if (connection.to == hostname || connection.from == hostname) {
                res.push(connection);
            }
        }

        return res;
    }

    public getGadget(name: string): Gadget | null {
        for (let i = 0; i < this.snapshot_.gadgets.length; i ++)
            if (this.snapshot_.gadgets[i].name === name)
                return this.snapshot_.gadgets[i];

        return null;
    }

    public get(name: string): SerializableModel | null {
        return this.getEndpoint(name) || this.getRouter(name) || this.getGadget(name) || this.getConnection(name);
    }

    public has(name: string): boolean {
        return !!this.get(name);
    }

    public typeOf(name: string): string | null {
        if (this.getEndpoint(name))
            return "endpoint";
        else if (this.getRouter(name))
            return "router";
        else if (this.getGadget(name))
            return "gadget";
        else if (this.getConnection(name))
            return "connection";
        else
            return null;
    }

    public addEndpoint(endpoint: Endpoint): void {
        if (this.has(endpoint.hostname))
            throw new AlreadyExistsException(endpoint);

        if (!ipaddr.IPv4.isValid(endpoint.ipAddr))
            throw new MalformedIpAddressException(endpoint.ipAddr);

        let ip = ipaddr.IPv4.parse(endpoint.ipAddr).octets;
        if (ip[0] != 192 || ip[1] != 168 || ip[2] != 0)
            throw new MalformedIpAddressException(endpoint.ipAddr);

        this.snapshot_.endpoints.push(endpoint);
        this.dispatchEvent(new TopologyAddedEvent("endpoint", endpoint));
    }

    public validateRouterIP(router: Router): void {
        let existingRouter = this.getRouterByExternalIP(router.extIpAddr);
        if (existingRouter && existingRouter != router)
            throw new IpAddressConflictException(router.extIpAddr);

        if (!ipaddr.IPv4.isValid(router.lanIpAddr))
            throw new MalformedIpAddressException(router.lanIpAddr);

        let localIp = ipaddr.IPv4.parse(router.lanIpAddr).octets;
        if (localIp[0] != 192 || localIp[1] != 168 || localIp[2] != 0)
            throw new MalformedIpAddressException(router.lanIpAddr);

        this.getConnectionsByHostname(router.hostname).forEach((connection: Connection) => {
            let peer = connection.from == router.hostname ? connection.to : connection.from;
            let endpoint = this.getEndpoint(peer);
            if (endpoint && endpoint.ipAddr == router.lanIpAddr)
                throw new IpAddressConflictException(router.lanIpAddr);
        });
    }

    public addRouter(router: Router): void {
        if (this.has(router.hostname))
            throw new AlreadyExistsException(router);

        this.validateRouterIP(router);

        this.snapshot_.routers.push(router);
        this.dispatchEvent(new TopologyAddedEvent("router", router));
    }

    public addGadget(gadget: Gadget): void {
        if (this.has(gadget.name))
            throw new AlreadyExistsException(gadget);

        this.snapshot_.gadgets.push(gadget);
        this.dispatchEvent(new TopologyAddedEvent("gadget", gadget));
    }

    protected addConnection(a: object | null, b: object | null, name: string, hostA: string, hostB: string,
                            weight: number = 1, isDuplex: boolean = true,
                            type: ConnectionType = ConnectionType.OpticFiber,
                            errorRate: number = 0): void {
        if (!a)
            throw new HostNameUnresolvedException(hostA);
        else if (!b)
            throw new HostNameUnresolvedException(hostB);

        if (this.getConnectionByPair(hostA, hostB))
            throw new DuplicateConnectionException(hostA, hostB);

        if (this.has(name))
            throw new AlreadyExistsException(this.get(name) as SerializableModel);

        let conn = Connection.create({
            name: name,
            from: hostA,
            to: hostB,
            weight: weight,
            duplex: isDuplex,
            highlighted: false,
            errors: errorRate,
            type: type,
        });

        this.snapshot_.connections.push(conn);
        this.dispatchEvent(new TopologyAddedEvent("connection", conn));
    }

    public connectEndpointToEndpoint(name: string, hostA: string, hostB: string, weight: number = 1,
                                     isDuplex: boolean = true, type: ConnectionType = ConnectionType.OpticFiber,
                                     errorRate: number = 0): void {
        let a = this.getEndpoint(hostA);
        let b = this.getEndpoint(hostB);
        if (a && b && a.ipAddr == b.ipAddr)
            throw new IpAddressConflictException(a.ipAddr);

        this.addConnection(a, b, name, hostA, hostB, weight, isDuplex, type, errorRate);
    }

    public connectEndpointToRouter(name: string, hostA: string, hostB: string, weight: number = 1,
                                   isDuplex: boolean = true, type: ConnectionType = ConnectionType.OpticFiber,
                                   errorRate: number = 0): void {
        let endpoint = this.getEndpoint(hostA);
        let router = this.getRouter(hostB);
        if (!endpoint)
            throw new HostNameUnresolvedException(hostA);
        else if (!router)
            throw new HostNameUnresolvedException(hostB);

        let dup = this.getEndpointByIP(endpoint.ipAddr, hostB);
        if (!!dup || endpoint.ipAddr == router.lanIpAddr)
            throw new IpAddressConflictException(endpoint.ipAddr);

        this.addConnection(endpoint, this.getRouter(hostB), name, hostA, hostB, weight, isDuplex, type, errorRate);
    }

    public connectRouterToRouter(name: string, hostA: string, hostB: string, weight: number = 1,
                                 isDuplex: boolean = true, type: ConnectionType = ConnectionType.OpticFiber,
                                 errorRate: number = 0): void {
        this.addConnection(this.getRouter(hostA), this.getRouter(hostB), name, hostA, hostB, weight, isDuplex, type,
            errorRate);
    }

    public highlightConnection(name: string): boolean {
        let conn = this.getConnection(name);
        if (!conn)
            return false;

        conn.highlighted = true;
        this.dispatchEvent(new TopologyChangeEvent("connection", [conn]));

        return true;
    }

    public highlightEdge(hostA: string, hostB: string): boolean {
        let conn = this.getConnectionByPair(hostA, hostB);
        if (!conn)
            return false;

        conn.highlighted = true;
        this.dispatchEvent(new TopologyChangeEvent("connection", [conn]));

        return true;
    }

    public clearHighlights(): void {
        let changed: Connection[] = [];
        this.snapshot_.connections.forEach(conn => {
            if (!conn.highlighted)
                return;

            conn.highlighted = false;
            changed.push(conn);
        });

        this.dispatchEvent(new TopologyChangeEvent("connection", changed));
    }

    public editEndpoint(name: string, coordX: number | null = null, coordY: number | null = null): boolean {
        let endpoint = this.getEndpoint(name);
        if (!endpoint)
            return false;

        if (!endpoint.coords)
            endpoint.coords = EntityCoordinates.create();

        endpoint.coords.x = Math.ceil(coordX ?? endpoint.coords.x);
        endpoint.coords.y = Math.ceil(coordY ?? endpoint.coords.y);

        this.dispatchEvent(new TopologyChangeEvent("endpoint", [endpoint]));

        return true;
    }

    public editGadget(name: string, type: GadgetType | null = null, coordX: number | null = null,
                      coordY: number | null = null): boolean {
        let gadget = this.getGadget(name);
        if (!gadget)
            return false;

        gadget.type = type ?? gadget.type;

        if (!gadget.coords)
            gadget.coords = EntityCoordinates.create();

        gadget.coords.x = Math.ceil(coordX ?? gadget.coords.x);
        gadget.coords.y = Math.ceil(coordY ?? gadget.coords.y);

        this.dispatchEvent(new TopologyChangeEvent("gadget", [gadget]));

        return true;
    }

    public editRouter(name: string, lanIp: string | null = null, extIp: string | null = null,
                      coordX: number | null = null, coordY: number | null = null): boolean {
        let router = this.getRouter(name);
        if (!router)
            return false;

        let oldLanIp = router.lanIpAddr;
        let oldExtIp = router.extIpAddr;

        if (lanIp)
            router.lanIpAddr = lanIp;
        if (extIp)
            router.extIpAddr = extIp;

        if (lanIp || extIp) {
            try {
                this.validateRouterIP(router);
            } catch (e) {
                router.lanIpAddr = oldLanIp;
                router.extIpAddr = oldExtIp;
                throw e;
            }
        }

        if (!router.coords)
            router.coords = EntityCoordinates.create();

        router.coords.x = Math.ceil(coordX ?? router.coords.x);
        router.coords.y = Math.ceil(coordY ?? router.coords.y);

        this.dispatchEvent(new TopologyChangeEvent("router", [router]));

        return true;
    }

    public editConnection(name: string, weight: number | null = null, isDuplex: boolean | null = null,
                          type: ConnectionType | null = null, errors: number | null = null): boolean {
        let connection = this.getConnection(name);
        if (!connection)
            return false;

        connection.weight = weight ?? connection.weight;
        connection.duplex = isDuplex ?? connection.duplex;
        connection.type = type ?? connection.type;
        connection.errors = errors ?? connection.errors;

        this.dispatchEvent(new TopologyChangeEvent("connection", [connection]));

        return true;
    }

    protected removeEntity(type: string, idField: string, name: string): boolean {
        // @ts-ignore
        if (typeof (this.snapshot_[type + "s"] as SerializableModel[] | undefined) == "undefined")
            return false;

        let removed = false;
        // @ts-ignore
        this.snapshot_[type + "s"] = this.snapshot_[type + "s"].filter((obj: object) => {
            // @ts-ignore
            if (obj[idField] == name) {
                removed = true;
                return false;
            }
            return true;
        });

        if (removed) {
            this.dispatchEvent(new TopologyRemovedEvent(type, name));
            if (type == "endpoint" || type == "router")
                this.getConnectionsByHostname(name).forEach(connection => this.removeEntity("connection", "name", connection.name));
        }

        return removed;
    }

    public removeEndpoint(hostname: string): boolean {
        return this.removeEntity("endpoint", "hostname", hostname);
    }

    public removeRouter(hostname: string): boolean {
        return this.removeEntity("router", "hostname", hostname);
    }

    public removeGadget(name: string): boolean {
        return this.removeEntity("gadget", "name", name);
    }

    public removeConnection(name: string): boolean {
        return this.removeEntity("connection", "name", name);
    }

    public importSnapshot(from: ModelSnapshot | Uint8Array): void {
        this.reset();
        if (from instanceof Uint8Array)
            from = ModelSnapshot.decode(from);

        from.gadgets.forEach((gadget: Gadget) => this.addGadget(gadget));
        from.routers.forEach((router: Router) => this.addRouter(router));
        from.endpoints.forEach((endpoint: Endpoint) => this.addEndpoint(endpoint));
        from.connections.forEach((c: Connection) => {
            const dummy = Object.create(null);
            this.addConnection(dummy, dummy, c.name, c.from, c.to, c.weight, c.duplex, c.type, c.errors);
        });
    }

    public reset(): void {
        this.snapshot_.gadgets.forEach(g => this.removeGadget(g.name));
        this.snapshot_.connections.forEach(c => this.removeConnection(c.name));
        this.snapshot_.endpoints.forEach(e => this.removeEndpoint(e.hostname));
        this.snapshot_.routers.forEach(r => this.removeRouter(r.hostname));
    }

    public getNormalizedGraph(): GeomGraph {
        let graph = this.graph;
        layoutGeomGraph(graph);

        return graph;
    }

    public normalizeEntityCoordinates(): void {
        let normalGraph = this.getNormalizedGraph();

        this.snapshot_.gadgets.forEach((gadget: Gadget) => {
            let node = normalGraph.findNode(gadget.name);
            if (node) {
                gadget.coords = EntityCoordinates.create({
                    x: Math.ceil(node.center.x),
                    y: Math.ceil(node.center.y)
                });
            }
        });

        [...this.snapshot_.endpoints, ...this.snapshot_.routers].forEach(device => {
            let node = normalGraph.findNode(device.hostname);
            if (node) {
                device.coords = EntityCoordinates.create({
                    x: Math.ceil(node.center.x),
                    y: Math.ceil(node.center.y)
                });
            }
        });

        this.dispatchEvent(new TopologyChangeEvent("endpoint", this.snapshot_.endpoints));
        this.dispatchEvent(new TopologyChangeEvent("routers", this.snapshot_.routers));
        this.dispatchEvent(new TopologyChangeEvent("gadget", this.snapshot_.gadgets));
    }

    public findRoute(from: string, to: string): Array<Connection> | null {
        let res = doFindRoute(this, from, to);

        return res?.length ? res : null;
    }

    public addEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
        if (!callback)
            return;

        if (type == "change")
            this.onChange = callback;
        else if (type == "added")
            this.onAdded = callback;
        else if (type == "removed")
            this.onRemoved = callback;
    }

    dispatchEvent(event: Event): boolean {
        if (event instanceof TopologyChangeEvent) {
            if (!this.onChange)
                return true;

            if (typeof (this.onChange as EventListenerObject).handleEvent != "undefined")
                (this.onChange as EventListenerObject).handleEvent(event);
            else
                (this.onChange as EventListener)(event);
        } else if (event instanceof TopologyAddedEvent) {
            if (!this.onAdded)
                return true;

            if (typeof (this.onAdded as EventListenerObject).handleEvent != "undefined")
                (this.onAdded as EventListenerObject).handleEvent(event);
            else
                (this.onAdded as EventListener)(event);
        } else if (event instanceof TopologyRemovedEvent) {
            if (!this.onRemoved)
                return true;

            if (typeof (this.onRemoved as EventListenerObject).handleEvent != "undefined")
                (this.onRemoved as EventListenerObject).handleEvent(event);
            else
                (this.onRemoved as EventListener)(event);
        }

        return true;
    }

    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
        if (!callback)
            return;

        if (type == "change")
            this.onChange = null;
        else if (type == "added")
            this.onAdded = null;
        else if (type == "removed")
            this.onRemoved = null;
    }
}