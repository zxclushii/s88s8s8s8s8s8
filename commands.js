// @ts-check
// Команды терминала: на входе строка, на выходе строки ответа и, может быть, переход в другую папку.
// Ответы на ошибки — дословно как в русском cmd.

import { folderAt, formatPath, resolve } from "./paths.js";

/** @typedef {import("./paths.js").Folder} Folder */
/** @typedef {import("./paths.js").Path} Path */

/**
 * @typedef {object} Result
 * @property {string[]} lines что напечатать под командой
 * @property {Path} [cd] куда перейти
 * @property {boolean} [clear] очистить экран
 */

export const MESSAGES = {
    notFound: "Системе не удается найти указанный путь.",
    denied: "Отказано в доступе.",
    noFiles: "Файл не найден",
    notLoaded: "Список треков ещё не загружен.",
    /** @param {string} name */
    unknown: (name) =>
        `"${name}" не является внутренней или внешней командой, исполняемой программой или пакетным файлом.`,
};

export const HELP = [
    "cd      перейти в папку: cd mp3, cd .., cd \\",
    "dir     что лежит в папке (ls тоже работает)",
    "cls     очистить экран (clear тоже)",
    "help    эта справка",
];

// отступы как у dir в cmd: имена папок и файлов начинаются с одной колонки
const DIR_MARK = "  <DIR>  ";
const FILE_MARK = " ".repeat(DIR_MARK.length);

/**
 * @param {string} line что набрали
 * @param {{ root: Folder, cwd: Path }} where
 * @returns {Result}
 */
export function run(line, { root, cwd }) {
    const text = line.trim();
    if (text === "") {
        return { lines: [] };
    }
    let name = text.split(/\s+/, 1)[0];
    let arg = text.slice(name.length).trim();
    // cmd понимает cd.. и cd\ без пробела — так набирают по привычке
    const glued = /^(cd|chdir)([\\/.].*)$/i.exec(name);
    if (glued) {
        name = glued[1];
        arg = `${glued[2]} ${arg}`.trim();
    }

    switch (name.toLowerCase()) {
        case "cd":
        case "chdir":
            return changeDir(root, cwd, arg);
        case "dir":
        case "ls":
            return listDir(root, cwd, arg);
        case "cls":
        case "clear":
            return { lines: [], clear: true };
        case "help":
            return { lines: [...HELP] };
        default:
            return { lines: [MESSAGES.unknown(name)] };
    }
}

/**
 * @param {Folder} root
 * @param {Path} cwd
 * @param {string} arg
 * @returns {Result}
 */
function changeDir(root, cwd, arg) {
    // cd без аргумента в cmd печатает, где ты сейчас
    if (arg === "") {
        return { lines: [formatPath(root, cwd)] };
    }
    const target = resolve(root, cwd, arg);
    if (!target.ok) {
        return { lines: [target.error === "locked" ? MESSAGES.denied : MESSAGES.notFound] };
    }
    return { lines: [], cd: target.path };
}

/**
 * @param {Folder} root
 * @param {Path} cwd
 * @param {string} arg
 * @returns {Result}
 */
function listDir(root, cwd, arg) {
    // ls -la по привычке: ключи не нужны, список и так один
    const where = arg
        .split(/\s+/)
        .filter((word) => word !== "" && !word.startsWith("-"))
        .join(" ");
    let folder = folderAt(root, cwd);
    if (where !== "") {
        const target = resolve(root, cwd, where);
        if (!target.ok) {
            return { lines: [target.error === "locked" ? MESSAGES.denied : MESSAGES.noFiles] };
        }
        folder = target.folder;
    }
    if (!folder) {
        // cwd приходит от терминала и всегда существует; сюда попадаем только из-за ошибки в коде
        throw new Error(`dir: нет папки ${formatPath(root, cwd)}`);
    }

    const files = folder.files ? folder.files() : [];
    if (files === null) {
        return { lines: [MESSAGES.notLoaded] };
    }
    const lines = [
        ...(folder.folders ?? []).map((child) => DIR_MARK + child.name),
        ...files.map((file) => FILE_MARK + file),
    ];
    return { lines: lines.length > 0 ? lines : [MESSAGES.noFiles] };
}
