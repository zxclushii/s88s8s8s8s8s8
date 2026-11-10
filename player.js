// Логика плеера: плейлист из GitHub, аудио, shuffle и repeat. Внешний вид — в ui.js.
// Плеер — одно из окон сайта: его ставит на страницу site.js через mountPlayer.

import { API_URL, PlayerError, TRACKS_DIR, loadPlaylist } from "./tracks.js";
import { createPlayerUI } from "./ui.js";

const REPEAT_MODES = ["off", "all", "one"];
// Как в Spotify: «назад» после 3 секунд трека сначала перематывает его в начало.
const RESTART_THRESHOLD_SECONDS = 3;
const VOLUME_STORAGE_KEY = "player.volume";

/** На iPhone и iPad громкость сайту не подвластна: audio.volume там не записывается. */
function canControlVolume() {
    const probe = document.createElement("audio");
    probe.volume = 0.5;
    return probe.volume === 0.5;
}

/** Громкость, выставленная в прошлый раз; нет её — полная. */
function loadVolume() {
    try {
        const saved = Number(localStorage.getItem(VOLUME_STORAGE_KEY));
        return saved > 0 && saved <= 1 ? saved : 1;
    } catch {
        // хранилище недоступно (приватный режим, запрет сайта) — просто полная громкость
        return 1;
    }
}

function saveVolume(level) {
    try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(level));
    } catch {
        // не запомнили — не страшно: в следующий раз будет полная громкость
    }
}

const audio = new Audio();
audio.preload = "metadata";
const volumeControl = canControlVolume();
if (volumeControl) {
    audio.volume = loadVolume();
}

let tracks = [];
// Порядок проигрывания: номера треков; при shuffle — перемешанные.
let order = [];
// Где мы сейчас в order.
let position = 0;
let shuffle = false;
let repeat = "off";

// Экран плеера; появляется в mountPlayer.
let ui;

/** Строит плеер внутри root и начинает грузить плейлист. Возвращает окно: setOpen(true|false). */
export function mountPlayer(root) {
    ui = createPlayerUI(root, {
        onPlayPause: togglePlay,
        onPrevious: previous,
        onNext: () => step(1),
        onShuffle: toggleShuffle,
        onRepeat: cycleRepeat,
        onSeek: (seconds) => {
            if (tracks.length > 0) {
                audio.currentTime = seconds;
            }
        },
        onVolume: (level, final) => {
            audio.muted = false;
            audio.volume = level;
            // Запоминаем только отпущенное значение и не ноль: иначе, утянув ползунок в ноль,
            // запомнили бы промежуточные 3–4%, и «включить звук» вернул бы почти тишину.
            if (final && level > 0) {
                saveVolume(level);
            }
        },
        onMute: () => {
            if (audio.muted) {
                audio.muted = false;
            } else if (audio.volume === 0) {
                audio.volume = loadVolume();
            } else {
                audio.muted = true;
            }
        },
    }, { volumeControl });
    ui.showVolume(audio.volume, audio.muted);
    void init();
    return { setOpen: ui.setOpen };
}

function identityOrder() {
    return tracks.map((_, index) => index);
}

/** Перемешиваем всё, кроме текущего трека: он остаётся первым (Фишер — Йетс). */
function shuffledOrder(first) {
    const rest = identityOrder().filter((index) => index !== first);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [first, ...rest];
}

function load(newPosition) {
    position = (newPosition + order.length) % order.length;
    const track = tracks[order[position]];
    audio.src = track.src;
    ui.showTrack(track);
}

async function play() {
    try {
        await audio.play();
    } catch (err) {
        // AbortError: play() прервала загрузка другого трека (быстро листали) — это норма.
        // NotSupportedError: файл не загрузился — его уже показал обработчик "error".
        if (err.name === "AbortError" || err.name === "NotSupportedError") {
            return;
        }
        console.error(`Не удалось включить «${audio.currentSrc}»:`, err);
    }
}

function togglePlay() {
    if (tracks.length === 0) {
        return;
    }
    if (audio.paused) {
        void play();
    } else {
        audio.pause();
    }
}

function step(delta) {
    if (tracks.length === 0) {
        return;
    }
    load(position + delta);
    void play();
}

function previous() {
    if (tracks.length === 0) {
        return;
    }
    if (audio.currentTime > RESTART_THRESHOLD_SECONDS) {
        audio.currentTime = 0;
        return;
    }
    step(-1);
}

function toggleShuffle() {
    shuffle = !shuffle;
    ui.showShuffle(shuffle);
    if (tracks.length === 0) {
        return;
    }
    const current = order[position];
    order = shuffle ? shuffledOrder(current) : identityOrder();
    position = order.indexOf(current);
}

function cycleRepeat() {
    repeat = REPEAT_MODES[(REPEAT_MODES.indexOf(repeat) + 1) % REPEAT_MODES.length];
    // «Один трек» отдаём браузеру: он зацикливает сам, без паузы и без события ended.
    audio.loop = repeat === "one";
    ui.showRepeat(repeat);
}

// Кнопка и обложка следуют за реальным состоянием аудио, а не за кликами.
audio.addEventListener("play", () => ui.showPlaying(true));
audio.addEventListener("pause", () => ui.showPlaying(false));
audio.addEventListener("timeupdate", () => ui.showTime(audio.currentTime, audio.duration));
audio.addEventListener("durationchange", () => ui.showTime(audio.currentTime, audio.duration));
audio.addEventListener("volumechange", () => ui.showVolume(audio.volume, audio.muted));

audio.addEventListener("ended", () => {
    if (position === order.length - 1 && repeat === "off") {
        // Плейлист кончился: встаём на первый трек и молчим, как Spotify.
        load(0);
        return;
    }
    step(1);
});

audio.addEventListener("error", () => {
    // Файл есть в списке API, но не грузится: Pages ещё не выложил свежий коммит, или файл битый.
    console.error(`Не загрузился «${audio.currentSrc}»:`, audio.error);
    ui.showDetail("не загрузился");
    // После ошибки загрузки paused может остаться false — ставим паузу, чтобы кнопка не врала.
    audio.pause();
});

async function init() {
    ui.showStatus("Загрузка…", "");
    try {
        tracks = await loadPlaylist();
    } catch (err) {
        console.error(`Не удалось получить список треков (${API_URL}):`, err);
        if (err instanceof PlayerError) {
            ui.showStatus(err.headline, err.detail);
        } else {
            ui.showStatus("Ошибка", "см. консоль");
        }
        return;
    }

    if (tracks.length === 0) {
        ui.showStatus("Нет треков", `нет mp3 в ${TRACKS_DIR}`);
        return;
    }
    // shuffle могли включить, пока грузился список
    order = shuffle ? shuffledOrder(0) : identityOrder();
    load(0);
}
