let db;
let playlist = [];
let currentTrackIndex = -1;
let isCrossfading = false;

const audio = document.getElementById('audio-player');
const audioNext = document.getElementById('audio-player-next');
const playBtn = document.getElementById('play-btn');
const coverArt = document.getElementById('cover');

// Елементи налаштувань
const crossfadeSwitch = document.getElementById('crossfade-switch');
const coverZoomSwitch = document.getElementById('cover-zoom-switch');

// 1. Відкриваємо вбудовану базу даних у Safari на iPhone
const request = indexedDB.open("MusicPlayerDB", 1);

request.onupgradeneeded = function(e) {
    db = e.target.result;
    db.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
};

request.onsuccess = function(e) {
    db = e.target.result;
    loadPlaylist();
};

// 2. Збереження аудіофайлу, назви та картинки в пам'ять телефону
function saveTrack() {
    const fileInput = document.getElementById('file-input');
    const title = document.getElementById('track-title').value || "Без назви";
    const artist = document.getElementById('track-artist').value || "Невідомий";
    let cover = document.getElementById('track-cover').value || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500";

    if (!fileInput.files[0]) {
        alert("Будь ласка, оберіть музичний файл!");
        return;
    }

    const file = fileInput.files[0];
    const transaction = db.transaction(["tracks"], "readwrite");
    const store = transaction.objectStore("tracks");

    const newTrack = {
        title: title,
        artist: artist,
        cover: cover,
        file: file, // Зберігаємо файл як бінарний об'єкт (Blob)
        plays: 0
    };

    store.add(newTrack);

    transaction.oncomplete = function() {
        // Очищення форми після успішного збереження
        document.getElementById('track-title').value = '';
        document.getElementById('track-artist').value = '';
        document.getElementById('track-cover').value = '';
        fileInput.value = '';
        loadPlaylist();
    };
}

// 3. Відображення збереженої медіатеки
function loadPlaylist() {
    const transaction = db.transaction(["tracks"], "readonly");
    const store = transaction.objectStore("tracks");
    const request = store.getAll();

    request.onsuccess = function() {
        playlist = request.result;
        const container = document.getElementById('playlist-container');
        container.innerHTML = '';

        if(playlist.length === 0) {
            container.innerHTML = '<p style="font-size:0.9rem; color:#555; text-align:center;">Тут поки порожньо...</p>';
            return;
        }

        playlist.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            
            item.innerHTML = `
                <div class="track-click-area" onclick="selectTrack(${index})">
                    <img src="${track.cover}">
                    <div class="playlist-info">
                        <div>${track.title}</div>
                        <span>${track.artist} · Слухано: ${track.plays}</span>
                    </div>
                </div>
                <button class="btn-delete" onclick="deleteTrack(${track.id}, event)">×</button>
            `;
            container.appendChild(item);
        });
    };
}

// 4. Видалення треку з медіатеки
function deleteTrack(id, event) {
    event.stopPropagation(); // Щоб клік не запускав відтворення пісні
    if(confirm("Видалити цей трек із додатка?")) {
        const transaction = db.transaction(["tracks"], "readwrite");
        const store = transaction.objectStore("tracks");
        store.delete(id);
        transaction.oncomplete = function() {
            loadPlaylist();
        };
    }
}

// 5. Вибір треку зі списку
function selectTrack(index) {
    currentTrackIndex = index;
    isCrossfading = false;
    const track = playlist[index];

    document.getElementById('title').innerText = track.title;
    document.getElementById('artist').innerText = track.artist;
    coverArt.style.backgroundImage = `url('${track.cover}')`;
    document.getElementById('listen-count').innerText = track.plays;

    if(audio.src) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(track.file);
    audio.volume = 1; // повертаємо повну гучність старого плеєра
    
    togglePlay(true);
}

// 6. Старт / Пауза
function togglePlay(forcePlay = false) {
    if (audio.paused || forcePlay) {
        audio.play().catch(e => console.log("Потрібна дія користувача"));
        playBtn.innerText = "ПАУЗА";
        playBtn.style.backgroundColor = "#e91e63"; // Колір паузи
        if(coverZoomSwitch.checked) coverArt.style.transform = "scale(1.04)";
    } else {
        audio.pause();
        playBtn.innerText = "ГРАТИ";
        playBtn.style.backgroundColor = "var(--accent-color)";
        coverArt.style.transform = "scale(1)";
    }
}

// Постійне відстеження часу треку
audio.ontimeupdate = function() {
    // Якщо увімкнено Crossfade і до кінця пісні менше 4 секунд
    if (crossfadeSwitch.checked && audio.duration && (audio.duration - audio.currentTime <= 4) && !isCrossfading) {
        if (currentTrackIndex + 1 < playlist.length) {
            isCrossfading = true;
            startCrossfade();
        }
    }
};

// 7. Функція плавного переходу (Crossfade)
function startCrossfade() {
    const nextIndex = currentTrackIndex + 1;
    const nextTrack = playlist[nextIndex];
    
    if(audioNext.src) URL.revokeObjectURL(audioNext.src);
    audioNext.src = URL.createObjectURL(nextTrack.file);
    audioNext.volume = 0; // Наступна пісня починається з тиші
    audioNext.play().catch(e => console.log(e));

    // Зараховуємо прослуховування старій пісні
    updatePlayCount(currentTrackIndex);

    let fadeInterval = setInterval(() => {
        // Гасимо стару пісню
        if (audio.volume > 0.05) audio.volume -= 0.05;
        else audio.volume = 0;

        // Нарощуємо гучність нової
        if (audioNext.volume < 0.95) audioNext.volume += 0.05;
        else audioNext.volume = 1;

        // Коли звук повністю перетік
        if (audio.volume === 0 && audioNext.volume === 1) {
            clearInterval(fadeInterval);
            
            // Робимо другий плеєр основним
            audio.src = audioNext.src;
            audio.currentTime = audioNext.currentTime;
            audio.volume = 1;
            
            currentTrackIndex = nextIndex;
            
            // Оновлюємо інтерфейс під нову пісню
            document.getElementById('title').innerText = nextTrack.title;
            document.getElementById('artist').innerText = nextTrack.artist;
            coverArt.style.backgroundImage = `url('${nextTrack.cover}')`;
            document.getElementById('listen-count').innerText = nextTrack.plays;
            
            isCrossfading = false;
        }
    }, 200); // Крокуємо кожні 200 мс (всього 20 кроків за 4 секунди)
}

// Оновлення лічильника в базі даних
function updatePlayCount(index) {
    const track = playlist[index];
    track.plays += 1;

    const transaction = db.transaction(["tracks"], "readwrite");
    const store = transaction.objectStore("tracks");
    store.put(track);

    transaction.oncomplete = function() {
        loadPlaylist();
    };
}

// Якщо пісня просто закінчилась самостійно (наприклад, остання в черзі)
audio.onended = function() {
    if (!isCrossfading) {
        updatePlayCount(currentTrackIndex);
        if (currentTrackIndex + 1 < playlist.length) {
            selectTrack(currentTrackIndex + 1);
        } else {
            playBtn.innerText = "ГРАТИ";
            playBtn.style.backgroundColor = "var(--accent-color)";
            coverArt.style.transform = "scale(1)";
        }
    }
};

// Відкрити/Закрити панель налаштувань
function toggleSettings() {
    const container = document.getElementById('settings-container');
    if (container.style.display === 'none' || container.style.display === '') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}