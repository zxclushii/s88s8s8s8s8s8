// @ts-check
// Команды терминала: на входе строка, на выходе строки ответа и, может быть, переход в другую папку.
// Ответы на ошибки — дословно как в русском cmd.

import { folderAt, formatPath, resolve } from "./paths.js";

/** @typedef {import("./paths.js").Folder} Folder */
/** @typedef {import("./paths.js").Path} Path */

/**
 * След за курсором: звёздочки или сердечки.
 * @typedef {"star" | "heart"} Trail
 */
/** @typedef {Record<Trail, boolean>} Trails какие следы сейчас включены */

/**
 * @typedef {object} Result
 * @property {string[]} lines что напечатать под командой
 * @property {Path} [cd] куда перейти
 * @property {boolean} [clear] очистить экран
 * @property {{ trail: Trail, on: boolean }} [trail] включить или выключить след за курсором
 */

export const MESSAGES = {
    notFound: "Системе не удается найти указанный путь.",
    denied: "Отказано в доступе.",
    noFiles: "Файл не найден",
    notLoaded: "Список треков не загружен.",
    calm: "В системе включено уменьшение движения — ничего сыпаться не будет.",
    /** @param {string} name */
    trailUsage: (name) => `Пиши ${name} on или ${name} off.`,
    /** @param {string} name */
    unknown: (name) =>
        `"${name}" не является внутренней или внешней командой, исполняемой программой или пакетным файлом.`,
};

export const HELP = [
    "cd             перейти в папку: cd mp3, cd .., cd \\",
    "dir            что лежит в папке (ls тоже работает)",
    "cls            очистить экран (clear тоже)",
    "star_cursive   звёздочки за курсором: on или off",
    "heart_cursive  сердечки за курсором: on или off",
    "help           эта справка",
];

/** @type {Record<"star_cursive" | "heart_cursive", Trail>} */
const TRAIL_COMMANDS = { star_cursive: "star", heart_cursive: "heart" };
const TRAIL_NAMES = { star: "Звёздочки", heart: "Сердечки" };

// отступы как у dir в cmd: имена папок и файлов начинаются с одной колонки
const DIR_MARK = "  <DIR>  ";
const FILE_MARK = " ".repeat(DIR_MARK.length);

/**
 * @param {string} line что набрали
 * @param {{ root: Folder, cwd: Path, trails?: Trails, calm?: boolean }} where trails — какие следы за курсором
 *     уже включены; calm — в системе просят меньше движения
 * @returns {Result}
 */
export function run(line, { root, cwd, trails = { star: false, heart: false }, calm = false }) {
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
        case "star_cursive":
        case "heart_cursive":
            return switchTrail(/** @type {"star_cursive" | "heart_cursive"} */ (name.toLowerCase()), arg, trails, calm);
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
        return { lines: [failure(target.error, MESSAGES.notFound)] };
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
            return { lines: [failure(target.error, MESSAGES.noFiles)] };
        }
        folder = target.folder;
    }
    if (!folder) {
        // cwd приходит от терминала и всегда существует; сюда попадаем только из-за ошибки в коде
        throw new Error(`dir: нет папки ${formatPath(root, cwd)}`);
    }

    // папки внутри ещё не пришли с GitHub (или не пришли совсем)
    if (folder.folders === null) {
        return { lines: [MESSAGES.notLoaded] };
    }
    const files = folder.files ? folder.files() : [];
    const lines = [
        ...(folder.folders ?? []).map((child) => DIR_MARK + child.name),
        ...files.map((file) => FILE_MARK + file),
    ];
    return { lines: lines.length > 0 ? lines : [MESSAGES.noFiles] };
}

/**
 * star_cursive on / off — включить или выключить след. Без аргумента — сказать, включён ли он, как echo в cmd.
 * @param {"star_cursive" | "heart_cursive"} command
 * @param {string} arg
 * @param {Trails} trails
 * @param {boolean} calm
 * @returns {Result}
 */
function switchTrail(command, arg, trails, calm) {
    const trail = TRAIL_COMMANDS[command];
    const word = arg.toLowerCase();
    if (word === "") {
        return { lines: [`${TRAIL_NAMES[trail]} за курсором ${trails[trail] ? "включены" : "выключены"}.`] };
    }
    if (word !== "on" && word !== "off") {
        return { lines: [MESSAGES.trailUsage(command)] };
    }
    const on = word === "on";
    if (on && calm) {
        return { lines: [MESSAGES.calm] };
    }
    return { lines: [`${TRAIL_NAMES[trail]} за курсором ${on ? "включены" : "выключены"}.`], trail: { trail, on } };
}

/**
 * Ответ на путь, который не разобрался.
 * @param {"not-found" | "locked" | "pending"} error
 * @param {string} notFound у cd и dir свои слова для «нет такого»
 */
function failure(error, notFound) {
    if (error === "locked") {
        return MESSAGES.denied;
    }
    return error === "pending" ? MESSAGES.notLoaded : notFound;
}
