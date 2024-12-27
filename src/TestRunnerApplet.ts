import {DIALOG_BOX_CLOSABLE, DIALOG_BOX_MODAL, DialogBox} from "./WinUI/DialogBox.ts";
import {TopologyModel} from "./Model/TopologyModel.ts";
import {NetRunnerReport} from "./Networking/NetRunner.ts";
import {TcpRunner} from "./Networking/TcpRunner.ts";
import {UdpRunner} from "./Networking/UdpRunner.ts";
import {DialogTextBox} from "./WinUI/DialogTextBox.ts";
import * as Excel from "exceljs";

// @ts-ignore
import download from "downloadjs";

const {CoffeeScript} = require("coffeescript");

export class TestRunnerApplet extends DialogBox {
    protected model_: TopologyModel | null = null;
    protected reports: Record<string, NetRunnerReport> = {};

    public set model(model: TopologyModel) {
        this.model_ = model;
    }

    protected onMaximize(_evt: MouseEvent): void {}
    protected onMinimize(_evt: MouseEvent): void {}

    protected async onExport() {
        if (Object.keys(this.reports).length < 1) {
            await new DialogTextBox("Error", "No tests to export", this.dialogEl as HTMLDivElement,
                DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
            return;
        }

        let workbook = new Excel.Workbook();
        let worksheet = workbook.addWorksheet("Test Results");
        worksheet.columns = [
            { header: "Test", key: "id", width: 26 },
            { header: "Time (total)", key: "timeTotal", width: 11 },
            { header: "Time (clean)", key: "timeClean", width: 11 },
            { header: "Time (retransmission)", key: "timeRetransmission", width: 20 },
            { header: "Traffic (service)", key: "trafficSvc", width: 20 },
            { header: "Traffic (payload)", key: "trafficPayloadClean", width: 15 },
            { header: "Traffic (retransmission)", key: "trafficPayloadRetransmission", width: 21 },
            { header: "Traffic (total payload)", key: "trafficPayloadTotal", width: 19 },
            { header: "Traffic (total)", key: "trafficTotal", width: 12 },
            { header: "Packets (total)", key: "packetsTotal", width: 13 },
            { header: "Packets (service)", key: "packetsService", width: 15 },
            { header: "Packets (payload)", key: "packetsPayload", width: 16 },
            { header: "Packets (delivered)", key: "packetsDelivered", width: 18 },
            { header: "Packets (corrected)", key: "packetsCorrected", width: 17 },
            { header: "Packets (loss)", key: "packetsLoss", width: 12 },
        ];

        for (const testId in this.reports) {
            let report = this.reports[testId];
            worksheet.addRow({
                id: testId,
                timeTotal: report.time.clean + report.time.retransmission,
                timeClean: report.time.clean,
                timeRetransmission: report.time.retransmission,
                trafficSvc: report.traffic.service,
                trafficTotal: report.traffic.service + report.traffic.payload.clean + report.traffic.payload.retransmission,
                trafficPayloadTotal: report.traffic.payload.clean + report.traffic.payload.retransmission,
                trafficPayloadClean: report.traffic.payload.clean,
                trafficPayloadRetransmission: report.traffic.payload.retransmission,
                packetsTotal: report.packets.payload + report.packets.service,
                packetsService: report.packets.service,
                packetsPayload: report.packets.payload,
                packetsDelivered: report.quality.delivered,
                packetsCorrected: report.quality.corrected,
                packetsLoss: report.quality.lost,
            })
        }

        // @ts-ignore
        let xlsx = new Blob([await workbook.xlsx.writeBuffer()]);
        download(xlsx, prompt("Save as:", "tests.xlsx") ?? "network.xlsx",
            "application/vnd.ms-excel");
    }
    
    protected onRun(box: HTMLTextAreaElement, table: HTMLTableElement): void {
        let code: string = CoffeeScript.compile(box.value);
        
        let tests = {}; // @ts-ignore
        let addTest = (name: string, proto: string, from: string, to: string, mtu: number, pktSize: number, sample: number) => {
            for (let i = 0; i < sample; i++) // @ts-ignore
                tests[name.replace("$", i)] = [proto, from, to, mtu, pktSize];
        };
        
        // @ts-ignore
        let Model = this.model_;
        eval(code);
        
        this.reports = {};
        for (const testId in tests) {
            // @ts-ignore
            let runner = tests[testId][0] == "tcp" ? new TcpRunner() : new UdpRunner();
            runner.setModel(Model as TopologyModel);

            try {
                // @ts-ignore
                this.reports[testId] = runner.runTest(...tests[testId].slice(1));
            } catch (e) {
                new DialogTextBox("Error", `Error in ${testId}: ` + (e as Error).message, this.dialogEl as HTMLDivElement,
                    DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL).display();
                break;
            }
        }

        table.querySelectorAll("tr:has(td)").forEach(el => el.remove());
        for (const testId in this.reports) {
            let report = this.reports[testId];

            // @ts-ignore
            table.querySelector("tbody").innerHTML += `
                <tr>
                    <td>${testId}</td>
                    <td>${report.time.clean}</td>
                    <td>${report.time.retransmission}</td>
                    <td>${report.traffic.service}</td>
                    <td>${report.traffic.payload.clean}</td>
                    <td>${report.traffic.payload.retransmission}</td>
                    <td>${report.packets.service}</td>
                    <td>${report.packets.payload}</td>
                    <td>${report.quality.delivered}</td>
                    <td>${report.quality.corrected}</td>
                    <td>${report.quality.lost}</td>
                </tr>
            `;
        }
    }

    protected onRender(body: HTMLDivElement): void {
        if (!this.model_)
            throw new Error("Set model property first");

        let container = document.createElement("div");
        container.style.gap = "10px";
        container.style.width = "920px";
        container.style.display = "grid";
        container.style.minHeight = "600px";
        container.style.gridTemplateColumns = "1fr 2fr";

        let textBox = document.createElement("textarea");
        textBox.style.border = "2px lightgray inset";
        textBox.style.resize = "none";

        let tableContainer = document.createElement("div");
        tableContainer.className = "has-scrollbar test-runner-tbl";
        tableContainer.style.height = "600px";
        tableContainer.style.overflow = "auto";
        tableContainer.style.background = "#fff";

        let table = document.createElement("table");
        table.style.width = "100%";
        table.style.fontSize = "9px";
        table.style.tableLayout = "fixed";
        table.style.borderCollapse = "collapse";

        table.innerHTML += `
            <tr>
                <th>Test</th>
                <th>Time (clean)</th>
                <th>Time (retry)</th>
                <th>Traffic (service)</th>
                <th>Traffic (payload)</th>
                <th>Traffic (retry)</th>
                <th>Packets (service)</th>
                <th>Packets (payload)</th>
                <th>Packets (sent)</th>
                <th>Packets (fixed)</th>
                <th>Packets (lost)</th>
            </tr>`;

        tableContainer.appendChild(table);
        container.appendChild(textBox);
        container.appendChild(tableContainer);

        body.appendChild(container);

        let actionSection = document.createElement("section");
        actionSection.classList.add("field-row");
        actionSection.style.justifyContent = "flex-end";

        let runButtonEl = document.createElement("button");
        runButtonEl.className = "default";
        runButtonEl.textContent = "Run";
        runButtonEl.addEventListener("click", () => this.onRun(textBox, table));

        let exportButtonEl = document.createElement("button");
        exportButtonEl.textContent = "Export";
        exportButtonEl.addEventListener("click", () => this.onExport());

        actionSection.append(runButtonEl);
        actionSection.append(exportButtonEl);

        body.append(document.createElement("br"));
        body.append(actionSection);
    }
}