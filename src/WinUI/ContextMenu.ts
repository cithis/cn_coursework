export type ContextMenuItem = {
    id: string | null;
    sprite: string | null;
    label: string;
    enabled: boolean;
    nested: ContextMenuItemList | null;
}

export type ContextMenuItemList = Array<Array<ContextMenuItem>>;

export class ContextMenu {
    private readonly items: ContextMenuItemList;
    private readonly containerEl: Element | Node;

    public constructor(items: ContextMenuItemList, containerEl: Element | Node | null = null) {
        this.items = items;

        containerEl ??= document.getRootNode();
        this.containerEl = containerEl;
    }

    private createMenuElement(items: ContextMenuItemList, resolver: (id: string | null) => void,
                              onClose: ((_: any) => void) | null = null): HTMLUListElement {
        let htmlElement = document.createElement("ul");
        htmlElement.role = "menu";
        htmlElement.className = "can-hover";
        htmlElement.style.width = "200px";

        // Close menu if user clicks outside of it
        onClose ??= (_: any) => {
            // @ts-ignore
            this.containerEl.removeEventListener("click", onClose);
            htmlElement.remove();
            resolver(null);
        };

        this.containerEl.addEventListener("click", onClose);

        // @ts-ignore
        this.containerEl.__closer = onClose;

        // Don't close if user clicks inside of it tho xdd
        htmlElement.addEventListener("click", e => e.stopPropagation());

        items.forEach((itemGroup, i, list) => {
            itemGroup.forEach((item, j, list2) => {
                let htmlItemElement = document.createElement("li");
                htmlItemElement.role = "menuitem";
                htmlItemElement.tabIndex = 0;

                if (item.label)
                    htmlItemElement.innerHTML = item.nested ? item.label : `<a href="javascript:void(0);">${item.label}</a>`;

                if (item.sprite)
                    htmlItemElement.innerHTML = `<img src="${item.sprite}"  alt="xd"/>` + htmlItemElement.innerHTML;

                if (!item.enabled)
                    htmlItemElement.ariaDisabled = "true";

                if (item.id && item.enabled) {
                    htmlItemElement.dataset.aid = item.id;
                    htmlItemElement.addEventListener("click", () => {
                        resolver(item.id);
                        onClose(null);
                    });
                }

                if (item.nested && item.nested.length > 0) {
                    htmlItemElement.ariaHasPopup = "true";
                    htmlItemElement.append(this.createMenuElement(item.nested, resolver, onClose));
                }

                // If this is last item of a group that is not last, add a divisor
                if (!(i == (list.length - 1)) && j == (list2.length - 1))
                    htmlItemElement.classList.add("has-divider");

                htmlElement.append(htmlItemElement);
            });
        });

        return htmlElement;
    }

    /**
     * Display prompt and wait for user choice
     *
     * @param x X coordinate at which to display context menu
     * @param y Y coordinate at which to display context menu
     * @param correctCoords Fix coordinates so that menu will fit on screen
     * @param exclusive Close other context menus opened in the container element
     *
     * @returns id of option chosen by user, null if aborted (clicked away)
     */
    public prompt(x: number, y: number, correctCoords: boolean = true, exclusive: boolean = true): Promise<string | null> {
        return new Promise(r => {
            // @ts-ignore
            if (exclusive && typeof this.containerEl.__closer !== "undefined") {
                // @ts-ignore
                this.containerEl.__closer();
                // @ts-ignore
                this.containerEl.__closer = undefined;
            }

            let resolveWith = (id: string | null) => r(id);
            let element = this.createMenuElement(this.items, resolveWith);

            element.style.visibility = "hidden";
            document.body.append(element);

            if (correctCoords) {
                if ((window.innerHeight - y) <= element.getBoundingClientRect().height)
                    y -= element.getBoundingClientRect().height;

                if ((window.innerWidth - x) <= element.getBoundingClientRect().width)
                    x -= element.getBoundingClientRect().width;
            }

            element.style.position = "fixed";
            element.style.left = `${x}px`;
            element.style.top = `${y}px`;

            element.style.visibility = "unset";
        });
    }
}
