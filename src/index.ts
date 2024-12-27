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
    let endpointTexture = await loader.loadAsync("./ico/256/endpoint.png");
    endpointTexture.colorSpace = "srgb";

    let routerTexture = await loader.loadAsync("./ico/256/switch.png");
    routerTexture.colorSpace = "srgb";

    textures.endpoint = new THREE.MeshBasicMaterial({ map: endpointTexture, transparent: true });
    textures.router = new THREE.MeshBasicMaterial({ map: routerTexture, transparent: true });
    textures.font = await fontLoader.loadAsync("./font.json");
} catch (e) {
    console.log(e);
}

let defineSound = (url: string) => new Howl({
    src: url,
    html5: true,
    volume: 0.3
});

let sounds = {
    connCreate: defineSound("./sounds/conn_create.wav"),
    connRemove: defineSound("./sounds/conn_remove.wav"),
    objTaken: defineSound("./sounds/obj_taken.wav"),
    objRemove: defineSound("./sounds/obj_removed.wav"),
    objReleased: defineSound("./sounds/obj_released.wav"),
    longOperationCplt: defineSound("./sounds/chimes.wav"),
};

const topology = new TopologyModel();

const view = new ThreeView(topology, textures, sounds);
await view.init();

document.body.append(view.canvas);