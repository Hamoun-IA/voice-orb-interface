class AudioReactiveInput {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.dataArray = null;
    this.smoothedLevel = 0;
    this.status = 'Inactif';
    this.active = false;
    this.error = null;
  }

  async startMicrophone() {
    if (this.active) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = this.audioContext || new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.stream = stream;
      this.source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.82;
      this.dataArray = new Uint8Array(this.analyser.fftSize);
      this.source.connect(this.analyser);

      this.active = true;
      this.error = null;
      this.status = 'Micro actif';
      return true;
    } catch (error) {
      this.error = error;
      this.status = error?.name === 'NotAllowedError' ? 'Permission refusée' : 'Erreur micro';
      this.active = false;
      return false;
    }
  }

  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.analyser = null;
    this.dataArray = null;
    this.active = false;
    this.smoothedLevel = 0;
    this.status = 'Inactif';
  }

  getLevel() {
    if (!this.active || !this.analyser || !this.dataArray) {
      return 0;
    }

    this.analyser.getByteTimeDomainData(this.dataArray);
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / this.dataArray.length);
    const boosted = Math.min(1, rms * 5.6);
    this.smoothedLevel = this.smoothedLevel * 0.78 + boosted * 0.22;
    return this.smoothedLevel;
  }

  getStatus() {
    return this.status;
  }

  isActive() {
    return this.active;
  }
}

class BrowserSpeechLoop {
  constructor({ onInterim, onFinal, onState, onError } = {}) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    this.supportsRecognition = Boolean(Recognition);
    this.recognition = this.supportsRecognition ? new Recognition() : null;
    this.onInterim = onInterim || (() => {});
    this.onFinal = onFinal || (() => {});
    this.onState = onState || (() => {});
    this.onError = onError || (() => {});
    this.active = false;
    this.status = this.supportsRecognition ? 'Reconnaissance prête' : 'Reconnaissance indisponible';
    this.speaking = false;
    this.currentUtterance = null;

    if (this.recognition) {
      this.recognition.lang = 'fr-FR';
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.bindRecognitionEvents();
    }
  }

  bindRecognitionEvents() {
    this.recognition.onstart = () => {
      this.status = 'Écoute active';
      this.onState('listening');
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim();
        if (!transcript) continue;
        if (event.results[i].isFinal) finalText += `${transcript} `;
        else interim += `${transcript} `;
      }

      this.onInterim(interim.trim());
      if (finalText.trim()) {
        this.onFinal(finalText.trim());
      }
    };

    this.recognition.onerror = (event) => {
      this.status = event.error === 'not-allowed' ? 'Permission refusée' : `Erreur: ${event.error}`;
      this.onError(this.status);
    };

    this.recognition.onend = () => {
      if (this.active && !this.speaking) {
        try {
          this.recognition.start();
        } catch (error) {
          this.status = 'Redémarrage impossible';
          this.onError(error?.message || this.status);
        }
      } else if (!this.active) {
        this.status = 'Inactif';
      }
    };
  }

  startListening() {
    if (!this.supportsRecognition) return false;
    this.active = true;
    this.status = 'Activation…';
    try {
      this.recognition.start();
      return true;
    } catch (_error) {
      return false;
    }
  }

  stopListening() {
    this.active = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_error) {
        // ignore browser quirks
      }
    }
    this.status = 'Inactif';
  }

  speak(text, { onStart, onEnd } = {}) {
    if (!('speechSynthesis' in window)) {
      if (onStart) onStart();
      const fallbackDuration = Math.min(7000, Math.max(1600, text.length * 38));
      setTimeout(() => onEnd && onEnd(), fallbackDuration);
      return;
    }

    window.speechSynthesis.cancel();
    this.speaking = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.96;
    utterance.pitch = 0.72;
    utterance.volume = 0.95;

    utterance.onstart = () => {
      this.status = 'Synthèse vocale';
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.speaking = false;
      this.status = this.active ? 'Écoute active' : 'Inactif';
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      this.speaking = false;
      this.status = 'Erreur synthèse';
      if (onEnd) onEnd();
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  cancelSpeech() {
    this.speaking = false;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  getStatus() {
    return this.status;
  }
}
