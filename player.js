// @ts-check
// Логика плеера: плейлисты с GitHub, аудио, перемешивание и повтор. Как это выглядит — в player-view.js.
// Показанный плейлист и тот, что играет, — разные вещи: можно листать папки, не прерывая музыку.

import { MESSAGES } from "./commands.js";
import { createPlayerView, formatTime } from "./player-view.js";
import { API_URL, DEFAULT_PLAYLIST, PlayerError, describeTrack, findTrack, loadPlaylists } from "./tracks.js";

/** @typedef {import("./tracks.js").Playlist} Playlist */
/** @typedef {import("./tracks.js").Track} Track */
/** @typedef {import("./commands.js").PlayerAction} PlayerAction */
/** @typedef {import("./player-view.js").RepeatMode} RepeatMode */

/** @type {RepeatMode[]} */
const REPEAT_MODES = ["off", "all", "one"];
// Как в Spotify: «назад» после 3 секунд трека сначала перематывает его в начало.
const RESTART_THRESHOLD_SECONDS = 3;
const VOLUME_STORAGE_KEY = "player.volume";

/**
 * Порядок проигрывания без перемешивания: 0, 1, 2…
 * @param {number} length
 */
export function identityOrder(length) {
    return Array.from({ length }, (_, index) => index);
}

/**
 * Перемешанный порядок, где first стоит первым (Фишер — Йетс для остальных).
 * @param {number} length
 * @param {number} first
 * @param {() => number} [random] для тестов
 */
export function shuffledOrder(length, first, random = Math.random) {
    const rest = identityOrder(length).filter((index) => index !== first);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [first, ...rest];
}

/**
 * Позиция трека для экрана блокировки. Пустой объект сбрасывает её — пока длина неизвестна.
 * setPositionState бросает TypeError, если позиция за концом трека или скорость 0, — такое сюда не попадёт.
 * @param {number} position
 * @param {number} duration
 * @param {number} playbackRate
 * @returns {MediaPositionState}
 */
export function positionState(position, duration, playbackRate) {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(playbackRate) || playbackRate === 0) {
        return {};
    }
    return { duration, playbackRate, position: Math.min(Math.max(position, 0), duration) };
}

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

/** @param {number} level */
function saveVolume(level) {
    try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(level));
    } catch {
        // не запомнили — не страшно: в следующий раз будет полная громкость
    }
}

/**
 * Подключает плеер к экрану mp3 и начинает грузить плейлисты.
 * @param {{ onPlaylists: (playlists: Playlist[]) => void }} options onPlaylists — плейлисты пришли с GitHub
 */
