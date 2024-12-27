import {DIALOG_BOX_CLOSABLE, DIALOG_BOX_HIDE_BUTTONS, DIALOG_BOX_MODAL, DialogBox} from "./DialogBox.ts";
import {DialogTextBox} from "./DialogTextBox.ts";

export enum DialogFormBoxResultType {
    OK,
    CANCELLED
}

export type DialogFormBoxResult = {
    result: DialogFormBoxResultType,
    data: Record<string, object> | null
}

export class DialogFormBoxSchemaField {
    public label: string;
    public type: string;
    public attrs: Record<string, any>;

    constructor(label: string, type: string, attrs: Record<string, any> = {}) {
        this.label = label;
        this.type = type;
        this.attrs = attrs;
    }
}

export type DialogFormBoxSchema = Record<string, Record<string, DialogFormBoxSchemaField>>;
export type DialogFormBoxSchemaValidator = (path: string, value: string, replace: ((replacement: any) => void))
    => (string | null);

export class DialogFormBox extends DialogBox {
    protected schema: DialogFormBoxSchema;
    protected validator: DialogFormBoxSchemaValidator | null

    constructor(title: string, schema: DialogFormBoxSchema, validator: DialogFormBoxSchemaValidator | null = null,
                containerEl: HTMLElement | null = null, properties: number = DIALOG_BOX_CLOSABLE, width: number = 350) {
        super(title, containerEl, properties, width);
        this.validator = validator;
        this.schema = schema;
    }

    protected onMinimize(_evt: MouseEvent): void {}
    protected onMaximize(_evt: MouseEvent): void {}

    protected onUserClose(_evt: MouseEvent): void {
        this.close({
            result: DialogFormBoxResultType.CANCELLED,
            data: null
        });
    }

    protected async onFormSubmit(evt: SubmitEvent): Promise<void> {
        evt.preventDefault();
        evt.stopPropagation();

        // User triggered form submission by pressing enter or pressing tab lol, don't handle this
        if (evt.isTrusted)
            return;

        let bag: Record<string, any> = {};
        let data = new FormData(evt.target as HTMLFormElement);
        let errors = [];
        for (let pair of data.entries()) {
            let value = pair[1];

            let error = null;
            if (this.validator)
                error = this.validator(pair[0], (value as string), v => value = v);

            if (error)
                errors.push(error);

            bag[pair[0]] = value;
        }

        if (errors.length) {
            let message = `<b>Please, correct the following errors:</b><br/>${errors.join("<br/>")}`;
            // @ts-ignore
            let errorDialog = new DialogTextBox("Error", message, this.dialogEl?.querySelector(".window-body"),
                DIALOG_BOX_HIDE_BUTTONS | DIALOG_BOX_CLOSABLE | DIALOG_BOX_MODAL, 500);
            await errorDialog.display();

            return;
        }

        this.close({
            result: DialogFormBoxResultType.OK,
            data: bag
        } as DialogFormBoxResult);
    }

    protected async onConfirm(dialogBody: HTMLDivElement): Promise<void> {
        // @ts-ignore
        dialogBody.querySelector("form").dispatchEvent(new SubmitEvent("submit"));
    }

    protected createRadioGroupElement(fieldId: string, tabMeta: DialogFormBoxSchemaField): HTMLDivElement {
        let container = document.createElement("div");
        for (let optionId in tabMeta.attrs.options) {
            let option = document.createElement("input");
            option.id = "opt_" + optionId;
            option.type = "radio";
            option.name = fieldId;
            option.value = optionId;

            if (tabMeta.attrs.options[optionId][1])
                option.checked = true;

            let label = document.createElement("label");
            label.setAttribute("for", option.id);
            label.textContent = tabMeta.attrs.options[optionId][0];

            container.append(option);
            container.append(label);
            container.append(document.createElement("br"));
        }

        if (container.lastChild)
            container.lastChild.remove(); // Remove last <br/>

        return container;
    }

    protected createSelectElement(fieldId: string, tabMeta: DialogFormBoxSchemaField): HTMLSelectElement {
        let select = document.createElement("select");
        select.style.width = "100%";
        select.disabled = tabMeta.attrs.disabled ?? false;
        select.name = fieldId;

        for (let optionId in tabMeta.attrs.options) {
            let option = document.createElement("option");
            option.value = optionId;
            option.textContent = tabMeta.attrs.options[optionId][0];

            if (tabMeta.attrs.options[optionId][1])
                option.selected = true;

            select.append(option);
        }

        return select;
    }

