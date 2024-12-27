import { defineConfig } from '@rsbuild/core';

export default defineConfig({
    html: {
        template: "./src/main.html"
    },
    output: {
        assetPrefix: "./"
    }
});
