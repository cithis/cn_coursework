import './styles.css';
import '7.css/dist/7.css';
import { ThreeView, ThreeViewTextures } from "./ThreeView.ts";
import { TopologyModel } from "./Model/TopologyModel.ts";
import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";

// @ts-ignore
import { Howl } from "howler";

let textures = {} as ThreeViewTextures;
let loader = new THREE.TextureLoader();
let fontLoader = new FontLoader();

try {
    let endpointTexture = await loader.loadAsync("/ico/256/endpoint.png");
    endpointTexture.colorSpace = "srgb";

    let routerTexture = await loader.loadAsync("/ico/256/switch.png");
    routerTexture.colorSpace = "srgb";

    textures.endpoint = new THREE.MeshBasicMaterial({ map: endpointTexture, transparent: true });
    textures.router = new THREE.MeshBasicMaterial({ map: routerTexture, transparent: true });
    textures.font = await fontLoader.loadAsync("/font.json");
} catch (e) {
    console.log(e);
}

let connCreateSound = new Howl({
    src: ["/sounds/conn_create.wav"],
    html5: true
});

let connRemoveSound = new Howl({
    src: ["/sounds/conn_remove.wav"],
    html5: true
});

let sounds = {
    connCreate: connCreateSound,
    connRemove: connRemoveSound
}

connCreateSound.on("load", () => {
    connRemoveSound.on("load", async () => {
        const topology = new TopologyModel();

        const view = new ThreeView(topology, textures, sounds);
        await view.init();

        document.body.append(view.canvas);
    });
});