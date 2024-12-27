import {
    BufferGeometry,
    Color,
    GridHelper,
    Line,
    LineBasicMaterial,
    LineDashedMaterial,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    OrthographicCamera,
    PlaneGeometry,
    Raycaster,
    Scene,
    Vector2,
    Vector3,
    WebGLRenderer,
} from "three";
import {DragControls} from "three/addons/controls/DragControls.js";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {ContextMenu} from "./WinUI/ContextMenu.ts";
import {
    createConnectionForm,
    createEndpointForm,
    createGenerateNetworkForm, createPacketTraceForm,
    createRouteHighlightForm,
    createRouterForm,
    getConnectionContextMenuSettings,
    getDeviceContextMenuItems,
    getGraphContextMenuItems
} from "./uiFactories.ts";
import {TopologyAddedEvent, TopologyChangeEvent, TopologyModel, TopologyRemovedEvent} from "./Model/TopologyModel.ts";
import {DialogFormBoxResultType} from "./WinUI/DialogFormBox.ts";
import {Connection, ConnectionType, Endpoint, EntityCoordinates, Gadget, Router} from "./Model/serializable.ts";
import {DialogTextBox} from "./WinUI/DialogTextBox.ts";
import {DIALOG_BOX_CLOSABLE, DIALOG_BOX_HIDE_BUTTONS, DIALOG_BOX_MODAL} from "./WinUI/DialogBox.ts";
import {TextGeometry} from "three/addons/geometries/TextGeometry.js";
import {Font} from "three/addons/loaders/FontLoader.js";

// @ts-ignore
import download from "downloadjs";
import {UdpRunner} from "./Networking/UdpRunner.ts";
import {TcpRunner} from "./Networking/TcpRunner.ts";
import {TestRunnerApplet} from "./TestRunnerApplet.ts";

// @ts-ignore
import { Howl } from "howler";

export type ThreeViewTextures = {
    endpoint: MeshBasicMaterial,
    router: MeshBasicMaterial,
    font: Font
}

export type ThreeViewSounds = {
    connCreate: Howl,
    connRemove: Howl
}

enum ViewState {
    Ready,
    Dragging,
    Connecting
}

export class ThreeView {
    static BG_COLOR = 0xFFFCF8;
    static GRID_COLOR = 0xDCDCD7;
    static TEXT_COLOR = 0x000080;
    static DUPLEX_COLOR = 0x6232A8;
    static NON_DUPLEX_COLOR = 0x32A877;
    static HIGHLIGHTED_COLOR = 0xE82917;

    protected w: number;
    protected h: number;
    protected r: number;

    protected textures: ThreeViewTextures;
    protected sounds: ThreeViewSounds;

    protected raycaster: Raycaster = new Raycaster();
    protected renderer: WebGLRenderer = new WebGLRenderer({ antialias: true });
    protected camera: OrthographicCamera | null = null;
    protected scene: Scene = new Scene();

    protected orbitControls: OrbitControls | null = null;
    protected dragControls: DragControls | null = null;

    protected entityMap: Record<string, {
        icon: Mesh | Line,
        label: Mesh
    }> = {};

    protected rightClickCoords: number = 0;
    protected connectionOrigin: string | null = null;
    protected state: ViewState = ViewState.Ready;

    protected model: TopologyModel;

    public get canvas(): HTMLCanvasElement {
        return this.renderer.domElement;
    }

    protected get canvasRect(): DOMRect {
        return this.canvas.getBoundingClientRect();
    }

    public constructor(model: TopologyModel, textures: ThreeViewTextures, sounds: ThreeViewSounds,
                       w: number = window.innerWidth, h: number = window.innerHeight - 28) {
        this.w = w;
        this.h = h;
        this.r = w / h;

        this.scene.background = new Color(ThreeView.BG_COLOR);

        this.model = model;
        this.model.addEventListener("added", evt => this.onModelObjectAdded(evt as TopologyAddedEvent));
        this.model.addEventListener("change", evt => this.onModelObjectChanged(evt as TopologyChangeEvent));
        this.model.addEventListener("removed", evt => this.onModelObjectRemoved(evt as TopologyRemovedEvent));

        this.textures = textures;
        this.sounds = sounds;
    }

