let mediaRecorder;
let audioChunks = [];
let audioBlob;
let audioStream;
let analyser;
let audioContext;
let visualizerBars = [];
let recordingStartTime;
let visualizerAnimation;
let canvas;
let canvasStream;
const webhook = process.env.WEBHOOK;
const statusElement = document.getElementById('status');
const visualizerElement = document.getElementById('visualizer');
const getNumBars = () => {
    return window.innerWidth <= 480 ? 40 :
        window.innerWidth <= 768 ? 50 : 60;
};
let numBars = getNumBars();

function updateStatus(message) {
    statusElement.textContent = `Stato: ${message}`;
    console.log(message);
}

function createVisualizerBars() {
    visualizerElement.innerHTML = '';
    visualizerBars = [];
    numBars = getNumBars();
    const visualizerWidth = visualizerElement.clientWidth;
    const barWidth = 4;
    const minGap = 1;
    let gap = (visualizerWidth - (barWidth * numBars)) / (numBars - 1);
    if (gap < minGap) gap = minGap;
    const maxPossibleBars = Math.floor((visualizerWidth + gap) / (barWidth + gap));
    const actualBars = Math.min(numBars, maxPossibleBars);
    const totalWidth = (barWidth + gap) * actualBars - gap;
    const startX = (visualizerWidth - totalWidth) / 2;
    for (let i = 0; i < actualBars; i++) {
        const bar = document.createElement('div');
        bar.className = 'visualizer-bar';
        bar.style.left = `${startX + i * (barWidth + gap)}px`;
        bar.style.width = `${barWidth}px`;
        bar.style.height = '0';
        visualizerElement.appendChild(bar);
        visualizerBars.push(bar);
    }
    const indicator = document.createElement('div');
    indicator.className = 'recording-indicator';
    visualizerElement.appendChild(indicator);
}

function resetVisualizer() {
    if (visualizerBars.length === 0) return;
    for (let i = 0; i < visualizerBars.length; i++) {
        if (visualizerBars[i]) {
            visualizerBars[i].style.height = '0px';
        }
    }
    const indicator = visualizerElement.querySelector('.recording-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function updateVisualizer() {
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    const step = Math.floor(dataArray.length / visualizerBars.length);
    for (let i = 0; i < visualizerBars.length; i++) {
        const index = i * step;
        let sum = 0;
        let count = 0;
        for (let j = 0; j < step && index + j < dataArray.length; j++) {
            sum += dataArray[index + j];
            count++;
        }
        const value = sum / count;
        const visualizerHeight = visualizerElement.clientHeight;
        const maxBarHeight = visualizerHeight * 0.9;
        const height = Math.max(1, (value / 255) * maxBarHeight);
        if (visualizerBars[i]) {
            visualizerBars[i].style.height = `${height}px`;
            const hue = 190 + (height / maxBarHeight) * 30;
            visualizerBars[i].style.backgroundColor = `hsl(${hue}, 90%, 50%)`;
        }
    }
}

function createCanvasWithNickname(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 144;
    const ctx = canvas.getContext('2d');

    // Carica la GIF
    const img = new Image();
    img.src = 'assets/sf.gif'; // Sostituisci con il percorso della tua GIF

    img.onload = () => {
        function draw() {
            // Pulisci la canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Disegna la GIF
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Aggiungi il testo del nickname
            ctx.fillStyle = 'white';
            ctx.font = 'bold 28px Inter, Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(name, 200, 72);

            // Aggiungi il testo "EdoTalks"
            ctx.font = '16px Inter, Arial';
            ctx.fillText('EdoTalks', 200, 130);

            // Chiamata ricorsiva per aggiornare la canvas
            requestAnimationFrame(draw);
        }

        // Inizia a disegnare
        draw();
    };

    // Restituisci lo stream della canvas
    return canvas.captureStream(30);
}

async function initializeAudio() {
    try {
        updateStatus("Richiedo accesso al microfono...");
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        updateStatus("Accesso al microfono ottenuto");
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        return stream;
    } catch (error) {
        console.error('Errore nell\'acquisizione del microfono:', error);
        updateStatus(`Errore microfono: ${error.message}`);
        alert('Impossibile accedere al microfono. Controlla i permessi.');
        return null;
    }
}

function stopVisualization() {
    if (visualizerAnimation) {
        cancelAnimationFrame(visualizerAnimation);
        visualizerAnimation = null;
    }
    resetVisualizer();
}

document.getElementById('recordButton').addEventListener('click', async () => {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) {
        alert('Devi inserire un nickname!');
        return;
    }
    try {
        createVisualizerBars();
        audioStream = await initializeAudio();
        if (!audioStream) {
            return;
        }
        canvasStream = createCanvasWithNickname(name);
        const animateVisualizer = () => {
            updateVisualizer();
            visualizerAnimation = requestAnimationFrame(animateVisualizer);
        };
        visualizerAnimation = requestAnimationFrame(animateVisualizer);
        recordingStartTime = Date.now();
        const combinedStream = new MediaStream([
            ...canvasStream.getTracks(),
            ...audioStream.getTracks()
        ]);
        const options = {
            mimeType: 'video/webm'
        };
        try {
            mediaRecorder = new MediaRecorder(combinedStream, options);
        } catch (e) {
            console.warn(`MediaRecorder non supporta ${options.mimeType}, provo senza specificare il formato`);
            mediaRecorder = new MediaRecorder(combinedStream);
        }
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        mediaRecorder.onstop = () => {
            stopVisualization();
            updateStatus("Registrazione completata");
            audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);
            document.getElementById('audioPreview').src = audioUrl;
            document.getElementById('recordButton').disabled = false;
            document.getElementById('stopButton').disabled = true;
            document.getElementById('sendButton').disabled = false;
        };
        mediaRecorder.start(1000);
        updateStatus("Registrazione in corso...");
        document.getElementById('recordButton').disabled = true;
        document.getElementById('stopButton').disabled = false;
    } catch (error) {
        console.error('Errore durante la registrazione:', error);
        updateStatus(`Errore: ${error.message}`);
        alert(`Si è verificato un errore: ${error.message}`);
    }
});

