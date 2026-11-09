// Плеер берёт список треков из папки tracks/ этого же репозитория через GitHub API.
// Имя файла: "Артист - Название.mp3", обложка рядом: "Артист - Название.jpg".

// Хардкод: чей репозиторий читать.
const OWNER = "zxclushii";
const REPO = "s88s8s8s8s8s8";

const TRACKS_DIR = "tracks";
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${TRACKS_DIR}`;
const API_TIMEOUT_MS = 10_000;

const PLACEHOLDER_COVER = "img/cover.svg";
const ICON_PLAY = "img/play.gif";
const ICON_PAUSE = "img/pause.gif";

const container = document.querySelector(".container");
const background = document.getElementById("background");
const thumbnail = document.getElementById("thumbnail");
const song = document.getElementById("song");
const songArtist = document.querySelector(".song-artist");
const songTitle = document.querySelector(".song-title");
const playPauseButton = document.getElementById("play-pause");
const playPauseIcon = playPauseButton.querySelector("img");
const nextButton = document.getElementById("next-song");
const previousButton = document.getElementById("previous-song");
const progressBar = document.getElementById("progress-bar");
const currentTimeText = document.querySelector(".currentTime");
const durationTimeText = document.querySelector(".durationTime");

let tracks = [];
let trackIndex = 0;
// Пока ползунок держат, timeupdate не должен утаскивать его обратно к текущему времени.
let dragging = false;

/** Ошибка, которую показываем прямо в плеере: две строки на месте артиста и названия. */
class PlayerError extends Error {
    constructor(headline, detail, options) {
        super(`${headline}: ${detail}`, options);
        this.name = "PlayerError";
        this.headline = headline;
        this.detail = detail;
    }
}

/** Список файлов папки tracks/ — один запрос к GitHub API. */
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
                cover: coverName ? trackUrl(coverName) : PLACEHOLDER_COVER,
            };
        });
}

function showText(artist, title) {
    songArtist.textContent = artist;
    songTitle.textContent = title;
    // Полное имя во всплывающей подсказке, если строка обрезана многоточием.
    songArtist.title = artist;
    songTitle.title = title;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function loadTrack(index) {
    trackIndex = (index + tracks.length) % tracks.length;
    const track = tracks[trackIndex];

    song.src = track.src;
    thumbnail.src = track.cover;
    background.src = track.cover;
    showText(track.artist, track.title);

    progressBar.max = 0;
    progressBar.value = 0;
    currentTimeText.textContent = formatTime(0);
    durationTimeText.textContent = formatTime(NaN);
}

async function play() {
    try {
        await song.play();
    } catch (err) {
        // AbortError: play() прервала загрузка другого трека (быстро листали) — это норма.
        // NotSupportedError: файл не загрузился — его уже показал обработчик "error" у song.
        if (err.name === "AbortError" || err.name === "NotSupportedError") {
            return;
        }
        console.error(`Не удалось включить «${song.currentSrc}»:`, err);
    }
}

function switchTrack(step) {
    if (tracks.length === 0) {
        return;
    }
    loadTrack(trackIndex + step);
    void play();
}

function renderPlaying(isPlaying) {
    container.classList.toggle("playing", isPlaying);
    playPauseIcon.src = isPlaying ? ICON_PAUSE : ICON_PLAY;
    playPauseButton.setAttribute("aria-label", isPlaying ? "Пауза" : "Играть");
}

playPauseButton.addEventListener("click", () => {
    if (tracks.length === 0) {
        return;
    }
    if (song.paused) {
        void play();
    } else {
        song.pause();
    }
});
nextButton.addEventListener("click", () => switchTrack(1));
previousButton.addEventListener("click", () => switchTrack(-1));

// Кнопка и обложка следуют за реальным состоянием аудио, а не за кликами.
song.addEventListener("play", () => renderPlaying(true));
song.addEventListener("pause", () => renderPlaying(false));
song.addEventListener("ended", () => switchTrack(1));

song.addEventListener("error", () => {
    // Файл есть в списке API, но не грузится: Pages ещё не выложил свежий коммит, или файл битый.
    console.error(`Не загрузился «${song.currentSrc}»:`, song.error);
    songTitle.textContent = "не загрузился";
    // После ошибки загрузки paused может остаться false — ставим паузу, чтобы кнопка не врала.
    song.pause();
});

song.addEventListener("durationchange", () => {
    progressBar.max = Number.isFinite(song.duration) ? song.duration : 0;
    durationTimeText.textContent = formatTime(song.duration);
});

song.addEventListener("timeupdate", () => {
    if (dragging) {
        return;
    }
    progressBar.value = song.currentTime;
    currentTimeText.textContent = formatTime(song.currentTime);
});

progressBar.addEventListener("pointerdown", () => {
    dragging = true;
});
// Отпустить ползунок можно и за пределами полосы — поэтому слушаем всё окно.
window.addEventListener("pointerup", () => {
    dragging = false;
});
window.addEventListener("pointercancel", () => {
    dragging = false;
});
progressBar.addEventListener("input", () => {
    currentTimeText.textContent = formatTime(progressBar.valueAsNumber);
});
// Перематываем, когда ползунок отпустили, как в фиддле, а не на каждом движении.
progressBar.addEventListener("change", () => {
    if (tracks.length === 0) {
        return;
    }
    song.currentTime = progressBar.valueAsNumber;
});

for (const image of [thumbnail, background]) {
    image.addEventListener("error", () => {
        // .jpg есть в списке API, но не грузится — ставим заглушку (проверка спасает от цикла).
        if (image.getAttribute("src") !== PLACEHOLDER_COVER) {
            image.src = PLACEHOLDER_COVER;
        }
    });
}

async function init() {
    showText("Загрузка…", "");
    try {
        tracks = buildPlaylist(await fetchTrackFiles());
    } catch (err) {
        console.error(`Не удалось получить список треков (${API_URL}):`, err);
        if (err instanceof PlayerError) {
            showText(err.headline, err.detail);
        } else {
            showText("Ошибка", "см. консоль");
        }
        return;
    }

    if (tracks.length === 0) {
        showText("Нет треков", `нет mp3 в ${TRACKS_DIR}`);
        return;
    }
    loadTrack(0);
}

void init();