    protected renderLoop(): void {
        if (this.orbitControls && this.camera) {
            this.orbitControls.update();
            this.renderer.render(this.scene, this.camera);
        }
    }

    protected getNameByObject(thing: Object3D): string | null {
        for (let name in this.entityMap) {
            let group = this.entityMap[name];
            if (group.icon.id != thing.id && group.label.id != thing.id)
                continue;

            return name;
        }

        return null;
    }

    protected kindToMaterial(type: string): MeshBasicMaterial | null {
        switch (type) {
            case "endpoint":
                return this.textures.endpoint;
            case "router":
                return this.textures.router;
            default:
                return null;
        }
    }

    protected onDeviceAdded(kind: string, device: Endpoint | Router): void {
        if (!device.coords)
            return;

        let material = this.kindToMaterial(kind);
        if (!material)
            return;

        let iconMesh= new Mesh(new PlaneGeometry(64, 64), material);
        let textMesh = new Mesh(new TextGeometry(device.hostname, {
            font: this.textures.font,
            size: 18,
            curveSegments: 12,
        }), new MeshBasicMaterial({ color: ThreeView.TEXT_COLOR }));

        iconMesh.position.set(device.coords.x, device.coords.y, 2);
        textMesh.position.set(device.coords.x + 28, device.coords.y + 18, 3);

        this.scene.add(iconMesh);
        this.scene.add(textMesh);

        this.entityMap[device.hostname] = {
            icon: iconMesh,
            label: textMesh
        };

        // @ts-ignore
        this.dragControls.objects.push(iconMesh);
    }

    protected onObjectChanged(obj: Gadget | Endpoint | Router): void {
        let coords = obj.coords;
        if (!coords)
            return;

        let isDevice = "hostname" in obj; // @ts-ignore
        let group = this.entityMap[isDevice ? obj.hostname : obj.name];

        if (this.state != ViewState.Dragging) {
            group.icon.position.x = coords.x;
            group.icon.position.y = coords.y;
        }

        group.label.position.x = coords.x + 28;
        group.label.position.y = coords.y + 18;

        // Recalculate connection beam positions
        if (isDevice) {
            // @ts-ignore
            this.model.getConnectionsByHostname(obj.hostname).forEach((connection) => this.onConnectionChanged(connection));
        }
    }

    protected calculateLineProperties(conn: Connection): [BufferGeometry, LineBasicMaterial | LineDashedMaterial, Mesh] {
        // @ts-ignore
        let dev1: Endpoint | Router | Gadget = this.model.get(conn.from);
        // @ts-ignore
        let dev2: Endpoint | Router | Gadget = this.model.get(conn.to);

        let coords1 = dev1.coords as EntityCoordinates;
        let coords2 = dev2.coords as EntityCoordinates;

        let geometry = new BufferGeometry().setFromPoints([
            new Vector3(coords1.x, coords1.y, 1),
            new Vector3(coords2.x, coords2.y, 1),
        ]);

        let color = ThreeView.HIGHLIGHTED_COLOR;
        if (!conn.highlighted)
            color = conn.duplex ? ThreeView.DUPLEX_COLOR : ThreeView.NON_DUPLEX_COLOR;

        let material;
        if (conn.type == ConnectionType.Satellite)
            material = new LineDashedMaterial({ color: new Color(color), dashSize: 10, gapSize: 10 });
        else
            material = new LineBasicMaterial({ color: new Color(color) });

        let textCoords = new Vector3(
            ((coords1.x + coords2.x) / 2) + 10,
            ((coords1.y + coords2.y) / 2),
            2
        );

        let textMesh = new Mesh(new TextGeometry(`${conn.name} (${conn.weight})`, {
            font: this.textures.font,
            size: 14,
            curveSegments: 12,
        }), new MeshBasicMaterial({ color: conn.highlighted ? ThreeView.HIGHLIGHTED_COLOR : ThreeView.TEXT_COLOR }));

        textMesh.position.copy(textCoords);

        return [geometry, material, textMesh];
    }

