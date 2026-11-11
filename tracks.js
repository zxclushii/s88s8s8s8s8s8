// @ts-check
// Треки лежат в tracks/ этого репозитория, каждая подпапка — плейлист: tracks/liked/, tracks/night/…
// Имя файла — «Артист - Название.mp3», обложка рядом — «Артист - Название.jpg».
// Всё дерево репозитория приходит одним запросом к GitHub API: без токена GitHub даёт 60 запросов в час на IP.

const OWNER = "zxclushii";
const REPO = "s88s8s8s8s8s8";

export const TRACKS_DIR = "tracks";
// HEAD — ветка по умолчанию, как у contents API без ?ref: оттуда же сайт отдаёт GitHub Pages
export const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/HEAD?recursive=1`;
const API_TIMEOUT_MS = 10_000;
// этот плейлист открывается сам и стоит первым
export const DEFAULT_PLAYLIST = "liked";

/**
 * @typedef {object} Track
 * @property {string} title
 * @property {string} artist
 * @property {string} file имя файла как есть — его показывает dir в терминале
 * @property {string} src
 * @property {string | null} cover
 */

/** @typedef {{ name: string, tracks: Track[] }} Playlist */
/** @typedef {{ path: string, type: string }} TreeEntry */

/** Ошибка, которую показываем прямо в плеере: заголовок и строка пояснения. */
export class PlayerError extends Error {
    /**
     * @param {string} headline
     * @param {string} detail
     * @param {ErrorOptions} [options]
     */
    constructor(headline, detail, options) {
        super(`${headline}: ${detail}`, options);
        this.name = "PlayerError";
        this.headline = headline;
        this.detail = detail;
    }
}

/** @returns {Promise<TreeEntry[]>} */
async function fetchTree() {
    let response;
    try {
        response = await fetch(API_URL, {
            headers: { Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });
    } catch (err) {
        throw new PlayerError("Нет связи", "GitHub молчит", { cause: err });
    }

    if (!response.ok) {
        // лимит кончился — 403 или 429 и remaining = 0
        const limitHit =
            (response.status === 403 || response.status === 429) &&
            response.headers.get("x-ratelimit-remaining") === "0";
        if (limitHit) {
            const resetMs = Number(response.headers.get("x-ratelimit-reset")) * 1000;
            const until =
                resetMs > 0
                    ? new Date(resetMs).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                    : null;
            throw new PlayerError("Лимит API", until ? `жди до ${until}` : "жди час");
        }
        throw new PlayerError(`Ошибка ${response.status}`, "GitHub API");
    }

    let body;
    try {
        body = await response.json();
    } catch (err) {
        throw new PlayerError("Ошибка", "битый ответ API", { cause: err });
    }
    if (!body || !Array.isArray(body.tree)) {
        throw new PlayerError("Ошибка", "битый ответ API");
    }
    // больше 100 000 файлов или 7 МБ — GitHub отдаёт не всё дерево; с треками до такого не дойдёт
    if (body.truncated) {
        throw new PlayerError("Ошибка", "GitHub отдал не всё дерево");
    }
    return body.tree;
}

/**
 * Относительная ссылка на файл: в именах пробелы, кириллица, бывают # и ?.
 * @param {string} folder
 * @param {string} file
 */
function trackUrl(folder, file) {
    return `${TRACKS_DIR}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
}

/**
 * Режем по первому " - ": "ClariS - Connect - TV size" → "ClariS" и "Connect - TV size".
 * @param {string} baseName
 */
export function splitTrackName(baseName) {
    const separator = baseName.indexOf(" - ");
    if (separator === -1) {
        return { artist: "", title: baseName.trim() };
    }
    return {
        artist: baseName.slice(0, separator).trim(),
        title: baseName.slice(separator + " - ".length).trim(),
    };
}

/**
 * Плейлисты из дерева репозитория: подпапки tracks/ первого уровня. Файлы прямо в tracks/ и папки глубже
 * в плейлисты не попадают. Треки — в порядке имён файлов, liked — первым, остальные — по алфавиту.
 * @param {unknown[]} entries tree из ответа GitHub
 * @returns {Playlist[]}
 */
export function buildPlaylists(entries) {
    const prefix = `${TRACKS_DIR}/`;
    /** @type {Map<string, string[]>} файлы по папкам */
    const folders = new Map();
    for (const entry of entries) {
        if (!isTreeEntry(entry) || !entry.path.startsWith(prefix)) {
            continue;
        }
        const parts = entry.path.slice(prefix.length).split("/");
        if (entry.type === "tree" && parts.length === 1 && !folders.has(parts[0])) {
            folders.set(parts[0], []);
        } else if (entry.type === "blob" && parts.length === 2) {
            const files = folders.get(parts[0]) ?? [];
            files.push(parts[1]);
            folders.set(parts[0], files);
        }
    }

    const playlists = [...folders].map(([name, files]) => {
        // обложку ищем без учёта регистра, чтобы «.JPG» тоже подхватился
        const fileByLowerName = new Map(files.map((file) => [file.toLowerCase(), file]));
        const tracks = files
            .filter((file) => file.toLowerCase().endsWith(".mp3"))
            .sort(compareNames)
            .map((file) => {
                const baseName = file.slice(0, -".mp3".length);
                const coverName = fileByLowerName.get(`${baseName}.jpg`.toLowerCase());
                return {
                    ...splitTrackName(baseName),
                    file,
                    src: trackUrl(name, file),
                    cover: coverName ? trackUrl(name, coverName) : null,
                };
            });
        return { name, tracks };
    });
    return playlists.sort((a, b) => {
        if (a.name === DEFAULT_PLAYLIST || b.name === DEFAULT_PLAYLIST) {
            return a.name === DEFAULT_PLAYLIST ? -1 : 1;
        }
        return compareNames(a.name, b.name);
    });
}

/**
 * Порядок как у GitHub — по кодам символов, без учёта языка: так список совпадает с тем, что видно в репозитории.
 * @param {string} a
 * @param {string} b
 */
function compareNames(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @param {unknown} entry
 * @returns {entry is TreeEntry}
 */
function isTreeEntry(entry) {
    return (
        typeof entry === "object" &&
        entry !== null &&
        "path" in entry &&
        "type" in entry &&
        typeof entry.path === "string" &&
        typeof entry.type === "string"
    );
}

/** @returns {Promise<Playlist[]>} */
export async function loadPlaylists() {
    return buildPlaylists(await fetchTree());
}
