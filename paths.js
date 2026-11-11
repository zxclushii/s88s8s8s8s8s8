// @ts-check
// Папки сайта устроены как диск в cmd: корень — SS:\angel, в нём папки-экраны.
// Здесь только чистые функции: разобрать путь из команды или из адреса страницы и записать его обратно.

/**
 * @typedef {object} Folder
 * @property {string} name имя, как его набирают в cd; регистр при сравнении не важен
 * @property {boolean} [locked] папка видна, но не открывается: cmd отвечает «Отказано в доступе.»
 * @property {Folder[] | null} [folders] вложенные папки; null — их список ещё не пришёл (плейлисты грузятся с GitHub)
 * @property {() => string[]} [files] файлы для dir
 */

/**
 * Путь — имена папок от корня: [] — сам корень, ["mp3"] — SS:\angel\mp3.
 * @typedef {string[]} Path
 */

/**
 * Итог разбора пути. При ошибке path — самая глубокая папка, до которой удалось дойти:
 * туда и стоит вернуться, если в адресе страницы чужая папка.
 * @typedef {{ ok: true, path: Path, folder: Folder }
 *     | { ok: false, error: "not-found" | "locked" | "pending", path: Path }} Resolved
 */

export const DRIVE = "SS:";

/**
 * @param {Folder} root
 * @param {Path} path
 * @returns {Folder | null}
 */
export function folderAt(root, path) {
    /** @type {Folder | undefined} */
    let folder = root;
    for (const name of path) {
        folder = folder.folders?.find((child) => child.name === name);
        if (!folder) {
            return null;
        }
    }
    return folder;
}

/**
 * Разбирает аргумент cd или dir относительно текущей папки — так же, как cmd: \ и / разделяют папки,
 * .. — на уровень вверх (выше корня не поднимается), \ в начале или SS:\ — от корня, кавычки вокруг снимаются.
 * @param {Folder} root
 * @param {Path} cwd
 * @param {string} arg
 * @returns {Resolved}
 */
export function resolve(root, cwd, arg) {
    let rest = arg.trim();
    if (rest.length >= 2 && rest.startsWith('"') && rest.endsWith('"')) {
        rest = rest.slice(1, -1);
    }
    let absolute = false;
    if (rest.toLowerCase().startsWith(DRIVE.toLowerCase())) {
        rest = rest.slice(DRIVE.length);
        absolute = true;
    }
    if (rest.startsWith("\\") || rest.startsWith("/")) {
        absolute = true;
    }
    const parts = rest.split(/[\\/]+/).filter(Boolean);
    // корень сам называется angel: \angel\mp3 и \mp3 ведут в одно место
    if (absolute && parts[0]?.toLowerCase() === root.name.toLowerCase()) {
        parts.shift();
    }

    const path = absolute ? [] : [...cwd];
    for (const part of parts) {
        if (part === ".") {
            continue;
        }
        if (part === "..") {
            path.pop();
            continue;
        }
        const parent = folderAt(root, path);
        if (parent?.folders === null) {
            return { ok: false, error: "pending", path };
        }
        const wanted = part.toLowerCase();
        const child = parent?.folders?.find((folder) => folder.name.toLowerCase() === wanted);
        if (!child) {
            return { ok: false, error: "not-found", path };
        }
        if (child.locked) {
            return { ok: false, error: "locked", path };
        }
        path.push(child.name);
    }

    const folder = folderAt(root, path);
    // путь собран только из найденных папок, так что папка есть всегда; проверка — для типов
    if (!folder) {
        return { ok: false, error: "not-found", path: [] };
    }
    return { ok: true, path, folder };
}

/**
 * SS:\angel, SS:\angel\mp3 — как в приглашении cmd.
 * @param {Folder} root
 * @param {Path} path
 */
export function formatPath(root, path) {
    return [DRIVE, root.name, ...path].join("\\");
}

/**
 * Где мы — в адресе страницы: #mp3. У корня адреса нет.
 * @param {Path} path
 */
export function hashFor(path) {
    return path.length === 0 ? "" : `#${path.map(encodeURIComponent).join("/")}`;
}

/**
 * Обратный разбор адреса — тем же resolve, что и для cd от корня.
 * @param {Folder} root
 * @param {string} hash location.hash, с # или пустой
 * @returns {Resolved}
 */
export function pathFromHash(root, hash) {
    let decoded;
    try {
        decoded = decodeURIComponent(hash.replace(/^#/, ""));
    } catch {
        // битая %-последовательность в адресе — такой папки точно нет
        return { ok: false, error: "not-found", path: [] };
    }
    return resolve(root, [], `\\${decoded}`);
}

/**
 * @param {Path} a
 * @param {Path} b
 */
export function samePath(a, b) {
    return a.length === b.length && a.every((name, index) => name === b[index]);
}

/**
 * Как дойти из одной папки в другую командой cd: ["mp3", "night"] → ["mp3", "liked"] даёт ..\liked.
 * Так клик по папке печатается в терминал понятной командой, а не полным путём.
 * @param {Path} from
 * @param {Path} to
 */
export function relativePath(from, to) {
    let common = 0;
    while (common < from.length && common < to.length && from[common] === to[common]) {
        common += 1;
    }
    const parts = [...Array.from({ length: from.length - common }, () => ".."), ...to.slice(common)];
    return parts.length > 0 ? parts.join("\\") : ".";
}