    protected onConnectionAdded(conn: Connection): void {
        let [geometry, material, textMesh] = this.calculateLineProperties(conn);

        let lineMesh = new Line(geometry, material).computeLineDistances();
        this.scene.add(lineMesh);
        this.scene.add(textMesh);

        this.entityMap[conn.name] = {
            icon: lineMesh,
            label: textMesh,
        };

        this.sounds.connCreate.play();
    }

    protected onConnectionChanged(conn: Connection): void {
        let [geometry, material, textMesh] = this.calculateLineProperties(conn);
        let group = this.entityMap[conn.name];

        this.scene.remove(group.label);
        group.label = textMesh;

        this.scene.add(group.label);

        let line = group.icon as Line;
        line.geometry = geometry;
        line.material = material;
        line.computeLineDistances();
    }

    protected onObjectRemoved(name: string): void {
        let group = this.entityMap[name];
        this.scene.remove(group.icon, group.label);

        delete this.entityMap[name];
    }

    protected onModelObjectAdded(evt: TopologyAddedEvent): void {
        switch (evt.kind) {
            case "endpoint":
            case "router":
                this.onDeviceAdded(evt.kind, evt.object as (Endpoint | Router));
                break;
            case "connection":
                this.onConnectionAdded(evt.object as Connection);
        }
    }

    protected onModelObjectChanged(evt: TopologyChangeEvent): void {
        evt.affectedObjects.forEach(obj => {
            // @ts-ignore
            let meshGroup = this.entityMap[obj.name || obj.hostname];
            if (meshGroup.icon instanceof Line)
                this.onConnectionChanged(obj as Connection);
            else
                this.onObjectChanged(obj as Gadget | Endpoint | Router);
        });
    }

    protected onModelObjectRemoved(evt: TopologyRemovedEvent): void {
        this.onObjectRemoved(evt.id);
    }

    protected onIconDrag(evt: ({ object: Object3D } & Event)): void {
        let name = this.getNameByObject(evt.object);
        if (!name)
            return; // чзх юзер взял

        let group = this.entityMap[name];
        switch (this.model.typeOf(name)) {
            case "endpoint":
                this.model.editEndpoint(name, group.icon.position.x, group.icon.position.y);
                break;
            case "router":
                this.model.editRouter(name, null, null, group.icon.position.x, group.icon.position.y);
                break;
        }
    }

