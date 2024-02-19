import soundData from "../sounds.json" assert { type: "json" };
console.log("json structure:", soundData);


// some chatgpt magic that I read a few articles about but every article kind of recommended using libs/frameworks.
// decided to go this route because I needed better performance to have it be musically accurate and responsive
let audioCtx;
let analyser;

function getAudioContext() {
    if (!audioCtx) {
        const contextOptions = {
            latencyHint: "interactive",
        };
        audioCtx = new (window.AudioContext || window.webkitAudioContext)(contextOptions);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        visualize();
    }
    return audioCtx;
}

const audioBuffers = {};
let activeSource = null; // track the currently playing source

async function preloadSounds(soundData) {
    const promises = soundData.soundFiles.map(({ file, key }) =>
        fetch(file)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok for ${file}`);
                }
                return response.arrayBuffer();
            })
            .then(arrayBuffer => getAudioContext().decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                audioBuffers[key] = audioBuffer;
            })
            .catch(error => {
                console.error("Error preloading sound:", key, error);
            })
    );
    await Promise.all(promises);
    console.log("audio buffer structure:", audioBuffers);
}

function playSound(key) {
    // immediately stop any currently playing sound
    if (activeSource) {
        activeSource.stop();
        activeSource.disconnect();
        activeSource = null;
    }
    

    const audioBuffer = audioBuffers[key];

    const source = getAudioContext().createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(getAudioContext().destination);

    source.start(0);

    activeSource = source;

    source.onended = () => {
        if (activeSource === source) {
            activeSource = null;
        }
    };
}

function normalizeData(filteredData) {
    const maxVal = Math.max(...filteredData);
    const multiplier = maxVal > 0 ? Math.pow(maxVal, -1) : 0;
    // Apply a non-linear transformation to exaggerate differences
    return filteredData.map(n => {
        const normalized = n * multiplier;
        // Exaggerate the waveform: make highs higher and lows lower
        return Math.pow(normalized, 3);
    });
}

function visualize() {
    const canvas = document.getElementById("waveform");
    const canvasCtx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    let dataArray = new Uint8Array(bufferLength);
    let normalizedData = new Array(bufferLength).fill(0);

    let lastDrawTime = 0;
    const drawInterval = 1000 / 120;
    const decayFactor = 0.9;

    function draw() {
        const currentTime = performance.now();
        if (currentTime - lastDrawTime > drawInterval) {
            analyser.getByteFrequencyData(dataArray);
            let tempNormalizedData = normalizeData([...dataArray]);

            // Apply decay to each data point
            for (let i = 0; i < bufferLength; i++) {
                // Compare the current data point to the decayed previous value
                normalizedData[i] = Math.max(tempNormalizedData[i], normalizedData[i] * decayFactor);
            }

            canvasCtx.fillStyle = "rgb(0, 0, 0)";
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = 6;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = normalizedData[i] * canvas.height;
                canvasCtx.fillStyle = "rgb(37, 150, 190)";
                canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
            lastDrawTime = currentTime;
        }
        requestAnimationFrame(draw);
    }

    draw();
}

//event listeners and for loop etc
function setupButton(key) {
    const button = document.createElement("button");
    button.textContent = key;
    button.className = "pad";
    button.setAttribute("data-key", key);

    button.addEventListener("dragover", (event) => {
        event.preventDefault();
        button.classList.add("drag-over");
    });

    button.addEventListener("dragleave", (event) => {
        button.classList.remove("drag-over");
    });

    //allow end user to drop files of their own
    button.addEventListener("drop", (event) => {
        event.preventDefault();
        button.classList.remove("drag-over");

        // process the dropped file
        const file = event.dataTransfer.files[0];
        if (file && file.type.startsWith("audio/")) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const arrayBuffer = e.target.result;
                getAudioContext().decodeAudioData(arrayBuffer, (audioBuffer) => {
                    audioBuffers[key] = audioBuffer;
                    playSound(key);
                });
            };
            reader.readAsArrayBuffer(file);
        }
    });

    button.addEventListener("click", () => {
        playSound(key);
        button.classList.add("pad-active");
        setTimeout(() => {
            button.classList.remove("pad-active");
        }, 100);
    });

    document.addEventListener("keydown", event => {
        if (!event.repeat) {
            const keyPressed = event.key.toUpperCase();
            const button = document.querySelector(`button[data-key="${keyPressed}"]`);
            if (button) {
                button.classList.add("pad-active");
                playSound(keyPressed);
            }
        }
    });

    document.addEventListener("keyup", event => {
        const keyReleased = event.key.toUpperCase();
        const button = document.querySelector(`button[data-key="${keyReleased}"]`);
        if (button) {
            setTimeout(() => {
                button.classList.remove("pad-active");
            }, 100);
        }
    });

    return button;
}

document.addEventListener("DOMContentLoaded", () => {
    const pads = document.querySelector(".pads");
    preloadSounds(soundData).then(() => {
        soundData.soundFiles.forEach(({ key }) => {
            const button = setupButton(key);
            pads.appendChild(button);
        });
    });
});