export function mountPlayer({ onPlaylists }) {
    const audio = new Audio();
    audio.preload = "metadata";
    const volumeControl = canControlVolume();
    if (volumeControl) {
        audio.volume = loadVolume();
    }
    // Экран блокировки и шторка уведомлений: название, обложка, кнопки. Есть в Safari на iPhone с iOS 15
    // и в Chrome на Android; где нет — плеер просто работает без них.
    const session = "mediaSession" in navigator ? navigator.mediaSession : null;

    /** @type {Playlist[] | null} null — ещё не загрузились или не вышло */
    let playlists = null;
    // какой плейлист показан в списке
    let viewed = 0;
    // очередь: плейлист, из которого играем, порядок его треков (при перемешивании — свой) и где мы в нём
    let queue = 0;
    /** @type {number[]} */
    let order = [];
    let position = 0;
    let shuffle = false;
    /** @type {RepeatMode} */
    let repeat = "off";

    const view = createPlayerView(
        {
            onPlayPause: togglePlay,
            onPrevious: previous,
            onNext: () => step(1),
            onShuffle: toggleShuffle,
            onRepeat: cycleRepeat,
            onSeek: (seconds) => {
                if (order.length > 0) {
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
            onSelect: select,
        },
        { volumeControl },
    );

    function queueTracks() {
        return playlists?.[queue]?.tracks ?? [];
    }

    /** Номер играющего трека в показанном плейлисте; -1 — играет другой. */
    function activeInViewed() {
        return queue === viewed && order.length > 0 ? order[position] : -1;
    }

    function renderViewed() {
        const playlist = playlists?.[viewed];
        if (playlist) {
            view.showPlaylist(playlist.name, playlist.tracks, activeInViewed());
        }
    }

    /** @param {number} newPosition */
    function load(newPosition) {
        const tracks = queueTracks();
        position = (newPosition + order.length) % order.length;
        const index = order[position];
        const track = tracks[index];
        audio.src = track.src;
        view.showTrack(track, index + 1, tracks.length);
        view.setActive(activeInViewed());
        if (session) {
            session.metadata = new MediaMetadata({
                title: track.title,
                artist: track.artist,
                album: playlists?.[queue]?.name ?? "",
                // ссылка полная: относительную телефон может искать не там
                artwork: track.cover ? [{ src: new URL(track.cover, document.baseURI).href, type: "image/jpeg" }] : [],
            });
        }
    }

    function updatePosition() {
        if (session && typeof session.setPositionState === "function") {
            session.setPositionState(positionState(audio.currentTime, audio.duration, audio.playbackRate));
        }
    }

    async function play() {
        try {
            await audio.play();
        } catch (err) {
            // AbortError: play() прервала загрузка другого трека (быстро листали) — это норма.
            // NotSupportedError: файл не загрузился — его уже показал обработчик "error".
            if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotSupportedError")) {
                return;
            }
            console.error(`Не удалось включить «${audio.currentSrc}»:`, err);
        }
    }

    function togglePlay() {
        if (order.length === 0) {
            return;
        }
        if (audio.paused) {
            void play();
        } else {
            audio.pause();
        }
    }

    /** @param {number} delta */
    function step(delta) {
        if (order.length === 0) {
            return;
        }
        load(position + delta);
        void play();
    }

    function previous() {
        if (order.length === 0) {
            return;
        }
        if (audio.currentTime > RESTART_THRESHOLD_SECONDS) {
            audio.currentTime = 0;
            return;
        }
        step(-1);
    }

    /**
     * Включить трек из любого плейлиста. Если это другой плейлист — он становится очередью.
     * @param {number} playlistIndex
     * @param {number} index номер трека в этом плейлисте
     */
    function startFrom(playlistIndex, index) {
        const tracks = playlists?.[playlistIndex]?.tracks ?? [];
        if (index < 0 || index >= tracks.length) {
            return;
        }
        if (queue !== playlistIndex) {
            queue = playlistIndex;
            order = shuffle ? shuffledOrder(tracks.length, index) : identityOrder(tracks.length);
        }
        load(order.indexOf(index));
        void play();
    }

    /**
     * Клик по треку в списке.
     * @param {number} index номер трека в показанном плейлисте
     */
    function select(index) {
        startFrom(viewed, index);
    }

    /** @returns {Track | null} трек, который стоит в плеере; null — играть нечего */
    function currentTrack() {
        return order.length > 0 ? (queueTracks()[order[position]] ?? null) : null;
    }

    function toggleShuffle() {
        shuffle = !shuffle;
        view.showShuffle(shuffle);
        if (order.length === 0) {
            return;
        }
        // играющий трек остаётся на месте, перемешивается остальное
        const current = order[position];
        order = shuffle ? shuffledOrder(order.length, current) : identityOrder(order.length);
        position = order.indexOf(current);
    }

    function cycleRepeat() {
        repeat = REPEAT_MODES[(REPEAT_MODES.indexOf(repeat) + 1) % REPEAT_MODES.length];
        // «Один трек» отдаём браузеру: он зацикливает сам, без паузы и без события ended.
        audio.loop = repeat === "one";
        view.showRepeat(repeat);
    }

    // Кнопка и свечение следуют за настоящим состоянием аудио, а не за кликами.
    audio.addEventListener("play", () => {
        view.showPlaying(true);
        if (session) {
            session.playbackState = "playing";
        }
    });
    audio.addEventListener("pause", () => {
        view.showPlaying(false);
        if (session) {
            session.playbackState = "paused";
        }
    });
    // полоску на экране блокировки двигает сам телефон, ему нужна позиция только при скачках
    for (const type of ["durationchange", "seeked", "ratechange", "play", "pause"]) {
        audio.addEventListener(type, updatePosition);
    }
    audio.addEventListener("timeupdate", () => view.showTime(audio.currentTime, audio.duration));
    audio.addEventListener("durationchange", () => view.showTime(audio.currentTime, audio.duration));
    audio.addEventListener("volumechange", () => view.showVolume(audio.volume, audio.muted));

    audio.addEventListener("ended", () => {
        if (position === order.length - 1 && repeat === "off") {
            // Плейлист кончился: встаём на первый трек и молчим, как Spotify.
            load(0);
            return;
        }
        step(1);
    });

    audio.addEventListener("error", () => {
        // Файл есть в списке, но не грузится: Pages ещё не выложил свежий коммит, или файл битый.
        console.error(`Не загрузился «${audio.currentSrc}»:`, audio.error);
        view.showTrackNote("не загрузился");
        // После ошибки загрузки paused может остаться false — ставим паузу, чтобы кнопка не врала.
        audio.pause();
    });

    async function init() {
        view.showStatus("Загрузка…", "");
        view.showTrack(null, 0, 0);
        let loaded;
        try {
            loaded = await loadPlaylists();
        } catch (err) {
            console.error(`Не удалось получить список треков (${API_URL}):`, err);
            if (err instanceof PlayerError) {
                view.showStatus(err.headline, err.detail);
            } else {
                view.showStatus("Ошибка", "см. консоль");
            }
            return;
        }
        playlists = loaded;
        if (loaded.length === 0) {
            view.showStatus("Нет плейлистов", "нет папок в tracks");
            onPlaylists(loaded);
            return;
        }

        // Очередь — плейлист по умолчанию, а если он пуст — первый, где есть треки.
        const playable = loaded.findIndex((playlist) => playlist.tracks.length > 0);
        queue = loaded[0].tracks.length > 0 ? 0 : Math.max(playable, 0);
        const length = loaded[queue].tracks.length;
        if (length > 0) {
            // shuffle могли включить, пока грузился список
            order = shuffle ? shuffledOrder(length, 0) : identityOrder(length);
            load(0);
        }
        renderViewed();
        // сайт перечитает адрес и покажет нужный плейлист через show
        onPlaylists(loaded);
    }

    if (session) {
        /** @type {[MediaSessionAction, MediaSessionActionHandler][]} */
        const actions = [
            [
                "play",
                () => {
                    if (order.length > 0) {
                        void play();
                    }
                },
            ],
            ["pause", () => audio.pause()],
            ["previoustrack", previous],
            ["nexttrack", () => step(1)],
            [
                "seekto",
                (details) => {
                    if (details.seekTime !== undefined && order.length > 0) {
                        audio.currentTime = details.seekTime;
                        updatePosition();
                    }
                },
            ],
        ];
        for (const [action, handler] of actions) {
            try {
                session.setActionHandler(action, handler);
            } catch {
                // браузер не знает это действие (старые Safari без seekto) — этой кнопки на экране блокировки не будет
            }
        }
    }

    view.showVolume(audio.volume, audio.muted);
    view.showShuffle(shuffle);
    view.showRepeat(repeat);
    view.showPlaying(false);
    void init();

    return {
        /**
         * Показать плейлист в списке, не трогая музыку.
         * @param {string | null} name null — плейлист по умолчанию
         * @returns {string | null} какой плейлист показан; null — плейлисты ещё не загрузились
         */
        show(name) {
            if (!playlists || playlists.length === 0) {
                return null;
            }
            const found = name === null ? -1 : playlists.findIndex((playlist) => playlist.name === name);
            const fallback = playlists.findIndex((playlist) => playlist.name === DEFAULT_PLAYLIST);
            viewed = found !== -1 ? found : Math.max(fallback, 0);
            renderViewed();
            return playlists[viewed].name;
        },

        /**
         * Команда из терминала: play, pause, next, prev, np. Возвращает, что напечатать в ответ.
         * @param {PlayerAction} command
         * @returns {string[]}
         */
        command({ action, query }) {
            if (!playlists) {
                return [MESSAGES.notLoaded];
            }
            if (action === "play" && query !== undefined) {
                const found = findTrack(playlists, query);
                if (!found) {
                    return [`Трек «${query}» не найден.`];
                }
                startFrom(found.playlist, found.index);
                return [`Играет: ${describeTrack(playlists[found.playlist].tracks[found.index])}`];
            }
            const track = currentTrack();
            if (!track) {
                return ["Играть нечего: плейлист пуст."];
            }
            switch (action) {
                case "play":
                    void play();
                    return [`Играет: ${describeTrack(track)}`];
                case "pause":
                    if (audio.paused) {
                        return ["Уже на паузе."];
                    }
                    audio.pause();
                    return [`Пауза: ${describeTrack(track)}`];
                case "next": {
                    step(1);
                    const next = currentTrack();
                    return next ? [`Играет: ${describeTrack(next)}`] : [];
                }
                case "prev": {
                    // как кнопка: после 3 секунд трек сначала отматывается в начало
                    const restart = audio.currentTime > RESTART_THRESHOLD_SECONDS;
                    previous();
                    const now = currentTrack();
                    return now ? [`${restart ? "С начала" : "Играет"}: ${describeTrack(now)}`] : [];
                }
                case "np":
                    return [
                        `${audio.paused ? "Пауза" : "Играет"}: ${describeTrack(track)} · ` +
                            `${formatTime(audio.currentTime)} из ${formatTime(audio.duration)}`,
                    ];
            }
            return [];
        },
    };
}
