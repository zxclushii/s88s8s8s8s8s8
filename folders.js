// @ts-check
// Папки: на главной — папки корня, на экране mp3 — плейлисты. Клик по папке — то же, что набрать cd в терминале.

const SVG_NS = "http://www.w3.org/2000/svg";
// Язычки по очереди слева, посередине и справа — как у настоящих папок, где язычки вырезаны со сдвигом.
const TAB_STARTS = [0, 38.5, 66];
const FRONT = "M0 21.5Q0 19 2.5 19H117.5Q120 19 120 21.5V89.5Q120 92 117.5 92H2.5Q0 92 0 89.5Z";
// восьмиконечная звезда, та же, что над i в img/lushii.svg; видна при наведении и у открытой папки
const STAR =
    "M13.9 40.6L15 52.5L16.1 40.6L19.5 42.5L17.6 39.1L25.5 38L17.6 36.9L19.5 33.5L16.1 35.4L15 23.5L13.9 35.4" +
    "L10.5 33.5L12.4 36.9L4.5 38L12.4 39.1L10.5 42.5L13.9 40.6Z";

/**
 * Задняя стенка папки с язычком, который начинается в tab (0 — язычок в левом углу).
 * @param {number} tab
 */
function backPath(tab) {
    const body = "H117.5Q120 9 120 11.5V89.5Q120 92 117.5 92H2.5Q0 92 0 89.5Z";
    if (tab === 0) {
        return `M0 2.5Q0 0 2.5 0H41Q43.5 0 45 2L50.5 9${body}`;
    }
    return (
        `M0 11.5Q0 9 2.5 9H${tab}L${tab + 5.5} 2Q${tab + 7} 0 ${tab + 9.5} 0` +
        `H${tab + 42}Q${tab + 44.5} 0 ${tab + 46} 2L${tab + 51.5} 9${body}`
    );
}

/** @param {number} tab */
function folderIcon(tab) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 120 92");
    svg.setAttribute("aria-hidden", "true");
    for (const [part, d] of [
        ["folder-back", backPath(tab)],
        ["folder-front", FRONT],
        ["folder-star", STAR],
    ]) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", part);
        path.setAttribute("d", d);
        svg.append(path);
    }
    return svg;
}

/**
 * @typedef {object} FolderItem
 * @property {string} name подпись на папке
 * @property {string} [label] что прочитает скринридер, если подпись ему ничего не скажет (как «..»)
 */

/**
 * Ставит папки в список, заменяя то, что там было.
 * @template {FolderItem} T
 * @param {HTMLElement} list <ul>, куда встают папки
 * @param {T[]} folders
 * @param {(folder: T) => void} onOpen
 * @returns {{ setCurrent: (name: string | null) => void }} setCurrent подсвечивает открытую папку
 */
export function renderFolders(list, folders, onOpen) {
    /** @type {Map<string, HTMLButtonElement>} */
    const buttons = new Map();
    list.replaceChildren(
        ...folders.map((folder, index) => {
            const name = document.createElement("span");
            name.className = "folder-name";
            name.textContent = folder.name;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "folder";
            if (folder.label) {
                button.setAttribute("aria-label", folder.label);
            }
            button.append(folderIcon(TAB_STARTS[index % TAB_STARTS.length]), name);
            button.addEventListener("click", () => onOpen(folder));
            buttons.set(folder.name, button);

            const item = document.createElement("li");
            item.append(button);
            return item;
        }),
    );
    return {
        setCurrent(name) {
            for (const [folderName, button] of buttons) {
                if (folderName === name) {
                    button.setAttribute("aria-current", "true");
                } else {
                    button.removeAttribute("aria-current");
                }
            }
        },
    };
}