    protected createInputElement(fieldId: string, tabMeta: DialogFormBoxSchemaField) {
        let inputEl;
        switch (tabMeta.type) {
            case "select":
                inputEl = this[(tabMeta.attrs.asRadioGroup ?? false) ? "createRadioGroupElement" : "createSelectElement"](fieldId, tabMeta);
                break
            default:
                inputEl = document.createElement("input");
                inputEl.id = fieldId;
                inputEl.name = fieldId;
                inputEl.type = tabMeta.type;
                inputEl.autocomplete = "off";
                inputEl.dataset.dialogManaged = "yes";
                for (let attr in tabMeta.attrs) {
                    if (typeof tabMeta.attrs[attr] !== "undefined" && tabMeta.attrs[attr] !== null) // @ts-ignore
                        inputEl[attr] = tabMeta.attrs[attr];
                }

                if (tabMeta.type != "checkbox")
                    inputEl.style.width = "100%";
        }

        return inputEl;
    }

    protected onRender(body: HTMLDivElement): void {
        let tabs: Record<string, HTMLElement> = {};
        for (let tab in this.schema) {
            let formTable = document.createElement("table");
            formTable.style.tableLayout = "fixed";
            formTable.style.width = (this.width * 0.8) + "px";

            for (let fieldId in this.schema[tab]) {
                let tabMeta = this.schema[tab][fieldId];
                let labelCell = document.createElement("td");
                labelCell.innerHTML = `<label for="${fieldId}">${tabMeta.label}:</label>`;
                labelCell.vAlign = "top";

                let inputEl = this.createInputElement(fieldId, tabMeta);
                let inputCell = document.createElement("td");
                inputCell.append(inputEl);
                inputCell.colSpan = 2;

                let fieldRow = document.createElement("tr");

                if (tabMeta.type == "checkbox") {
                    inputCell.innerHTML += `<label for="${fieldId}">${tabMeta.label}</label>`;
                    fieldRow.append(document.createElement("td"));
                    fieldRow.append(inputCell);
                } else {
                    fieldRow.append(labelCell);
                    fieldRow.append(inputCell);
                }

                formTable.append(fieldRow);
            }

            let tabEl = document.createElement("article");
            tabEl.hidden = true;
            tabEl.role = "tabpanel";
            tabEl.id = "tab_" + tab;
            tabEl.append(formTable);

            tabs[tab] = tabEl;
        }

        let form = document.createElement("form");
        form.addEventListener("submit", evt => this.onFormSubmit(evt));

        let menuEl = document.createElement("menu");
        menuEl.role = "tablist";

        for (let tab in tabs) {
            let tabBtnEl = document.createElement("button");
            tabBtnEl.role = "tab";
            tabBtnEl.textContent = tab.replace(/_/g, " ");
            tabBtnEl.setAttribute("aria-controls", "tab_" + tab);

            tabBtnEl.addEventListener("click", () => {
                body.querySelectorAll("article[role=tabpanel]").forEach(tabEl => {
                    // @ts-ignore
                    tabEl.hidden = tabEl.id !== ("tab_" + tab);
                });

                body.querySelectorAll("button[role=tab]").forEach(el => {
                    el.ariaSelected = String(el.getAttribute("aria-controls") === ("tab_" + tab));
                });
            });

            menuEl.append(tabBtnEl);
        }

        form.append(menuEl);

        // Must be done affter menu init
        tabs[Object.keys(tabs)[0]].hidden = false;
        for (let tab in tabs)
            form.append(tabs[tab]);

        let actionSection = document.createElement("section");
        actionSection.classList.add("field-row");
        actionSection.style.justifyContent = "flex-end";

        let okButtonEl = document.createElement("button");
        okButtonEl.className = "default";
        okButtonEl.textContent = "OK";

        okButtonEl.addEventListener("click", () => this.onConfirm(body));

        actionSection.append(okButtonEl);

        body.append(form);
        body.append(actionSection);

        // @ts-ignore
        menuEl.querySelector("button").ariaSelected = "true";
    }

    public setValidator(validator: DialogFormBoxSchemaValidator): void {
        this.validator = validator;
    }

    public display(): Promise<DialogFormBoxResult> {
        return super.display();
    }
}