import {ContextMenuItemList} from "./WinUI/ContextMenu.ts";
import {DialogFormBox, DialogFormBoxSchemaField} from "./WinUI/DialogFormBox.ts";
import {Connection, Endpoint, Router} from "./Model/serializable.ts";
import {DIALOG_BOX_CLOSABLE, DIALOG_BOX_HIDE_BUTTONS, DIALOG_BOX_MODAL} from "./WinUI/DialogBox.ts";
import ipaddr from "ipaddr.js";

export function getGraphContextMenuItems(): ContextMenuItemList {
    return [
        [
            {
                id: "normalizeGraph",
                sprite: null,
                label: "Normalize graph",
                enabled: true,
                nested: null
            },
            {
                id: "unhighlight",
                sprite: null,
                label: "Remove highlights",
                enabled: true,
                nested: null
            }
        ],
        [
            {
                id: null,
                sprite: null,
                label: "Generate",
                enabled: true,
                nested: [[{
                    id: "genNetwork",
                    sprite: "./ico/32/workgroup.png",
                    label: "Regional Network",
                    enabled: true,
                    nested: null
                }]]
            },
            {
                id: null,
                sprite: null,
                label: "New",
                enabled: true,
                nested: [[
                    {
                        id: "newRouter",
                        sprite: "./ico/32/switch.png",
                        label: "Router",
                        enabled: true,
                        nested: null
                    },
                    {
                        id: "newEndpoint",
                        sprite: "./ico/32/endpoint.png",
                        label: "Endpoint",
                        enabled: true,
                        nested: null
                    }
                ]]
            }
        ]
    ];
}

export function getDeviceContextMenuItems(): ContextMenuItemList {
    return [[{
        id: "connect",
        sprite: "./ico/32/patchcord.png",
        label: "Connect",
        enabled: true,
        nested: null
    }, {
        id: "properties",
        sprite: "./ico/32/properties.png",
        label: "Properties",
        enabled: true,
        nested: null
    }, {
        id: "delete",
        sprite: null,
        label: "Delete",
        enabled: true,
        nested: null
    }]];
}

export function getConnectionContextMenuSettings(): ContextMenuItemList {
    return [[{
        id: "properties",
        sprite: "./ico/32/properties.png",
        label: "Properties",
        enabled: true,
        nested: null
    }, {
        id: "delete",
        sprite: null,
        label: "Delete",
        enabled: true,
        nested: null
    }]];
}

export function createEndpointForm(endpoint: Endpoint | null = null): DialogFormBox {
    let schema = {
        Configuration: {
            name: new DialogFormBoxSchemaField("Hostname", "text", {
                value: endpoint?.hostname,
                placeholder: "pc1.local",
                disabled: !!endpoint,
            }),
            ipAddr: new DialogFormBoxSchemaField("IP", "text", {
                value: endpoint?.ipAddr,
                placeholder: "192.168.0.1",
                disabled: !!endpoint,
            })
        }
    };

    let form = new DialogFormBox(endpoint ? `Edit endpoint: ${endpoint.hostname}` : "New endpoint", schema, null, null,
        DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL, 420);

    form.setValidator((path, value): string | null => {
        if (!value)
            return `${path} can't be empty`;

        if (path == "ipAddr" && !ipaddr.IPv4.isValid(value)) {
            return `IP address ${value} is invalid`;
        }

        return null;
    });

    return form;
}

export function createRouterForm(router: Router | null = null): DialogFormBox {
    let schema = {
        Configuration: {
            name: new DialogFormBoxSchemaField("Hostname", "text", {
                value: router?.hostname,
                placeholder: "mikrotik.internal.amog.us",
                disabled: !!router,
            }),
            lanIp: new DialogFormBoxSchemaField("IP (LAN)", "text", {
                value: router?.lanIpAddr ?? "192.168.0.1",
                placeholder: "192.168.0.1"
            }),
            wanIp: new DialogFormBoxSchemaField("IP", "text", {
                value: router?.extIpAddr ?? "47.236.4.1",
                placeholder: "47.236.4.247"
            })
        }
    };

    let form = new DialogFormBox(router ? `Edit router: ${router.hostname}` : "New router", schema, null, null,
        DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL, 420);

    form.setValidator((path, value): string | null => {
        if (!value)
            return `${path} can't be empty`;

        if (path == "lanIpAddr" && !ipaddr.IPv4.isValid(value)) {
            return `LAN IP address ${value} is invalid`;
        } else if (path == "wanIp" && !ipaddr.IPv4.isValid(value)) {
            return `LAN IP address ${value} is invalid`;
        }

        return null;
    });

    return form;
}

