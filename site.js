// @ts-check
// Сайт — диск SS:\angel. Главная: надпись, мем, папки, внизу терминал. Папка mp3 — плеер, в ней папки-плейлисты;
// папка work — лента с лабой 9, а в ней папка elept1c curv3ss — программа к лабе 10.
// Где мы — в адресе страницы (#mp3/liked), поэтому работает «назад» и ссылку прямо на плейлист можно кинуть.

import { byId } from "./dom.js";
import { EC_FOLDER, mountEc } from "./ec-screen.js";
import { showExit } from "./exit.js";
import { renderFolders } from "./folders.js";
import { hashFor, pathFromHash, relativePath, samePath } from "./paths.js";
import { mountPlayer } from "./player.js";
import { createTerminal } from "./terminal.js";
import { createTrails } from "./trails.js";
import { mountWork } from "./work.js";

/** @typedef {import("./paths.js").Path} Path */
/** @typedef {import("./paths.js").Folder} Folder */

const screens = {
    home: byId("home", HTMLElement),
    mp3: byId("mp3", HTMLElement),
    work: byId("work", HTMLElement),
    ec: byId("ec", HTMLElement),
};

// плейлисты — подпапки mp3 — приходят с GitHub; до этого их список неизвестен
/** @type {Folder} */
const mp3 = { name: "mp3", folders: null };
/** @type {Folder} */
const ecFolder = { name: EC_FOLDER };
/** @type {Folder} */
const root = {
    name: "angel",
    folders: [
        mp3,
        // лента с лабой 9, а в ней папка с программой к лабе 10
        { name: "work", folders: [ecFolder] },
    ],
};
// первая папка на экране mp3 — наверх, как в проводнике
const UP = { name: "..", label: "наверх" };

/** @type {Path} */
let current = [];

const terminal = createTerminal({
    root,
    onCd: go,
    effects: {
        trails: createTrails(),
        light: {
            state: () => document.body.classList.contains("light-stars"),
            set: (on) => document.body.classList.toggle("light-stars", on),
        },
        exit: showExit,
        // плеер создаётся ниже; команды приходят, когда страница уже собрана
        music: (action) => player.command(action),
    },
});

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
renderFolders(byId("work-folders", HTMLElement), [UP, ecFolder], (folder) =>
    folder === UP ? terminal.execute("cd ..") : openFolder(["work", ecFolder.name]),
);
renderFolders(byId("ec-folders", HTMLElement), [UP], () => terminal.execute("cd .."));
mountWork();
const ec = mountEc();

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

/**
 * Какой экран у папки: mp3 и плейлисты — плеер, work — лента, work\elept1c curv3ss — программа, остальное — главная.
 * @param {Path} path
 * @returns {keyof typeof screens}
 */
function screenFor(path) {
    if (path[0] === "mp3") {
        return "mp3";
    }
    if (path[0] === "work") {
        return path[1] === ecFolder.name ? "ec" : "work";
    }
    return "home";
}

/** @param {Path} path */
function show(path) {
    current = path;
    const screen = screenFor(path);
    const opened = document.body.dataset.screen !== screen;
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
    // программу только что открыли — построение на её вкладке рисуется заново, на глазах
    if (screen === "ec" && opened) {
        ec.show();
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
