// Список треков: один запрос к GitHub API за содержимым папки tracks/ этого репозитория.
// Имя файла: "Артист - Название.mp3", обложка рядом: "Артист - Название.jpg".

// Хардкод: чей репозиторий читать.
const OWNER = "zxclushii";
const REPO = "s88s8s8s8s8s8";

export const TRACKS_DIR = "tracks";
export const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${TRACKS_DIR}`;
const API_TIMEOUT_MS = 10_000;

/** Ошибка, которую показываем прямо в плеере: две строки на месте названия и артиста. */
export class PlayerError extends Error {
    constructor(headline, detail, options) {
        super(`${headline}: ${detail}`, options);
        this.name = "PlayerError";
        this.headline = headline;
        this.detail = detail;
    }
}

async function fetchTrackFiles() {
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
        // Без токена GitHub даёт 60 запросов в час на IP; при исчерпании — 403/429 и remaining = 0.
        const limitHit = (response.status === 403 || response.status === 429)
            && response.headers.get("x-ratelimit-remaining") === "0";
        if (limitHit) {
            const resetMs = Number(response.headers.get("x-ratelimit-reset")) * 1000;
            const until = resetMs > 0
                ? new Date(resetMs).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                : null;
            throw new PlayerError("Лимит API", until ? `жди до ${until}` : "жди час");
        }
        if (response.status === 404) {
            throw new PlayerError("Ошибка 404", `нет папки ${TRACKS_DIR}`);
        }
        throw new PlayerError(`Ошибка ${response.status}`, "GitHub API");
    }

    let entries;
    try {
        entries = await response.json();
    } catch (err) {
        throw new PlayerError("Ошибка", "битый ответ API", { cause: err });
    }
    // Если tracks окажется файлом, API вернёт объект вместо массива.
    if (!Array.isArray(entries)) {
        throw new PlayerError("Ошибка", `${TRACKS_DIR} — файл`);
    }
    return entries;
}

/** Относительный путь к файлу: в именах пробелы, кириллица, бывают # и ?. */
function trackUrl(fileName) {
    return `${TRACKS_DIR}/${encodeURIComponent(fileName)}`;
}

/** Режем по ПЕРВОМУ " - ": "ClariS - Connect - TV size" → "ClariS" и "Connect - TV size". */
function splitTrackName(baseName) {
    const separator = baseName.indexOf(" - ");
    if (separator === -1) {
        return { artist: "", title: baseName.trim() };
    }
    return {
        artist: baseName.slice(0, separator).trim(),
        title: baseName.slice(separator + " - ".length).trim(),
    };
}

function buildPlaylist(entries) {
    const files = entries.filter((entry) => entry?.type === "file" && typeof entry.name === "string");
    // Обложку ищем без учёта регистра, чтобы «.JPG» тоже подхватился.
    const fileByLowerName = new Map(files.map((file) => [file.name.toLowerCase(), file.name]));

    return files
        .filter((file) => file.name.toLowerCase().endsWith(".mp3"))
        .map((file) => {
            const baseName = file.name.slice(0, -".mp3".length);
            const coverName = fileByLowerName.get(`${baseName}.jpg`.toLowerCase());
            return {
                ...splitTrackName(baseName),
                src: trackUrl(file.name),
                cover: coverName ? trackUrl(coverName) : null,
            };
        });
}

/** Треки в порядке, в котором их отдаёт GitHub (по имени файла). */
export async function loadPlaylist() {
    return buildPlaylist(await fetchTrackFiles());
}
