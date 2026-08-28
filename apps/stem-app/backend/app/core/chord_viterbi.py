from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple
import numpy as np
import scipy.special

from app.core.bass_engine import BassNote
from app.core.config import CHORD_MIN_DURATION, VITERBI_GAMMA, VITERBI_SELF
from app.core.harmony_engine import HarmonyFeatures
from app.core.key_detector import PITCH_CLASSES, detect_key
from app.core.schemas import ChordSegment

# Exact chord interval definitions (semitones from root)
QUALITY_INTERVALS: Dict[str, List[int]] = {
    "maj": [0, 4, 7],
    "min": [0, 3, 7],
    "7": [0, 4, 7, 10],
    "maj7": [0, 4, 7, 11],
    "min7": [0, 3, 7, 10],
    "dim": [0, 3, 6],
    "dim7": [0, 3, 6, 9],
    "m7b5": [0, 3, 6, 10],
    "aug": [0, 4, 8],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "6": [0, 4, 7, 9],
    "9": [0, 2, 4, 7, 10],
    "add9": [0, 2, 4, 7],
}

QUALITY_DISPLAY: Dict[str, str] = {
    "maj": "",
    "min": "m",
    "7": "7",
    "maj7": "maj7",
    "min7": "m7",
    "dim": "dim",
    "dim7": "dim7",
    "m7b5": "m7b5",
    "aug": "aug",
    "sus2": "sus2",
    "sus4": "sus4",
    "6": "6",
    "9": "9",
    "add9": "add9",
}

QUALITIES = list(QUALITY_INTERVALS.keys())
N_QUALITIES = len(QUALITIES)  # 14
N_STATES = 12 * N_QUALITIES + 1  # 168 chords + 1 'N' state = 169
N_STATE = 168

# Fixed emission logit for the 'N' (no chord) state. Real-world chroma is always
# smeared (harmonic overtones add fifths, CQT leakage), so a uniform template
# cosine competes with — and usually beats — genuine chord templates. N must
# only win when NO chord template matches at all (silence, pure percussion).
NO_CHORD_LOGIT = 0.30

# Logit penalty per chord tone beyond a triad: extended chords (6/7/9/add9...)
# only deserve to win when their extension notes carry REAL chroma evidence,
# not mere harmonic-overtone leakage (an A leaking from Am chroma would
# otherwise flip every Am into C6).
QUALITY_EXT_BIAS = 0.08


@dataclass
class DecodeResult:
    chords: List[ChordSegment]
    master_key: str
    scale_mode: str


def _build_state_templates() -> np.ndarray:
    """Construct 169 state pitch-class templates (12 roots * 14 qualities + 'N')."""
    templates = np.zeros((N_STATES, 12), dtype=np.float32)

    for r in range(12):
        for q_idx, q_name in enumerate(QUALITIES):
            state_idx = r * N_QUALITIES + q_idx
            intervals = QUALITY_INTERVALS[q_name]
            for interval in intervals:
                templates[state_idx, (r + interval) % 12] = 1.0

            norm = np.linalg.norm(templates[state_idx])
            if norm > 1e-9:
                templates[state_idx] /= norm

    # State 168: 'N' (uniform distributed energy across all pitch classes)
    templates[168, :] = 1.0 / np.sqrt(12.0)
    return templates


TEMPLATES = _build_state_templates()


def _circle_of_fifths_dist(root1: int, root2: int) -> int:
    """Calculate the shortest distance between two pitch classes on the circle of fifths."""
    pos1 = (root1 * 7) % 12
    pos2 = (root2 * 7) % 12
    diff = abs(pos1 - pos2)
    return min(diff, 12 - diff)


def _get_scale_pitch_classes(root_pc: int, mode: str) -> List[int]:
    """Get the active scale degrees for a given musical key and mode."""
    if mode == "major":
        intervals = [0, 2, 4, 5, 7, 9, 11]
    else:  # natural/harmonic minor
        intervals = [0, 2, 3, 5, 7, 8, 10]
    return [(root_pc + inv) % 12 for inv in intervals]


