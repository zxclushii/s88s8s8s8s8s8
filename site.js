// @ts-check
// Сайт — диск SS:\angel. Главная: надпись, мем, папки, внизу терминал. Папка mp3 — плеер, в ней папки-плейлисты;
// папка work — лента с лабой.
// Где мы — в адресе страницы (#mp3/liked), поэтому работает «назад» и ссылку прямо на плейлист можно кинуть.

import { byId } from "./dom.js";
import { renderFolders } from "./folders.js";
import { hashFor, pathFromHash, relativePath, samePath } from "./paths.js";
import { mountPlayer } from "./player.js";
import { createTerminal } from "./terminal.js";
import { createTrails } from "./trails.js";
import { mountWork } from "./work.js";

/** @typedef {import("./paths.js").Path} Path */
/** @typedef {import("./paths.js").Folder} Folder */

const screens = { home: byId("home", HTMLElement), mp3: byId("mp3", HTMLElement), work: byId("work", HTMLElement) };

// плейлисты — подпапки mp3 — приходят с GitHub; до этого их список неизвестен
/** @type {Folder} */
const mp3 = { name: "mp3", folders: null };
/** @type {Folder} */
const root = {
    name: "angel",
    folders: [
        mp3,
        // лента с лабой: внутри папок нет, экран один
        { name: "work" },
    ],
};
// первая папка на экране mp3 — наверх, как в проводнике
const UP = { name: "..", label: "наверх" };

/** @type {Path} */
let current = [];

const terminal = createTerminal({ root, onCd: go, trails: createTrails() });

/**
 * Клик по папке печатает в терминал cd — тот же, что набрал бы человек, — и терминал ведёт дальше.
 * @param {Path} target
 */
function openFolder(target) {
    terminal.execute(`cd ${relativePath(current, target)}`);
}

renderFolders(byId("folders", HTMLElement), root.folders ?? [], (folder) => openFolder([folder.name]));

const playlistList = byId("mp3-folders", HTMLElement);
let playlistFolders = renderFolders(playlistList, [UP], () => terminal.execute("cd .."));
renderFolders(byId("work-folders", HTMLElement), [UP], () => terminal.execute("cd .."));
mountWork();

const player = mountPlayer({
    onPlaylists(playlists) {
        mp3.folders = playlists.map((playlist) => ({
            name: playlist.name,
            files: () => playlist.tracks.map((track) => track.file),
        }));
        playlistFolders = renderFolders(playlistList, [UP, ...mp3.folders], (folder) =>
            folder === UP ? terminal.execute("cd ..") : openFolder(["mp3", folder.name]),
        );
        // в адресе мог ждать плейлист, которого до загрузки ещё не было
        showFromAddress();
    },
});

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
    const screen = path[0] === "mp3" || path[0] === "work" ? path[0] : "home";
    document.body.dataset.screen = screen;
    // спрятанный экран не должен держать фокус: кнопка осталась бы невидимой, но нажимаемой с клавиатуры
    for (const [name, element] of Object.entries(screens)) {
        const focused = document.activeElement;
        if (name !== screen && focused instanceof HTMLElement && element.contains(focused)) {
            focused.blur();
        }
    }
    if (screen === "mp3") {
        playlistFolders.setCurrent(player.show(path[1] ?? null));
    }
    terminal.setCwd(path);
}

/** Экран по адресу: при загрузке, после «назад» и «вперёд», после ручной правки адреса. */
function showFromAddress() {
    const target = pathFromHash(root, location.hash);
    if (target.ok || target.error === "pending") {
        // pending — плейлисты ещё грузятся: показываем mp3, а адрес не трогаем, onPlaylists перечитает его
        show(target.path);
        return;
    }
    // в адресе несуществующая или закрытая папка — встаём на ближайшую настоящую и чиним адрес
    history.replaceState(null, "", hashFor(target.path) || location.pathname + location.search);
    show(target.path);
}

window.addEventListener("popstate", showFromAddress);
// popstate при правке адреса приходит не везде, hashchange — везде; повторный show ничего не ломает
window.addEventListener("hashchange", showFromAddress);
showFromAddress();
