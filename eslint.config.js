import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
    {
        files: ["**/*.js"],
        plugins: { js },
        extends: ["js/recommended"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: globals.browser,
        },
    },
    {
        // тесты и сам конфиг запускает Node, а не браузер
        files: ["tests/**/*.js", "eslint.config.js"],
        languageOptions: { globals: globals.node },
    },
]);