def _build_transition_matrix(master_key: str, scale_mode: str) -> np.ndarray:
    """Build the (169, 169) log-transition probability matrix incorporating circle of fifths and key priors."""
    key_root = PITCH_CLASSES.index(master_key) if master_key in PITCH_CLASSES else 0
    scale_pcs = _get_scale_pitch_classes(key_root, scale_mode)

    log_trans = np.full((N_STATES, N_STATES), -15.0, dtype=np.float64)

    for i in range(N_STATES):
        if i == N_STATE:  # 'N' state
            log_trans[i, N_STATE] = np.log(0.7)
            for j in range(N_STATE):
                log_trans[i, j] = np.log(0.3 / N_STATE)
            continue

        r_i = i // N_QUALITIES
        q_i = i % N_QUALITIES

        for j in range(N_STATES):
            if j == N_STATE:
                # Leaving a tonal state for 'N' must be rare: it only makes
                # sense when emissions collapse (silence / percussion).
                log_trans[i, j] = np.log(0.002)
                continue

            r_j = j // N_QUALITIES
            q_j = j % N_QUALITIES

            if i == j:
                prob = VITERBI_SELF
            elif r_i == r_j:
                prob = 0.06 / (N_QUALITIES - 1)
            else:
                dist = _circle_of_fifths_dist(r_i, r_j)
                decay = VITERBI_GAMMA ** dist
                # Real songs change chords every bar or two — the old base of
                # 0.02 made any chord change costlier than camping on one
                # (or on 'N'), flattening whole progressions into a single
                # segment.
                prob = 0.15 * decay

            # Boost chords whose root belongs to the detected key scale
            if r_j in scale_pcs:
                prob *= 2.0

            log_trans[i, j] = np.log(max(prob, 1e-8))

    # Row normalization using logsumexp
    row_sums = scipy.special.logsumexp(log_trans, axis=1, keepdims=True)
    log_trans -= row_sums
    return log_trans


