import { gsap } from "gsap";

export const DIALOG_BOX_MINIMIZABLE = (1 << 0);
export const DIALOG_BOX_RESIZABLE = (1 << 1);
export const DIALOG_BOX_CLOSABLE = (1 << 2);
export const DIALOG_BOX_HIDE_BUTTONS = (1 << 3);
export const DIALOG_BOX_MODAL = (1 << 4);

export abstract class DialogBox {
    protected readonly title: String;
    protected readonly width: number;
    protected readonly properties: number;
    protected containerEl: HTMLElement;

    protected dialogEl: HTMLElement | null = null;
    protected resolve: ((id: string | null) => void) | null = null;

    public constructor(title: string, containerEl: HTMLElement | null = null, properties: number = DIALOG_BOX_CLOSABLE,
                       width: number = 350) {
        this.title = title;
        this.width = width;
        this.properties = properties;
        this.containerEl = containerEl ?? document.body;
    }

    protected abstract onMinimize(evt: MouseEvent): void;
    protected abstract onMaximize(evt: MouseEvent): void;

    protected onUserClose(_evt: MouseEvent): void {
        this.close(null);
    }

    protected abstract onRender(body: HTMLDivElement): void;

    protected createElement(): HTMLDivElement {
        let titleBar = document.createElement("div");
        titleBar.className = "title-bar";
        titleBar.innerHTML = `<div class="title-bar-text">${this.title}</div>`;

        let titleControls = document.createElement("div");

        let minBtn = document.createElement("button");
        minBtn.ariaLabel = "Minimize";

        let maxBtn = document.createElement("button");
        maxBtn.ariaLabel = "Maximize";

        let closeBtn = document.createElement("button");
        closeBtn.ariaLabel = "Close";

        if (this.properties & DIALOG_BOX_MINIMIZABLE) {
            console.log("h");
            minBtn.addEventListener("click", evt => this.onMinimize(evt));
            titleControls.append(minBtn);
        }

        if (this.properties & DIALOG_BOX_RESIZABLE) {
            maxBtn.addEventListener("click", evt => this.onMaximize(evt));
            titleControls.append(maxBtn);
        } else if (!(this.properties & DIALOG_BOX_HIDE_BUTTONS)) {
            titleControls.append(maxBtn);
            maxBtn.disabled = true;
        }

        if (this.properties & DIALOG_BOX_CLOSABLE) {
            closeBtn.addEventListener("click", evt => this.onUserClose(evt));
            titleControls.append(closeBtn);
        }

        if (titleControls.hasChildNodes()) {
            titleControls.className = "title-bar-controls";
            titleBar.append(titleControls);
        }

        let dialogBody = document.createElement("div");
        dialogBody.classList.add("window-body");
        dialogBody.classList.add("has-space");
        this.onRender(dialogBody);

        let dialog = document.createElement("div");
        dialog.classList.add("dialog");
        dialog.classList.add("window");
        dialog.classList.add("active");
        dialog.style.minWidth = `${this.width}px`;
        dialog.append(titleBar);
        dialog.append(dialogBody);

        return dialog;
    }

    public isDisplayed(): boolean {
        return this.dialogEl != null;
    }

    public close(resolution: any): void {
        if (!this.isDisplayed())
            throw new Error("Dialog has not been displayed yet");

        // @ts-ignore
        this.dialogEl.remove();

        // @ts-ignore
        this.resolve(resolution);
        this.containerEl.classList.remove("hasOpenDialog");
        this.containerEl.style.pointerEvents = "unset";

        // @ts-ignore
        if (this.containerEl.parentElement.classList.contains("window")) { // @ts-ignore
            this.containerEl.parentElement.classList.add("active");
        } else if (this.containerEl.classList.contains("window")) {
            this.containerEl.classList.add("active");
        }
    }

    public display(): Promise<any> {
        return new Promise((Ok, Err) => {
            if (this.isDisplayed())
                return Err("Dialog is already displayed");

            if (this.properties & DIALOG_BOX_MODAL) {
                if (this.containerEl.classList.contains("hasOpenDialog"))
                    return Err("Another modal dialog is already open within this context");

                this.containerEl.classList.add("hasOpenDialog");
                this.containerEl.style.pointerEvents = "none";

                // Special case if our parent element is window
                // @ts-ignore
                if (this.containerEl.parentElement.classList.contains("window")) { // @ts-ignore
                    this.containerEl.parentElement.classList.remove("active");
                } else if (this.containerEl.classList.contains("window")) {
                    this.containerEl.classList.remove("active");
                }
            }

            this.resolve = Ok;

            this.dialogEl = this.createElement();
            this.dialogEl.style.visibility = "hidden";
            document.body.append(this.dialogEl);

            let rect = this.containerEl.getBoundingClientRect();
            let ourRect = this.dialogEl.getBoundingClientRect();
            this.dialogEl.style.top = `${rect.top + (rect.height / 2) - (ourRect.height / 2)}px`;
            this.dialogEl.style.left = `${rect.left + (rect.width / 2) - (ourRect.width / 2)}px`;
            this.dialogEl.style.perspective = `${ourRect.height}px`;
            this.dialogEl.style.transform = "rotateX(-90deg)";
            this.dialogEl.style.visibility = "unset";

            gsap.to(this.dialogEl, {
                rotateX: 0,
                duration: 0.08
            });
        });
    }

    public setContainer(container: HTMLElement) {
        this.containerEl = container;
    }
}