document.getElementById('stopButton').addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        stopVisualization();
        updateStatus("Arresto della registrazione...");
    }
});

document.getElementById('sendButton').addEventListener('click', async () => {
    const name = document.getElementById('nameInput').value.trim();
    if (!name || !audioBlob) {
        alert('Devi inserire un nickname e registrare un audio!');
        return;
    }
    try {
        updateStatus("Preparazione per l'invio...");
        const userAgent = navigator.userAgent;
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('username', name);
        const content = `${userAgent}`;
        formData.append('content', content);
        updateStatus("Invio in corso...");
        const response = await fetch('webhook', {
            method: 'POST',
            body: formData
        });
        if (response.ok) {
            updateStatus("Audio inviato con successo!");
            alert('Audio inviato a Discord con successo!');
            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            const errorText = await response.text();
            throw new Error(`Errore di risposta: ${response.status} - ${errorText}`);
        }
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
        }
        if (canvasStream) {
            canvasStream.getTracks().forEach(track => track.stop());
        }
        if (audioContext) {
            audioContext.close();
        }
    } catch (error) {
        console.error('Errore durante l\'invio del file:', error);
        updateStatus(`Errore di invio: ${error.message}`);
        alert(`Errore durante l'invio: ${error.message}`);
    }
});

const audioElement = document.getElementById('audioPreview');
const playPauseButton = document.getElementById('playPauseButton');
const progressBar = document.getElementById('progressBar');
const timeDisplay = document.getElementById('timeDisplay');
const resetButton = document.getElementById('resetButton');

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

playPauseButton.addEventListener('click', () => {
    if (audioElement.paused) {
        audioElement.play().catch(e => {
            console.error('Errore nella riproduzione:', e);
            updateStatus(`Errore di riproduzione: ${e.message}`);
        });
        playPauseButton.textContent = '⏸️';
    } else {
        audioElement.pause();
        playPauseButton.textContent = '▶️';
    }
});

audioElement.addEventListener('ended', () => {
    playPauseButton.textContent = '▶️';
});

audioElement.addEventListener('timeupdate', () => {
    if (audioElement.duration) {
        progressBar.value = (audioElement.currentTime / audioElement.duration) * 100;
        timeDisplay.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(audioElement.duration || 0)}`;
    }
});

progressBar.addEventListener('input', () => {
    if (audioElement.duration) {
        audioElement.currentTime = (progressBar.value / 100) * audioElement.duration;
    }
});

resetButton.addEventListener('click', () => {
    location.reload();
});

window.addEventListener('resize', () => {
    if (visualizerAnimation) {
        createVisualizerBars();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus("API MediaDevices non supportata su questo browser");
        alert("Il tuo browser non supporta la registrazione audio. Prova con un browser aggiornato.");
        document.getElementById('recordButton').disabled = true;
    } else {
        updateStatus("Pronto per la registrazione");
    }
    document.getElementById('customAudioPlayer').style.display = 'none';
    audioElement.addEventListener('loadedmetadata', () => {
        document.getElementById('customAudioPlayer').style.display = 'flex';
    });
});

const creditsButton = document.getElementById('creditsButton');
const developerLinks = document.querySelectorAll('.developer a');
disableLinks();

creditsButton.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!this.classList.contains('active')) {
        this.classList.add('active');
        disableLinks();
        const names = document.querySelectorAll('.name');
        names.forEach(name => {
            name.style.width = '0';
            setTimeout(() => {
                name.style.width = '100%';
            }, 10);
        });
        setTimeout(() => {
            enableLinks();
        }, 900);
    } else {
        disableLinks();
        this.classList.remove('active');
    }
});

document.addEventListener('click', function (e) {
    if (!creditsButton.contains(e.target)) {
        creditsButton.classList.remove('active');
        disableLinks();
    }
});

function disableLinks() {
    developerLinks.forEach(link => {
        link.style.pointerEvents = 'none';
    });
}

function enableLinks() {
    developerLinks.forEach(link => {
        link.style.pointerEvents = 'auto';
    });
}

developerLinks.forEach(link => {
    link.addEventListener('click', function (e) {
        e.stopPropagation();
    });
});
