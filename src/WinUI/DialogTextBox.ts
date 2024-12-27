import { DialogBox, DIALOG_BOX_CLOSABLE } from "./DialogBox.ts";

export class DialogTextBox extends DialogBox {
    private readonly text: string;

    public constructor(title: string, text: string, containerEl: HTMLElement, properties: number = DIALOG_BOX_CLOSABLE,
                       width: number = 350) {
        super(title, containerEl, properties, width);
        this.text = text;
    }

    protected onMaximize(_evt: MouseEvent): void {}
    protected onMinimize(_evt: MouseEvent): void {}

    protected onRender(body: HTMLDivElement): void {
        body.innerHTML = this.text;

        let actionSection = document.createElement("section");
        actionSection.classList.add("field-row");
        actionSection.style.justifyContent = "flex-end";

        let okButtonEl = document.createElement("button");
        okButtonEl.className = "default";
        okButtonEl.textContent = "OK";

        okButtonEl.addEventListener("click", () => this.close(null));

        actionSection.append(okButtonEl);
        body.append(actionSection);
    }
}