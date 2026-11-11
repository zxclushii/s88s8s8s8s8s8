// @ts-check
// Сайт — диск SS:\angel. Главная: надпись, мем, папки, внизу терминал. Папка mp3 — экран плеера.
// Где мы — в адресе страницы (#mp3), поэтому работает «назад» и ссылку прямо на mp3 можно кинуть.

import { byId } from "./dom.js";
import { renderFolders } from "./folders.js";
import { hashFor, pathFromHash, samePath } from "./paths.js";
import { mountPlayer } from "./player.js";
import { createTerminal } from "./terminal.js";

/** @typedef {import("./paths.js").Path} Path */

const home = byId("home", HTMLElement);
const player = mountPlayer(byId("player-frame", HTMLElement));

/** @type {import("./paths.js").Folder} */
const root = {
    name: "angel",
    folders: [
        { name: "mp3", files: () => player.files() },
        // работы ещё нет: папка стоит на месте, но открыть её нельзя
        { name: "work", locked: true },
    ],
};

const terminal = createTerminal({ root, onCd: go });
renderFolders(byId("folders", HTMLElement), root.folders ?? [], (folder) => terminal.execute(`cd ${folder.name}`));

/** @type {Path} */
let current = [];

/**
 * Переход по команде или клику: новая запись в истории браузера, потом экран.
 * @param {Path} path
 */
function go(path) {
    if (samePath(path, current)) {
        return;
    }
    history.pushState(null, "", hashFor(path) || location.pathname + location.search);
    show(path);
}

/** @param {Path} path */
function show(path) {
    current = path;
    const screen = path[0] ?? "home";
    document.body.dataset.screen = screen;
    // главная прячется, а кнопка-папка, на которой стоял фокус, осталась бы невидимой с фокусом
    if (screen !== "home" && document.activeElement instanceof HTMLElement && home.contains(document.activeElement)) {
        document.activeElement.blur();
    }
    player.setOpen(screen === "mp3");
    terminal.setCwd(path);
}

/** Экран по адресу: при загрузке, после «назад» и «вперёд», после ручной правки адреса. */
function showFromAddress() {
    const path = pathFromHash(root, location.hash);
    if (path === null) {
        // в адресе несуществующая или закрытая папка — остаёмся на главной и чистим адрес
        history.replaceState(null, "", location.pathname + location.search);
        show([]);
        return;
    }
    show(path);
}

window.addEventListener("popstate", showFromAddress);
// popstate при правке адреса приходит не везде, hashchange — везде; повторный show ничего не ломает
window.addEventListener("hashchange", showFromAddress);
showFromAddress();