def decode_chords(
    harmony: HarmonyFeatures,
    bassline: List[BassNote],
    duration: float,
) -> DecodeResult:
    """Decode chord progression using Viterbi decoding over 169 HMM states with post-processing."""
    beat_chroma = harmony.beat_chroma
    beat_times = harmony.beat_times
    n_beats = beat_chroma.shape[0]

    if n_beats == 0:
        return DecodeResult(
            chords=[
                ChordSegment(
                    start=0.0,
                    end=round(duration, 3),
                    chord="N",
                    root="N",
                    bass="N",
                    quality="N",
                    confidence=1.0,
                )
            ],
            master_key="C",
            scale_mode="major",
        )

    # 1. Global Key Detection from average chroma
    avg_chroma = np.mean(beat_chroma, axis=0)
    master_key, scale_mode, _ = detect_key(avg_chroma)

    # 2. Emission Log-Probabilities (Cosine similarity + Log-Softmax with Temperature T=14.0)
    T = 14.0
    cosine_sim = np.dot(beat_chroma, TEMPLATES.T)  # (n_beats, 169)
    emission_logits = cosine_sim * T
    # Penalise extended chord templates unless their extra notes are evidenced
    for q_idx, q_name in enumerate(QUALITIES):
        extra_notes = len(QUALITY_INTERVALS[q_name]) - 3
        if extra_notes > 0:
            emission_logits[:, q_idx::N_QUALITIES] -= QUALITY_EXT_BIAS * extra_notes * T
    # 'N' competes with a fixed floor instead of the uniform-template cosine:
    # smeared-but-tonal chroma must never outrank real chord templates.
    emission_logits[:, N_STATE] = NO_CHORD_LOGIT * T
    emission_log_probs = emission_logits - scipy.special.logsumexp(
        emission_logits, axis=1, keepdims=True
    )
    # Confidence is reported as a softmax over CHORD states only: a softmax
    # over all 169 states (including 14 near-identical quality variants per
    # root) caps even a perfect match at a misleadingly low probability.
    # The full 169-wide softmax is kept for indexing the 'N' state safely.
    emission_probs = scipy.special.softmax(emission_logits, axis=1)
    chord_probs = scipy.special.softmax(emission_logits[:, :N_STATE], axis=1)

    def _state_conf(t_idx: int, state: int) -> float:
        if state == N_STATE:
            return float(emission_probs[t_idx, N_STATE])
        return float(chord_probs[t_idx, state])

    # 3. Transition Matrix
    log_trans = _build_transition_matrix(master_key, scale_mode)

    # 4. Viterbi Dynamic Programming (Pure NumPy)
    V = np.zeros((n_beats, N_STATES), dtype=np.float64)
    backpointers = np.zeros((n_beats, N_STATES), dtype=np.int32)

    # Initial state probabilities (Uniform prior)
    V[0, :] = -np.log(N_STATES) + emission_log_probs[0, :]

    for t in range(1, n_beats):
        prev_scores = V[t - 1, :, None] + log_trans  # (N_STATES, N_STATES)
        best_prev = np.argmax(prev_scores, axis=0)
        V[t, :] = prev_scores[best_prev, np.arange(N_STATES)] + emission_log_probs[t, :]
        backpointers[t, :] = best_prev

    # Traceback best path
    best_path = np.zeros(n_beats, dtype=np.int32)
    best_path[-1] = int(np.argmax(V[-1, :]))
    for t in range(n_beats - 2, -1, -1):
        best_path[t] = backpointers[t + 1, best_path[t + 1]]

    # 5. Raw Segment Aggregation
    raw_segments: List[Tuple[float, float, int, float]] = []
    current_state = int(best_path[0])
    seg_start = float(beat_times[0])
    seg_probs = [_state_conf(0, current_state)]

    for t in range(1, n_beats):
        state = int(best_path[t])
        if state == current_state:
            seg_probs.append(_state_conf(t, state))
        else:
            seg_end = float(beat_times[t])
            raw_segments.append(
                (seg_start, seg_end, current_state, float(np.mean(seg_probs)))
            )
            current_state = state
            seg_start = seg_end
            seg_probs = [_state_conf(t, state)]

    # Final segment
    seg_end = float(beat_times[-1])
    raw_segments.append((seg_start, seg_end, current_state, float(np.mean(seg_probs))))

    # 6. Merge Short Segments (< CHORD_MIN_DURATION) into Neighboring Segments
    merged_segments: List[Tuple[float, float, int, float]] = []
    for seg in raw_segments:
        s_start, s_end, state, conf = seg
        dur = s_end - s_start

        if dur < CHORD_MIN_DURATION and len(merged_segments) > 0:
            # Merge into previous segment
            prev_start, prev_end, prev_state, prev_conf = merged_segments[-1]
            merged_segments[-1] = (prev_start, s_end, prev_state, (prev_conf + conf) / 2.0)
        else:
            merged_segments.append(seg)

    # 7. Convert States to ChordSegment with Slash Chord & Confidence Processing
    chord_segments: List[ChordSegment] = []
    for s_start, s_end, state, conf in merged_segments:
        s_start_r = round(s_start, 3)
        s_end_r = round(s_end, 3)
        conf_r = round(float(np.clip(conf, 0.0, 1.0)), 3)

        if state == N_STATE:
            chord_segments.append(
                ChordSegment(
                    start=s_start_r,
                    end=s_end_r,
                    chord="N",
                    root="N",
                    bass="N",
                    quality="N",
                    confidence=conf_r,
                )
            )
            continue

        r_idx = state // N_QUALITIES
        q_idx = state % N_QUALITIES

        root_name = PITCH_CLASSES[r_idx]
        qual_name = QUALITIES[q_idx]
        display_suffix = QUALITY_DISPLAY[qual_name]
        chord_display = f"{root_name}{display_suffix}"
        bass_name = root_name

        # Slash Chord Detection: Check if a bass note covers > 50% of the segment
        seg_dur = s_end - s_start
        for bn in bassline:
            overlap_start = max(s_start, bn.start)
            overlap_end = min(s_end, bn.end)
            overlap = max(0.0, overlap_end - overlap_start)
            if overlap > 0.5 * seg_dur:
                bn_pc = bn.midi % 12
                if bn_pc != r_idx:
                    detected_bass = PITCH_CLASSES[bn_pc]
                    chord_display = f"{root_name}{display_suffix}/{detected_bass}"
                    bass_name = detected_bass
                break

        chord_segments.append(
            ChordSegment(
                start=s_start_r,
                end=s_end_r,
                chord=chord_display,
                root=root_name,
                bass=bass_name,
                quality=qual_name,
                confidence=conf_r,
            )
        )

    return DecodeResult(
        chords=chord_segments,
        master_key=master_key,
        scale_mode=scale_mode,
    )