export function createConnectionForm(conn: Connection | null, from: string | null = null,
                                     to: string | null = null): DialogFormBox {
    let schema = {
        Configuration: {
            name: new DialogFormBoxSchemaField("Name", "text", {
                value: conn?.name ?? "C1",
                placeholder: "C1",
                disabled: !!conn,
            }),
            errorRate: new DialogFormBoxSchemaField("Error rate (%)", "number", {
                min: 0,
                max: 100,
                step: 5,
                value: conn?.errors ?? 0
            }),
            from: new DialogFormBoxSchemaField("From", "select", {
                disabled: true,
                options: {
                    def: [from ?? conn?.from, 1]
                }
            }),
            to: new DialogFormBoxSchemaField("To", "select", {
                disabled: true,
                options: {
                    def: [to ?? conn?.to, 1]
                }
            }),
            weight: new DialogFormBoxSchemaField("Weight", "select", {
                options: {
                    2: [2, 0],
                    3: [3, 0],
                    5: [5, 0],
                    8: [8, 0],
                    11: [11, 0],
                    12: [12, 0],
                    14: [14, 0],
                    15: [15, 0],
                    18: [18, 1],
                    20: [20, 0]
                }
            }),
            duplex: new DialogFormBoxSchemaField("Duplex", "select", {
                options: {
                    yes: ["Duplex", true],
                    no: ["Non-duplex", false]
                },
                asRadioGroup: true
            }),
            type: new DialogFormBoxSchemaField("Type", "select", {
                options: {
                    fiber: ["Optical Fiber", true],
                    satellite: ["Satellite", false]
                },
                asRadioGroup: true
            }),
        }
    };

    return new DialogFormBox(conn ? `Edit router: ${conn.name}` : `New connection: ${from} -> ${to}`, schema, null, null,
        DIALOG_BOX_HIDE_BUTTONS | DIALOG_BOX_MODAL, 420);
}

export function createRouteHighlightForm(hostnames: Array<string>) {
    let hosts = hostnames.map(h => [h, 0]);
    hosts[0][1] = 1;

    let schema = {
        Properties: {
            from: new DialogFormBoxSchemaField("From", "select", {
                options: hosts
            }),
            to: new DialogFormBoxSchemaField("To", "select", {
                options: hosts
            })
        }
    };

    return new DialogFormBox("Find route", schema, null, null, DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL, 420);
}

export function createPacketTraceForm(hostnames: Array<string>) {
    let hosts = hostnames.map(h => [h, 0]);
    hosts[0][1] = 1;

    let schema = {
        Properties: {
            from: new DialogFormBoxSchemaField("From", "select", {
                options: hosts
            }),
            to: new DialogFormBoxSchemaField("To", "select", {
                options: hosts
            }),
            mtu: new DialogFormBoxSchemaField("MTU", "number", {
                min: 100,
                max: 150000,
                step: 100,
                value: 1500
            }),
            size: new DialogFormBoxSchemaField("Payload size", "number", {
                min: 8,
                max: 16777216,
                step: 8,
                value: 1024
            }),
            protocol: new DialogFormBoxSchemaField("Protocol", "select", {
                options: {
                    tcp: ["TCP", 1],
                    udp: ["UDP", 0]
                },
                asRadioGroup: true
            })
        }
    };

    return new DialogFormBox("Trace packet", schema, null, null, DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL, 420);
}

export function createGenerateNetworkForm(): DialogFormBox {
    let schema = {
        Properties: {
            prefix: new DialogFormBoxSchemaField("Prefix", "text", {
                value: "R1",
                placeholder: "R1"
            }),
            ipPrefix: new DialogFormBoxSchemaField("IP Prefix", "text", {
                value: "47.236.4.",
                placeholder: "47.236.4."
            }),
            hosts: new DialogFormBoxSchemaField("Hosts", "number", {
                min: 0,
                max: 48,
                step: 1,
                value: 8
            }),
            power: new DialogFormBoxSchemaField("Target power", "number", {
                min: 2.5,
                max: 20,
                step: 0.1,
                value: 3.5
            }),
            minErrors: new DialogFormBoxSchemaField("Error rate (%, min)", "number", {
                min: 0,
                max: 100,
                step: 5,
                value: 0,
            }),
            maxErrors: new DialogFormBoxSchemaField("Error rate (%, max)", "number", {
                min: 0,
                max: 100,
                step: 5,
                value: 0,
            }),
            connType: new DialogFormBoxSchemaField("Type", "select", {
                options: {
                    rand: ["Randomize", true],
                    fiber: ["Optical Fiber", false],
                    satellite: ["Satellite", false]
                },
                asRadioGroup: true
            }),
            connDuplex: new DialogFormBoxSchemaField("Duplex", "select", {
                options: {
                    rand: ["Randomize", true],
                    duplex: ["Only duplex", false],
                    noDuplex: ["Only non-duplex", false]
                },
                asRadioGroup: true
            }),
        }
    };

    return new DialogFormBox("Create regional network", schema, null, null, DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL, 420);
}