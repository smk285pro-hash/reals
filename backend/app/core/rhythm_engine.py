from __future__ import annotations

from dataclasses import dataclass, field
import logging
from pathlib import Path
from typing import List, Tuple

import librosa
import numpy as np
import scipy.signal
import scipy.stats
import soundfile as sf

from app.core.config import SAMPLE_RATE
from app.core.schemas import BeatPoint

logger = logging.getLogger(__name__)


@dataclass
class RhythmResult:
    beats: List[BeatPoint]
    bpm: float
    time_signature: str
    warnings: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 1. IMPROVED TEMPO ESTIMATION — Autocorrelation + Octave Correction
# ---------------------------------------------------------------------------

def _estimate_tempo_robust(
    onset_env: np.ndarray,
    sr: int,
    hop_length: int = 512,
) -> float:
    """Robust tempo estimation using autocorrelation with octave correction.

    Unlike librosa.beat.beat_track which uses a single dynamic-programming
    search, autocorrelation is more stable across diverse musical genres and
    less prone to half/double-tempo errors.

    Returns a single BPM value in [40, 240].
    """
    onset_env = onset_env.ravel()
    ac = librosa.autocorrelate(onset_env, max_size=len(onset_env) // 2)

    # Only consider lags corresponding to 40-240 BPM
    min_lag = int((60.0 / 240.0) * sr / hop_length)
    max_lag = int((60.0 / 40.0) * sr / hop_length)

    if max_lag >= len(ac):
        max_lag = len(ac) - 1

    if min_lag >= max_lag:
        return 120.0  # safe fallback

    ac_slice = ac[min_lag:max_lag]
    if len(ac_slice) == 0:
        return 120.0

    peak_idx = int(np.argmax(ac_slice))
    best_lag = min_lag + peak_idx
    tempo_est = 60.0 / (best_lag * hop_length / sr)

    # Octave correction: check if 2x or 0.5x has stronger autocorrelation
    candidates = [
        tempo_est,
        tempo_est / 2.0,
        tempo_est * 2.0,
        tempo_est / 1.5,
        tempo_est * 1.5,
    ]

    best_tempo = tempo_est
    best_energy = 0.0

    for cand in candidates:
        if cand < 40.0 or cand > 240.0:
            continue
        cand_lag = int((60.0 / cand) * sr / hop_length)
        if min_lag <= cand_lag < max_lag:
            energy = float(ac[cand_lag])
            # Also check harmonics
            for mult in [2, 3, 4]:
                h_lag = cand_lag * mult
                if h_lag < len(ac):
                    energy += 0.15 * float(ac[h_lag])
            if energy > best_energy:
                best_energy = energy
                best_tempo = cand

    # Guard: clamp to valid range
    if best_tempo <= 0 or np.isnan(best_tempo) or best_tempo > 300:
        return 120.0
    return float(best_tempo)


# ---------------------------------------------------------------------------
# 2. MULTI-BAND ONSET DETECTION
# ---------------------------------------------------------------------------

def _multi_band_onset_strength(
    audio: np.ndarray,
    sr: int = SAMPLE_RATE,
    hop_length: int = 512,
) -> np.ndarray:
    """Compute onset strength from multiple frequency bands.

    Returns a fused onset envelope that captures transients across bass,
    mid, and high ranges. Falls back to standard onset_strength if the
    multi-band approach produces degenerate results.
    """
    # Standard onset as baseline (always reliable)
    onset_std = librosa.onset.onset_strength(
        y=audio, sr=sr, hop_length=hop_length, center=True,
    )

    # Multi-band augment: compute separate onsets per frequency band
    # using fmin/fmax to isolate each band
    bands = [
        (20.0, 250.0, 0.45),     # Sub-bass / kick
        (250.0, 2000.0, 0.35),   # Mid / snare, instruments
        (2000.0, 8000.0, 0.20),  # High / hi-hats, cymbals
    ]

    band_onsets = []
    for fmin, fmax, w in bands:
        onset = librosa.onset.onset_strength(
            y=audio, sr=sr, hop_length=hop_length,
            fmin=fmin, fmax=fmax, center=True,
        )
        if np.std(onset) > 1e-8:
            onset = onset / np.std(onset)
        band_onsets.append(onset * w)

    combined = np.sum(band_onsets, axis=0)

    # Sanity check: if multi-band produces degenerate output, fall back
    if np.std(combined) < 1e-8 or len(combined) < 2:
        return onset_std

    # Blend with standard onset (30% standard, 70% multi-band)
    result = 0.3 * onset_std + 0.7 * combined
    if np.std(result) > 1e-8:
        result = result / np.std(result)

    return result


# ---------------------------------------------------------------------------
# 3. DYNAMIC PROGRAMMING BEAT TRACKING
# ---------------------------------------------------------------------------

def _dp_beat_track(
    onset_env: np.ndarray,
    bpm: float,
    sr: int = SAMPLE_RATE,
    hop_length: int = 512,
    tightness: float = 400.0,
) -> np.ndarray:
    """Dynamic programming beat tracking with tempo-aware transition cost.

    Standard librosa.beat.beat_track uses a fixed transition cost.  This
    implementation uses the estimated global BPM as a prior, which produces
    beat positions that are more consistent with the true tempo and less
    likely to drift or insert spurious beats.
    """
    # Convert onset envelope to log-likelihood
    onset_env = onset_env.ravel()
    onset_env = np.maximum(onset_env, 1e-8)
    # Center the log-score on the mean onset strength: raw log-probabilities are
    # always <= 0, which makes longer beat chains accumulate ever-more-negative
    # scores and biases the DP toward degenerate single-beat paths.
    log_prob = np.log(onset_env / np.mean(onset_env))

    n_frames = len(log_prob)
    beat_interval = (60.0 / bpm) * sr / hop_length

    # DP table: best log-probability to reach frame i
    dp = np.full(n_frames, -np.inf)
    prev = np.full(n_frames, -1, dtype=int)  # -1 = chain start sentinel

    # Initialize from first 10% of frames
    init_end = max(1, n_frames // 10)
    dp[:init_end] = log_prob[:init_end]

    # Transition cost: penalise deviation from expected beat interval
    for i in range(init_end, n_frames):
        # Search window: from 0.5x to 2x the expected beat interval
        lo = max(0, int(i - beat_interval * 2.0))
        hi = max(lo + 1, int(i - beat_interval * 0.5))

        if lo >= hi:
            dp[i] = log_prob[i] + dp[i - 1]
            prev[i] = i - 1
            continue

        # Gaussian transition cost centered on expected interval
        delta = np.arange(lo, hi, dtype=np.float64)
        transition_cost = -tightness * (np.log((i - delta) / beat_interval)) ** 2

        scores = dp[lo:hi] + transition_cost
        best_idx = int(np.argmax(scores))
        dp[i] = log_prob[i] + scores[best_idx]
        prev[i] = lo + best_idx

    # Backtrack to find beat frames (sentinel -1 terminates the chain so the
    # first beat is never dropped)
    beats: List[int] = []
    idx = int(np.argmax(dp))
    while idx != -1 and len(beats) < 2000:
        beats.append(idx)
        idx = int(prev[idx])

    beats.reverse()
    beat_frames = np.array(beats, dtype=int)

    # Convert frames to time
    beat_times = beat_frames.astype(np.float64) * hop_length / sr

    return beat_times


# ---------------------------------------------------------------------------
# 4. IMPROVED DOWNBEAT DETECTION — Multi-Feature Fusion
# ---------------------------------------------------------------------------

def _detect_downbeats_fused(
    audio: np.ndarray,
    beat_times: np.ndarray,
    bpm: float,
    sr: int = SAMPLE_RATE,
) -> Tuple[str, List[bool]]:
    """Fuse multiple features for robust downbeat detection.

    Features:
      a) Low-frequency energy contrast (sub-150 Hz)
      b) Spectral flux (broadband onset strength at beat positions)
      c) Harmonic change (chroma difference across beats — chord changes
         often land on downbeats)

    Each feature votes for the best meter/offset; the combined score
    determines the final time signature and downbeat mask.
    """
    n_beats = len(beat_times)
    if n_beats < 4:
        return "4/4", [i == 0 for i in range(n_beats)]

    hop_length = 512
    candidate_meters = [4, 3, 6, 2]

    # ---- Feature A: Low-frequency energy (extended range: sub-150 Hz) ----
    nyquist = sr / 2.0
    b_low, a_low = scipy.signal.butter(4, min(150.0 / nyquist, 0.99), btype="low")
    low_filtered = scipy.signal.filtfilt(b_low, a_low, audio)
    low_power = np.square(low_filtered)

    n_samples = len(low_power)
    low_energies = np.zeros(n_beats, dtype=np.float64)
    for i in range(n_beats):
        s = int(beat_times[i] * sr)
        e = int(beat_times[i + 1] * sr) if i + 1 < n_beats else int((beat_times[i] + 60.0 / bpm) * sr)
        s = max(0, min(s, n_samples - 1))
        e = max(s + 1, min(e, n_samples))
        low_energies[i] = float(np.mean(low_power[s:e]))

    if np.std(low_energies) > 1e-6:
        low_feat = (low_energies - np.mean(low_energies)) / np.std(low_energies)
    else:
        low_feat = np.zeros_like(low_energies)

    # ---- Feature B: Spectral flux at beat positions ----
    S = np.abs(librosa.feature.melspectrogram(
        y=audio, sr=sr, hop_length=hop_length, n_mels=64, fmax=8000,
    ))
    flux = np.zeros(len(S.T), dtype=np.float64)
    for i in range(1, len(S.T)):
        diff = S[:, i] - S[:, i - 1]
        flux[i] = np.sum(np.maximum(diff, 0))

    flux_at_beats = np.zeros(n_beats, dtype=np.float64)
    for i, bt in enumerate(beat_times):
        frame_idx = int(bt * sr / hop_length)
        frame_idx = max(0, min(frame_idx, len(flux) - 1))
        flux_at_beats[i] = flux[frame_idx]

    if np.std(flux_at_beats) > 1e-6:
        flux_feat = (flux_at_beats - np.mean(flux_at_beats)) / np.std(flux_at_beats)
    else:
        flux_feat = np.zeros_like(flux_at_beats)

    # ---- Feature C: Harmonic change (chroma difference) ----
    chroma = librosa.feature.chroma_cqt(
        y=audio, sr=sr, hop_length=hop_length, n_chroma=12,
    )
    chroma_diff = np.zeros(len(chroma.T), dtype=np.float64)
    for i in range(1, len(chroma.T)):
        chroma_diff[i] = np.linalg.norm(chroma[:, i] - chroma[:, i - 1])

    chroma_at_beats = np.zeros(n_beats, dtype=np.float64)
    for i, bt in enumerate(beat_times):
        frame_idx = int(bt * sr / hop_length)
        frame_idx = max(0, min(frame_idx, len(chroma_diff) - 1))
        chroma_at_beats[i] = chroma_diff[frame_idx]

    if np.std(chroma_at_beats) > 1e-6:
        chroma_feat = (chroma_at_beats - np.mean(chroma_at_beats)) / np.std(chroma_at_beats)
    else:
        chroma_feat = np.zeros_like(chroma_at_beats)

    # ---- Fused scoring across meters and offsets ----
    combined_feat = low_feat + flux_feat + chroma_feat

    best_k = 4
    best_offset = 0
    best_score = -1e9

    for k in candidate_meters:
        if n_beats < k * 2:
            continue
        # Score each meter on COMPLETE bars only so every offset competes with
        # the same number of downbeats (otherwise truncated final bars bias
        # the offset vote toward whichever offset keeps more downbeats).
        usable = (n_beats // k) * k
        feat_trim = combined_feat[:usable]
        for offset in range(k):
            down_idx = np.arange(offset, usable, k)
            non_idx = np.setdiff1d(np.arange(usable), down_idx)

            down_avg = float(np.mean(feat_trim[down_idx]))
            non_avg = float(np.mean(feat_trim[non_idx])) if len(non_idx) > 0 else 0.0
            contrast = down_avg - non_avg

            # Light prior bias for 4/4 (most common)
            prior = 0.10 if k == 4 else 0.0
            score = contrast + prior

            if score > best_score:
                best_score = score
                best_k = k
                best_offset = offset

    sig_map = {4: "4/4", 3: "3/4", 6: "6/8", 2: "2/4"}
    time_signature = sig_map.get(best_k, "4/4")

    downbeat_mask = [((i - best_offset) % best_k == 0) for i in range(n_beats)]

    return time_signature, downbeat_mask


# ---------------------------------------------------------------------------
# 5. REFINED LIBROSA FALLBACK (IMPROVED)
# ---------------------------------------------------------------------------

def _librosa_fallback_rhythm(
    audio: np.ndarray,
    mix_mono: np.ndarray,
) -> Tuple[List[BeatPoint], float, str]:
    """Improved fallback rhythm analysis using:
    - Multi-band onset detection
    - Robust autocorrelation tempo estimation
    - Proven librosa beat tracking (with corrected tempo)
    - Multi-feature downbeat detection
    """
    hop_length = 512

    # 5a. Multi-band onset strength for robust tempo estimation
    onset_env = _multi_band_onset_strength(audio, sr=SAMPLE_RATE, hop_length=hop_length)

    # 5b. Robust tempo estimation via autocorrelation
    bpm = _estimate_tempo_robust(onset_env, sr=SAMPLE_RATE, hop_length=hop_length)

    # Also compute BPM from mix for comparison
    mix_bpm = bpm
    if len(mix_mono) > 0:
        mix_onset = _multi_band_onset_strength(
            mix_mono, sr=SAMPLE_RATE, hop_length=hop_length,
        )
        mix_bpm = _estimate_tempo_robust(mix_onset, sr=SAMPLE_RATE, hop_length=hop_length)

    # If drum stem autocorrelation is suspect (too slow for typical music),
    # prefer the mix BPM which is more reliable
    if bpm < 70.0 and mix_bpm > 70.0:
        bpm = mix_bpm
        onset_env = mix_onset

    bpm = round(bpm, 1)

    if bpm <= 0 or np.isnan(bpm):
        bpm = 120.0

    # 5c. Beat tracking using librosa's proven DP with the corrected tempo
    tempo_val, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env,
        sr=SAMPLE_RATE,
        hop_length=hop_length,
        start_bpm=bpm,
        tightness=100,
        trim=False,
        units="time",
    )

    beat_times = np.asarray(beat_frames, dtype=np.float64)

    # Fallback to mix if beat count is too small
    if len(beat_times) < 8 and len(mix_mono) > 0:
        _, mix_beat_frames = librosa.beat.beat_track(
            onset_envelope=mix_onset,
            sr=SAMPLE_RATE,
            hop_length=hop_length,
            start_bpm=mix_bpm,
            tightness=100,
            trim=False,
            units="time",
        )
        if len(mix_beat_frames) > len(beat_times):
            beat_times = np.asarray(mix_beat_frames, dtype=np.float64)
            audio = mix_mono
            bpm = round(mix_bpm, 1)

    if len(beat_times) < 2:
        raise ValueError("Không phát hiện được nhịp")

    # 5d. Re-estimate BPM from beat intervals for accuracy, with octave guard
    diffs = np.diff(beat_times)
    valid_diffs = diffs[diffs > 0.15]
    if len(valid_diffs) >= 2:
        bpm_from_intervals = float(np.median(60.0 / valid_diffs))
        ratio = bpm_from_intervals / max(bpm, 1.0)
        if 0.7 <= ratio <= 1.3:
            bpm = round(bpm_from_intervals, 1)
        elif 0.4 <= ratio <= 0.6:
            # Half tempo detected — autocorrelation is likely correct (double)
            bpm = round(bpm_from_intervals * 2.0, 1)
        elif 1.8 <= ratio <= 2.2:
            # Double tempo detected — autocorrelation is likely correct (half)
            bpm = round(bpm_from_intervals / 2.0, 1)

    # 5e. Multi-feature downbeat detection
    time_signature, downbeat_mask = _detect_downbeats_fused(
        audio, beat_times, bpm, sr=SAMPLE_RATE,
    )

    # 5f. Build beat points
    beats: List[BeatPoint] = []
    for i, t in enumerate(beat_times):
        beats.append(BeatPoint(
            timestamp=round(float(t), 4),
            beat_number=i + 1,
            is_downbeat=bool(downbeat_mask[i]),
        ))

    return beats, bpm, time_signature


# ---------------------------------------------------------------------------
# 6. MAIN ANALYZE RHYTHM — Orchestrator
# ---------------------------------------------------------------------------

def analyze_rhythm(drums_path: Path, mono_mix_path: Path) -> RhythmResult:
    """Analyze rhythm with AI BeatNet DBN model if available, otherwise improved DSP."""
    warnings: List[str] = []

    # ---- Primary AI/ML Path: BeatNet ----
    target_path = drums_path if drums_path.exists() else mono_mix_path
    if target_path.exists():
        try:
            from app.core.ml_backends import run_beatnet
            beatnet_res = run_beatnet(target_path)

            if beatnet_res is not None and len(beatnet_res) >= 8:
                beat_times = beatnet_res[:, 0]
                beat_positions = beatnet_res[:, 1].astype(int)

                diffs = np.diff(beat_times)
                valid_diffs = diffs[diffs > 0.15]

                # Relaxed stability threshold: 0.35 → 0.50
                # Many valid tracks have moderate tempo variation (ritardando, groove)
                if len(valid_diffs) >= 4:
                    inst_bpms = 60.0 / valid_diffs
                    bpm_median = float(np.median(inst_bpms))
                    bpm_std_rel = float(np.std(inst_bpms) / (bpm_median + 1e-6))

                    if bpm_std_rel <= 0.50 and 30.0 <= bpm_median <= 300.0:
                        # Determine meter from BeatNet downbeat cycle
                        downbeat_positions = np.where(beat_positions == 1)[0]
                        if len(downbeat_positions) >= 2:
                            bar_lengths = np.diff(downbeat_positions)
                            mode_meter = int(scipy.stats.mode(bar_lengths, keepdims=False)[0])
                        else:
                            mode_meter = 4

                        sig_map = {4: "4/4", 3: "3/4", 6: "6/8", 2: "2/4"}
                        if mode_meter in sig_map:
                            time_signature = sig_map[mode_meter]
                        else:
                            # Unusual meter (5/7 beats per bar): keep BeatNet's
                            # beat times but flag the telemetry mismatch instead
                            # of silently claiming 4/4.
                            time_signature = f"{mode_meter}/4"
                            warnings.append(
                                f"BeatNet phát hiện meter bất thường ({mode_meter} phách/bar)"
                            )

                        beats: List[BeatPoint] = []
                        for i in range(len(beat_times)):
                            is_downbeat = (beat_positions[i] == 1)
                            beats.append(BeatPoint(
                                timestamp=round(float(beat_times[i]), 4),
                                beat_number=i + 1,
                                is_downbeat=bool(is_downbeat),
                            ))

                        return RhythmResult(
                            beats=beats,
                            bpm=round(bpm_median, 1),
                            time_signature=time_signature,
                            warnings=warnings,
                        )
                    else:
                        warnings.append(
                            f"BeatNet tempo variance {bpm_std_rel:.2f} > 0.50, "
                            "chuyển sang Librosa DSP tracking cải tiến"
                        )
        except Exception as exc:
            logger.info("BeatNet inference failed: %s, falling back to improved Librosa.", exc)
            warnings.append(f"BeatNet fallback: {exc}")

    # ---- Secondary DSP Path: Improved Librosa ----
    audio: np.ndarray
    if drums_path.exists():
        audio, _ = sf.read(str(drums_path), dtype="float32")
    elif mono_mix_path.exists():
        audio, _ = sf.read(str(mono_mix_path), dtype="float32")
    else:
        raise FileNotFoundError(f"Neither {drums_path} nor {mono_mix_path} exists.")

    if audio.ndim > 1:
        audio = np.mean(audio, axis=-1)

    mix_audio = np.array([], dtype=np.float32)
    if mono_mix_path.exists():
        mix_data, _ = sf.read(str(mono_mix_path), dtype="float32")
        mix_audio = np.mean(mix_data, axis=-1) if mix_data.ndim > 1 else mix_data

    beats_fallback, bpm_fallback, time_sig_fallback = _librosa_fallback_rhythm(
        audio, mix_audio,
    )

    return RhythmResult(
        beats=beats_fallback,
        bpm=bpm_fallback,
        time_signature=time_sig_fallback,
        warnings=warnings,
    )