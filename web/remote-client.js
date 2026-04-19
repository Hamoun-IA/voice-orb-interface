class VoiceOrbRemoteClient {
  constructor({ onStatus, onState, onTranscript, onAssistant, onInterim, onEnergy, onPhase, onError, onConnectionChange, onRemoteEvent, onSession } = {}) {
    this.ws = null;
    this.url = '';
    this.connected = false;
    this.connectionState = 'disconnected';
    this.lastEvent = 'Aucun';
    this.sessionId = null;
    this.statusText = 'Non connecté';
    this.onStatus = onStatus || (() => {});
    this.onState = onState || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onAssistant = onAssistant || (() => {});
    this.onInterim = onInterim || (() => {});
    this.onEnergy = onEnergy || (() => {});
    this.onPhase = onPhase || (() => {});
    this.onError = onError || (() => {});
    this.onConnectionChange = onConnectionChange || (() => {});
    this.onRemoteEvent = onRemoteEvent || (() => {});
    this.onSession = onSession || (() => {});
    this.storageKey = 'voice-orb-remote-config';
  }

  loadConfig() {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return { url: '' };
      const parsed = JSON.parse(raw);
      return { url: parsed.url || '' };
    } catch (_error) {
      return { url: '' };
    }
  }

  saveConfig(url) {
    this.url = (url || '').trim();
    window.localStorage.setItem(this.storageKey, JSON.stringify({ url: this.url }));
  }

  getConnectionState() {
    return {
      url: this.url,
      connected: this.connected,
      connectionState: this.connectionState,
      lastEvent: this.lastEvent,
      sessionId: this.sessionId,
      statusText: this.statusText,
    };
  }

  normalizePhase(phase) {
    if (!phase || typeof phase !== 'string') return '';
    return phase.replace(/-/g, '_').trim();
  }

  setConnectionState(nextState, { statusText, phase, lastEvent, sessionId } = {}) {
    this.connectionState = nextState;
    this.connected = nextState === 'connected';

    if (typeof statusText === 'string' && statusText) {
      this.statusText = statusText;
      this.onStatus(statusText);
    }

    if (typeof lastEvent === 'string' && lastEvent) {
      this.lastEvent = lastEvent;
      this.onRemoteEvent(lastEvent);
    }

    if (sessionId !== undefined) {
      this.sessionId = sessionId || null;
      this.onSession(this.sessionId);
    }

    if (phase) {
      this.onPhase(this.normalizePhase(phase));
    }

    this.onConnectionChange(this.getConnectionState());
  }

  connect(url) {
    const nextUrl = (url || this.url || '').trim();
    if (!nextUrl) {
      this.onError('URL VPS manquante');
      this.setConnectionState('error', {
        statusText: 'URL VPS manquante',
        phase: 'remote_error',
        lastEvent: 'configuration invalide',
      });
      return false;
    }

    this.disconnect({ silent: true });
    this.url = nextUrl;
    this.setConnectionState('connecting', {
      statusText: 'Connexion…',
      phase: 'remote_connect',
      lastEvent: 'ouverture websocket',
      sessionId: null,
    });

    try {
      this.ws = new WebSocket(nextUrl);
    } catch (error) {
      const message = `WebSocket invalide: ${error.message}`;
      this.onError(message);
      this.setConnectionState('error', {
        statusText: message,
        phase: 'remote_error',
        lastEvent: 'échec création websocket',
      });
      return false;
    }

    const socket = this.ws;

    socket.addEventListener('open', () => {
      if (this.ws !== socket) return;
      this.setConnectionState('connected', {
        statusText: 'Connecté au VPS',
        phase: 'remote_live',
        lastEvent: 'socket ouverte',
      });
      this.send({ type: 'client_hello', client: 'voice-orb-cockpit', version: 1 });
    });

    socket.addEventListener('message', (event) => {
      if (this.ws !== socket) return;
      this.handleMessage(event.data);
    });

    socket.addEventListener('close', () => {
      if (this.ws === socket) {
        const hadError = this.connectionState === 'error';
        const wasActive = this.connectionState !== 'disconnected';
        this.ws = null;

        if (hadError) {
          this.setConnectionState('error', {
            statusText: this.statusText || 'Erreur de transport WebSocket',
            phase: 'remote_error',
            lastEvent: 'socket fermée après erreur',
            sessionId: null,
          });
          return;
        }

        this.setConnectionState('disconnected', {
          statusText: 'Déconnecté',
          phase: 'standby',
          lastEvent: wasActive ? 'socket fermée' : this.lastEvent,
          sessionId: null,
        });
      }
    });

    socket.addEventListener('error', () => {
      if (this.ws !== socket) return;
      const message = 'Erreur de transport WebSocket';
      this.onError(message);
      this.setConnectionState('error', {
        statusText: message,
        phase: 'remote_error',
        lastEvent: 'erreur websocket',
      });
    });

    return true;
  }

  disconnect({ silent = false } = {}) {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_error) {
        // ignore close races
      }
      this.ws = null;
    }

    if (!silent) {
      this.setConnectionState('disconnected', {
        statusText: 'Déconnecté',
        phase: 'standby',
        lastEvent: 'déconnexion manuelle',
        sessionId: null,
      });
    }
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onError('Transport distant indisponible');
      this.setConnectionState('error', {
        statusText: 'Transport distant indisponible',
        phase: 'remote_error',
        lastEvent: 'envoi refusé',
      });
      return false;
    }

    try {
      this.ws.send(JSON.stringify(payload));
    } catch (error) {
      const message = `Échec envoi WebSocket: ${error.message}`;
      this.onError(message);
      this.setConnectionState('error', {
        statusText: message,
        phase: 'remote_error',
        lastEvent: 'échec envoi websocket',
      });
      return false;
    }

    this.lastEvent = `envoyé: ${payload.type}`;
    this.onRemoteEvent(this.lastEvent);
    this.onConnectionChange(this.getConnectionState());
    return true;
  }

  sendManualText(text) {
    const value = (text || '').trim();
    if (!value) {
      this.onError('Commande texte vide');
      return false;
    }
    return this.send({ type: 'text_command', text: value });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch (_error) {
      this.onError('Message VPS illisible');
      this.setConnectionState('error', {
        statusText: 'Message VPS illisible',
        phase: 'remote_error',
        lastEvent: 'message JSON invalide',
      });
      return;
    }

    const eventLabel = message.type || 'message';
    this.lastEvent = eventLabel;
    this.onRemoteEvent(eventLabel);
    this.onConnectionChange(this.getConnectionState());

    switch (message.type) {
      case 'state':
        if (message.state) this.onState(message.state);
        if (typeof message.energy === 'number') this.onEnergy(message.energy);
        if (message.phase) this.onPhase(this.normalizePhase(message.phase));
        break;
      case 'transcript_user':
        this.onTranscript(message.text || '');
        break;
      case 'transcript_interim':
        this.onInterim(message.text || '');
        break;
      case 'assistant_response':
        this.onAssistant(message.text || '', message.audio_url || '');
        break;
      case 'status':
        if (message.session_id) {
          this.sessionId = message.session_id;
          this.onSession(this.sessionId);
        }
        this.onStatus(message.text || 'Connecté au VPS');
        if (message.phase) this.onPhase(this.normalizePhase(message.phase));
        this.onConnectionChange(this.getConnectionState());
        break;
      default:
        break;
    }
  }
}