    protected async onDeviceContextMenu(type: string, device: Endpoint | Router, evt: MouseEvent) {
        let action = await (new ContextMenu(getDeviceContextMenuItems(), this.canvas))
            .prompt(evt.clientX, evt.clientY);

        switch (action) {
            case "properties":
                if (type == "endpoint") {
                    let form = createEndpointForm(device as Endpoint);
                    form.setContainer(this.canvas);
                    await form.display();
                } else if (type == "router") {
                    let router = device as Router;
                    let form = createRouterForm(router);
                    form.setContainer(this.canvas);

                    let res = await form.display();
                    if (res.result == DialogFormBoxResultType.OK) {
                        let data = res.data;
                        try {
                            this.model.editRouter(router.hostname, data?.lanIp as unknown as string,
                                data?.wanIp as unknown as string);
                        } catch (e) {
                            await new DialogTextBox("Error", (e as Error).message, this.canvas,
                                DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
                        }
                    }
                }
                break;
            case "connect":
                // @ts-ignore
                this.dragControls.disconnect();

                this.state = ViewState.Connecting;
                this.canvas.style.cursor = "alias";
                this.connectionOrigin = device.hostname;
                break;
            case "delete":
                if (type == "endpoint")
                    this.model.removeEndpoint(device.hostname);
                else if (type == "router")
                    this.model.removeRouter(device.hostname);
                break;
        }
    }

    protected async onConnectionContextMenu(connection: Connection, evt: PointerEvent) {
        let action = await (new ContextMenu(getConnectionContextMenuSettings(), this.canvas))
            .prompt(evt.clientX, evt.clientY);

        switch (action) {
            case "properties": {
                let form = createConnectionForm(connection);
                form.setContainer(this.canvas);

                let res = await form.display();
                if (res.result == DialogFormBoxResultType.OK) {
                    let data = res.data;
                    try {
                        this.model.editConnection(connection.name, Number(data?.weight as unknown as string),
                            (data?.duplex as unknown as string) == "yes",
                            (data?.type as unknown as string) == "fiber" ? ConnectionType.OpticFiber : ConnectionType.Satellite,
                            Number(data?.errorRate));
                    } catch (e) {
                        await new DialogTextBox("Error", (e as Error).message, this.canvas,
                            DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
                    }
                }
                break;
            }
            case "delete":
                this.model.removeConnection(connection.name);
                break;
        }
    }

    protected async generateNetwork(prefix: string, ipPrefix: string, hostCount: number, power: number,
                                    minErrors: number, maxErrors: number, type: ConnectionType | null,
                                    duplex: boolean | null = null): Promise<void> {
        let weights = [2, 3, 5, 8, 11, 12, 14, 15, 18, 20];

        let hosts = [];
        for (let i = 0; i < hostCount; i++) {
            let router = Router.create({
                hostname: `${prefix}-R${i}`,
                lanIpAddr: "192.168.0.1",
                extIpAddr: ipPrefix + i,
                coords: {
                    x: 0,
                    y: 0
                }
            });

            hosts.push(router.hostname);
            this.model.addRouter(router);
        }

        let targetEdgeCount = Math.ceil(power * hostCount / 2);
        for (let i = 0; i < targetEdgeCount; i++) {
            let randHost1 = hosts[Math.floor(Math.random() * hosts.length)];
            let restHosts = hosts.filter(x => x != randHost1);
            let randHost2 = restHosts[Math.floor(Math.random() * restHosts.length)];

            if (this.model.getConnectionByPair(randHost1, randHost2)) {
                i--;
                continue;
            }

            let randType = (type !== null) ? type : ((Math.random() >= 0.5) ? ConnectionType.Satellite : ConnectionType.OpticFiber);
            let randIsDuplex = (duplex !== null) ? duplex : Math.random() >= 0.5;
            let randErrorRate = Math.ceil(Math.random() * (maxErrors - minErrors) + minErrors);
            let randWeight = weights[Math.floor(Math.random() * weights.length)];

            this.model.connectRouterToRouter(`${prefix}-C${i}`, randHost1, randHost2, randWeight, randIsDuplex, randType,
                randErrorRate);
        }

        this.model.normalizeEntityCoordinates();
    }

    protected async onGraphClick(evt: MouseEvent, point: Vector2): Promise<void> {
        let action = await (new ContextMenu(getGraphContextMenuItems(), this.canvas))
            .prompt(evt.clientX, evt.clientY);

        switch (action) {
            case "unhighlight":
                this.model.clearHighlights();
                break;
            case "genNetwork": {
                let form = createGenerateNetworkForm();
                form.setContainer(this.canvas);

                let res = await form.display();
                if (res.result != DialogFormBoxResultType.OK)
                    return;

                let data = res.data;

                let type; // @ts-ignore
                switch (data.connType as string) {
                    case "fiber":
                        type = ConnectionType.OpticFiber;
                        break;
                    case "satellite":
                        type = ConnectionType.Satellite;
                        break;
                    default:
                    case "rand":
                        type = null;
                        break;
                }

                let duplex; // @ts-ignore
                switch (data.connDuplex as string) {
                    case "duplex":
                        duplex = true;
                        break;
                    case "noDuplex":
                        duplex = false;
                        break;
                    default:
                    case "rand":
                        duplex = null;
                        break;
                }

                // @ts-ignore
                this.generateNetwork(data.prefix, data.ipPrefix, Number(data.hosts), Number(data.power), Number(data.minErrors), Number(data.maxErrors), type, duplex);
                break;
            }
            case "newEndpoint": {
                let form = createEndpointForm();
                form.setContainer(this.canvas);

                let res = await form.display();
                if (res.result == DialogFormBoxResultType.OK) {
                    try {
                        this.model.addEndpoint(Endpoint.create({
                            hostname: res.data?.name as unknown as string,
                            ipAddr: res.data?.ipAddr as unknown as string,
                            coords: {
                                x: Math.ceil(point.x),
                                y: Math.ceil(point.y),
                            }
                        }));
                    } catch (e) {
                        await new DialogTextBox("Error", (e as Error).message, this.canvas,
                            DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
                    }
                }
                break;
            }
            case "newRouter": {
                let form = createRouterForm();
                form.setContainer(this.canvas);

                let res = await form.display();
                if (res.result == DialogFormBoxResultType.OK) {
                    try {
                        this.model.addRouter(Router.create({
                            hostname: res.data?.name as unknown as string,
                            lanIpAddr: res.data?.lanIp as unknown as string,
                            extIpAddr: res.data?.wanIp as unknown as string,
                            coords: {
                                x: Math.ceil(point.x),
                                y: Math.ceil(point.y),
                            }
                        }));
                    } catch (e) {
                        await new DialogTextBox("Error", (e as Error).message, this.canvas,
                            DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
                    }
                }
                break;
            }
            case "normalizeGraph":
                this.model.normalizeEntityCoordinates();
                break;
        }
    }

    protected async onConnectionRequest(from: string, to: string): Promise<void> {
        if (from == to) {
            await new DialogTextBox("Error", "Can't connect device to itself", this.canvas,
                DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();

            return;
        }

        let type1 = this.model.typeOf(from);
        let type2 = this.model.typeOf(to);
        if (!type1 || !type2)
            return; // Have objects been deleted while user was selecting?

        let connForm = createConnectionForm(null, from, to);
        connForm.setContainer(this.canvas);

        let res = await connForm.display();
        if (res.result != DialogFormBoxResultType.OK)
            return;

        let data = res.data;

        try {
            if (type1 == "endpoint" && type2 == "endpoint") {
                let existing1 = this.model.getConnectionsByHostname(from)[0];
                let existing2 = this.model.getConnectionsByHostname(to)[0];

                if (existing1)
                    this.model.removeConnection(existing1.name);
                if (existing2)
                    this.model.removeConnection(existing2.name);

                this.model.connectEndpointToEndpoint(data?.name as unknown as string, from, to,
                    Number(data?.weight as unknown as string), (data?.duplex as unknown as string) == "yes",
                    (data?.type as unknown as string) == "fiber" ? ConnectionType.OpticFiber : ConnectionType.Satellite,
                    Number(data?.errorRate));
            } else if (type1 == "endpoint" && type2 == "router") {
                let existing = this.model.getConnectionsByHostname(from)[0];

                if (existing)
                    this.model.removeConnection(existing.name);

                this.model.connectEndpointToRouter(data?.name as unknown as string, from, to,
                    Number(data?.weight as unknown as string), (data?.duplex as unknown as string) == "yes",
                    (data?.type as unknown as string) == "fiber" ? ConnectionType.OpticFiber : ConnectionType.Satellite,
                    Number(data?.errorRate));
            } else if (type1 == "router" && type2 == "endpoint") {
                let existing = this.model.getConnectionsByHostname(to)[0];

                if (existing)
                    this.model.removeConnection(existing.name);

                this.model.connectEndpointToRouter(data?.name as unknown as string, to, from,
                    Number(data?.weight as unknown as string), (data?.duplex as unknown as string) == "yes",
                    (data?.type as unknown as string) == "fiber" ? ConnectionType.OpticFiber : ConnectionType.Satellite,
                    Number(data?.errorRate));
            } else if (type1 == "router" && type2 == "router") {
                this.model.connectRouterToRouter(data?.name as unknown as string, from, to,
                    Number(data?.weight as unknown as string), (data?.duplex as unknown as string) == "yes",
                    (data?.type as unknown as string) == "fiber" ? ConnectionType.OpticFiber : ConnectionType.Satellite,
                    Number(data?.errorRate));
            } else {
                throw new Error(`Can't connect ${type1} to ${type2}`);
            }
        } catch (e) {
            await new DialogTextBox("Error", (e as Error).message, this.canvas,
                DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
        }
    }

    protected onCanvasClickBegin(evt: PointerEvent): void {
        if (evt.button == 2)
            this.rightClickCoords = evt.clientX * evt.clientY;
    }

    protected onCanvasClickEnd(evt: PointerEvent): void {
        if (!this.camera)
            return;

        if (evt.button == 2 && (evt.clientX * evt.clientY) != this.rightClickCoords)
            return; // Drag happened

        let point = new Vector2(
            ((evt.clientX - this.canvasRect.left) / this.w) * 2 - 1,
            -(((evt.clientY - this.canvasRect.top) / this.h) * 2 - 1),
        );

        this.raycaster.setFromCamera(point, this.camera);

        let isects = this.raycaster.intersectObjects(this.scene.children);
        for (let i = 0; i < isects.length; i++) {
            if (isects[i].object.type == "GridHelper")
                continue;

            let objectName = this.getNameByObject(isects[i].object);
            if (!objectName)
                return;

            if (evt.button == 2 && this.state != ViewState.Connecting) {
                switch (this.model.typeOf(objectName)) {
                    case "endpoint":
                        this.onDeviceContextMenu("endpoint", this.model.getEndpoint(objectName) as Endpoint, evt);
                        break;
                    case "router":
                        this.onDeviceContextMenu("router", this.model.getRouter(objectName) as Router, evt);
                        break;
                    case "connection":
                        this.onConnectionContextMenu(this.model.getConnection(objectName) as Connection, evt);
                }
            } else if (evt.button == 0 && this.state == ViewState.Connecting) {
                // @ts-ignore
                this.dragControls.connect();
                this.state = ViewState.Ready;

                if (this.connectionOrigin)
                    this.onConnectionRequest(this.connectionOrigin, objectName);
            }

            return;
        }

        let inWorldPoint: any = new Vector3(point.x, point.y, 0).unproject(this.camera);
        inWorldPoint = new Vector2(inWorldPoint.x, inWorldPoint.y);

        if (evt.button == 2)
            this.onGraphClick(evt, inWorldPoint);
    }

    protected onSaveButtonClick(): void {
        download(this.model.snapshot, prompt("Save as:", "network.topology") ?? "network.topology",
            "application/vnd.net-topology");
    }

    protected async onOpenButtonClick(): Promise<void> {
        // @ts-ignore
        let files: Array<FileSystemFileHandle> = await window.showOpenFilePicker({
            excludeAcceptAllOption: true,
            startIn: "documents",
            types: [{
                description: "Topology maps",
                accept: {
                    "application/vnd.net-topology": [".topology"]
                }
            }]
        });

        if (!files[0])
            return;

        let file = await files[0].getFile();
        let snap = new Uint8Array(await file.arrayBuffer());

        try {
            this.model.snapshot = snap;
        } catch (e) {
            let err = (e as Error).message;
            err = `Error while importing snapshot: ${err}`;
            await new DialogTextBox("Import error", err, this.canvas, DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
        }
    }

    protected async onTraceRequest(): Promise<void> {
        let names = this.model.hostnames;
        if (names.length < 2) {
            await new DialogTextBox("Error", "This functionality is available only when 2 or more nodes added",
                this.canvas, DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();

            return;
        }

        let form = createPacketTraceForm(names);
        form.setContainer(this.canvas);

        let res = await form.display();
        if (res.result != DialogFormBoxResultType.OK)
            return;

        // @ts-ignore
        let hostA = names[res.data.from], hostB = names[res.data.to], mtu = Number(res.data.mtu), // @ts-ignore
            sz = Number(res.data.size), isTcp = res.data.protocol == "tcp";

        let runner = isTcp ? new TcpRunner() : new UdpRunner();
        runner.setModel(this.model);

        let results = runner.runTest(hostA, hostB, mtu, sz);

        await new DialogTextBox("Results", `<pre>${JSON.stringify(results, null, "\t")}</pre>`, this.canvas,
            DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
    }

    protected async onRouteHighlightRequest(): Promise<void> {
        let names = this.model.hostnames;
        if (names.length < 2) {
            await new DialogTextBox("Error", "This functionality is available only when 2 or more nodes added",
                this.canvas, DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();

            return;
        }

        let form = createRouteHighlightForm(names);
        form.setContainer(this.canvas);

        let res = await form.display();
        if (res.result != DialogFormBoxResultType.OK)
            return;

        // @ts-ignore
        let nameA = names[res.data.from], nameB = names[res.data.to];

        let route = this.model.findRoute(nameA, nameB);
        if (!route) {
            // @ts-ignore
            await new DialogTextBox("No route to host", `No route to host ${nameB} from ${nameA}`, this.canvas,
                DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();

            return;
        }

        this.model.clearHighlights();
        route.forEach(conn => this.model.highlightConnection(conn.name));
    }

    public async init(): Promise<void> {
        const grid = new GridHelper(100000, 1000);
        grid.material = new LineBasicMaterial({ color: ThreeView.GRID_COLOR });
        grid.rotation.x = Math.PI/2;
        grid.position.z = -10;
        this.scene.add(grid);

        const viewport = this.r * this.h;
        this.camera = new OrthographicCamera(viewport / -2, viewport / 2, this.h / 2, this.h / -2, -80, 80);
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);

        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.minZoom = 0.1;
        this.orbitControls.maxZoom = 2.0;
        this.orbitControls.mouseButtons.LEFT = null;

        this.dragControls = new DragControls([], this.camera, this.renderer.domElement);

        // @ts-ignore
        this.dragControls.addEventListener("drag", evt => this.onIconDrag(evt));
        this.dragControls.addEventListener("dragstart", _evt => {
            this.state = ViewState.Dragging;
        });
        this.dragControls.addEventListener("dragend", _evt => {
            this.state = ViewState.Ready;
        });

        this.renderer.setAnimationLoop(() => this.renderLoop());
        this.renderer.setSize(this.w, this.h);

        this.renderer.domElement.addEventListener("pointerdown", evt => this.onCanvasClickBegin(evt));
        this.renderer.domElement.addEventListener("pointerup", evt => this.onCanvasClickEnd(evt));

        document.getElementById("saveFileBtn")?.addEventListener("click", () => this.onSaveButtonClick());
        document.getElementById("openFileBtn")?.addEventListener("click", () => this.onOpenButtonClick());
        document.getElementById("traceBtn")?.addEventListener("click", () => this.onTraceRequest());
        document.getElementById("routeHighlightBtn")?.addEventListener("click", () => this.onRouteHighlightRequest());

        document.getElementById("analysisBtn")?.addEventListener("click", () => {
            let applet = new TestRunnerApplet("Transient analysis", this.canvas,
                DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL | DIALOG_BOX_HIDE_BUTTONS, 800);

            applet.model = this.model;
            applet.display();
        });

        document.body.addEventListener("keydown", evt => {
            if (evt.ctrlKey) {
                if (evt.which == 79) {
                    this.onOpenButtonClick();
                    evt.preventDefault();
                } else if (evt.which == 83) {
                    this.onSaveButtonClick();
                    evt.preventDefault();
                }
            }
        });
    }
}