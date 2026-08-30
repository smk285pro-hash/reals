import { fetchStemBuffer } from "./api-client";
import { StemInfo } from "./types";

export interface TrackState {
  volumeDb: number;
  pan: number;
  isMuted: boolean;
  isSolo: boolean;
}

export class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private trackNodes: Map<
    string,
    {
      gainNode: GainNode;
      pannerNode: StereoPannerNode;
      analyserNode: AnalyserNode;
    }
  > = new Map();
  private activeSources: AudioBufferSourceNode[] = [];
  private trackStates: Map<string, TrackState> = new Map();
  private levelScratch: Float32Array<ArrayBuffer> | null = null;

  private _isPlaying: boolean = false;
  private _startCtxTime: number = 0;
  private _startOffset: number = 0;
  private _duration: number = 0;
  private _endingGuard: boolean = false;

  public onEnded?: () => void;
  public onTimeUpdate?: (currentTime: number) => void;

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public async loadStems(
    manifest: Record<string, StemInfo>,
    masterUrl?: string,
    onProgress?: (loadedCount: number, totalCount: number) => void
  ): Promise<void> {
    const ctx = this.ensureContext();
    this.destroySources();
    this.buffers.clear();
    this.trackNodes.clear();
    this.trackStates.clear();

    const stemEntries = Object.entries(manifest);
    const total = stemEntries.length > 0 ? stemEntries.length : (masterUrl ? 1 : 0);
    let loaded = 0;

    if (stemEntries.length > 0) {
      await Promise.all(
        stemEntries.map(async ([stemName, info]) => {
          try {
            const buf = await fetchStemBuffer(info.url, ctx);
            this.buffers.set(stemName, buf);
            if (buf.duration > this._duration) {
              this._duration = buf.duration;
            }
          } catch (err) {
            console.error(`Failed loading stem ${stemName}:`, err);
          } finally {
            loaded += 1;
            onProgress?.(loaded, total);
          }
        })
      );
    } else if (masterUrl) {
      try {
        const buf = await fetchStemBuffer(masterUrl, ctx);
        this.buffers.set("master", buf);
        this._duration = buf.duration;
      } finally {
        loaded += 1;
        onProgress?.(loaded, total);
      }
    }

    if (this.buffers.size === 0) {
      throw new Error("Không tải được tệp âm thanh nào từ máy chủ. Vui lòng thử lại.");
    }

    this.buildAudioGraph();
  }

  private buildAudioGraph(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;

    this.buffers.forEach((_, stemName) => {
      const gainNode = ctx.createGain();
      const pannerNode = ctx.createStereoPanner();
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 512;

      pannerNode.connect(gainNode);
      gainNode.connect(analyserNode);
      analyserNode.connect(this.masterGain!);

      this.trackNodes.set(stemName, {
        gainNode,
        pannerNode,
        analyserNode,
      });

      this.trackStates.set(stemName, {
        volumeDb: 0,
        pan: 0,
        isMuted: false,
        isSolo: false,
      });
    });

    this.recomputeAllGains();
  }

  public play(): void {
    const ctx = this.ensureContext();
    if (this._isPlaying) return;
    if (this.buffers.size === 0 || this._duration <= 0) return;

    this.destroySources();

    const offset = Math.max(0, Math.min(this._startOffset, this._duration));
    if (offset >= this._duration && this._duration > 0) {
      this._startOffset = 0;
    }

    this._startCtxTime = ctx.currentTime;
    this._endingGuard = false;

    this.buffers.forEach((buffer, stemName) => {
      const nodeInfo = this.trackNodes.get(stemName);
      if (!nodeInfo) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = false;
      source.connect(nodeInfo.pannerNode);

      source.onended = () => {
        if (!this._endingGuard && this._isPlaying && this.currentTime >= this._duration - 0.1) {
          this._endingGuard = true;
          this.pause();
          this._startOffset = 0;
          this.onEnded?.();
        }
      };

      this.activeSources.push(source);
    });

    // Phase-locked synchronized start
    const startPos = Math.max(0, Math.min(this._startOffset, this._duration));
    this.activeSources.forEach((source) => {
      source.start(0, startPos);
    });

    this._isPlaying = true;
  }

  public pause(): void {
    if (!this._isPlaying) return;
    this._startOffset = this.currentTime;
    this.destroySources();
    this._isPlaying = false;
  }

  public seek(targetTime: number): void {
    const clampedTime = Math.max(0, Math.min(targetTime, this._duration));
    const wasPlaying = this._isPlaying;

    if (wasPlaying) {
      this.pause();
    }
    this._startOffset = clampedTime;
    if (wasPlaying) {
      this.play();
    }
    this.onTimeUpdate?.(clampedTime);
  }

  public stop(): void {
    this.pause();
    this._startOffset = 0;
    this.onTimeUpdate?.(0);
  }

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  public get duration(): number {
    return this._duration;
  }

  public get currentTime(): number {
    if (!this.ctx || !this._isPlaying) {
      return this._startOffset;
    }
    const elapsed = this.ctx.currentTime - this._startCtxTime;
    return Math.min(this._duration, this._startOffset + elapsed);
  }

  public setTrackVolume(stem: string, db: number): void {
    const state = this.trackStates.get(stem);
    if (!state) return;
    state.volumeDb = Math.max(-60, Math.min(6, db));
    this.recomputeAllGains();
  }

  public setTrackPan(stem: string, pan: number): void {
    const state = this.trackStates.get(stem);
    const nodeInfo = this.trackNodes.get(stem);
    if (!state || !nodeInfo || !this.ctx) return;

    state.pan = Math.max(-1, Math.min(1, pan));
    nodeInfo.pannerNode.pan.setTargetAtTime(state.pan, this.ctx.currentTime, 0.01);
  }

  public setTrackMute(stem: string, isMuted: boolean): void {
    const state = this.trackStates.get(stem);
    if (!state) return;
    state.isMuted = isMuted;
    this.recomputeAllGains();
  }

  public setTrackSolo(stem: string, isSolo: boolean): void {
    const state = this.trackStates.get(stem);
    if (!state) return;
    state.isSolo = isSolo;
    this.recomputeAllGains();
  }

  public recomputeAllGains(): void {
    if (!this.ctx) return;

    let hasAnySolo = false;
    this.trackStates.forEach((st) => {
      if (st.isSolo) hasAnySolo = true;
    });

    this.trackStates.forEach((state, stemName) => {
      const nodeInfo = this.trackNodes.get(stemName);
      if (!nodeInfo) return;

      let effectiveGain = 0;
      if (state.isMuted) {
        effectiveGain = 0;
      } else if (hasAnySolo) {
        effectiveGain = state.isSolo ? Math.pow(10, state.volumeDb / 20) : 0;
      } else {
        effectiveGain = state.volumeDb <= -60 ? 0 : Math.pow(10, state.volumeDb / 20);
      }

      nodeInfo.gainNode.gain.setTargetAtTime(effectiveGain, this.ctx!.currentTime, 0.01);
    });
  }

  public getLevel(stem: string): number {
    const nodeInfo = this.trackNodes.get(stem);
    if (!nodeInfo) return -60;

    const fftSize = nodeInfo.analyserNode.fftSize;
    if (!this.levelScratch || this.levelScratch.length !== fftSize) {
      this.levelScratch = new Float32Array(fftSize);
    }
    const data = this.levelScratch;
    nodeInfo.analyserNode.getFloatTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    if (rms <= 0.0001) return -60;
    const db = 20 * Math.log10(rms);
    return Math.max(-60, Math.min(6, db));
  }

  public getTrackState(stem: string): TrackState | undefined {
    return this.trackStates.get(stem);
  }

  private destroySources(): void {
    this._endingGuard = true;
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Node might have already finished
      }
      try {
        source.disconnect();
      } catch {
        // Node disconnected
      }
    });
    this.activeSources = [];
  }

  public destroy(): void {
    this.destroySources();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.buffers.clear();
    this.trackNodes.clear();
    this.trackStates.clear();
    this._isPlaying = false;
    this._startOffset = 0;
    this._duration = 0;
  }
}

export const audioEngine = new StudioAudioEngine();
