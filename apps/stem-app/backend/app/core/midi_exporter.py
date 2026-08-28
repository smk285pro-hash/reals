from __future__ import annotations

from pathlib import Path
from typing import List

import pretty_midi

from app.core.bass_engine import BassNote
from app.core.chord_viterbi import QUALITY_INTERVALS
from app.core.config import SETTINGS
from app.core.key_detector import PITCH_CLASSES
from app.core.schemas import BeatPoint, ChordSegment


def export_midi(
    task_id: str,
    chords: List[ChordSegment],
    bassline: List[BassNote],
    beats: List[BeatPoint],
    bpm: float,
) -> Path:
    """Export synchronized 3-track Standard MIDI File (SMF-1) for Chords, Bassline, and Metronome Click."""
    out_dir = SETTINGS.export_dir / task_id
    out_dir.mkdir(parents=True, exist_ok=True)
    midi_path = out_dir / "multi_track.mid"

    initial_tempo = int(round(bpm)) if bpm > 0 else 120
    pm = pretty_midi.PrettyMIDI(initial_tempo=initial_tempo)

    # Track 1: Chords (Acoustic Grand Piano, Program 0)
    chord_inst = pretty_midi.Instrument(program=0, is_drum=False, name="Chords")
    for seg in chords:
        if seg.chord == "N" or seg.root not in PITCH_CLASSES:
            continue
        if seg.end <= seg.start:
            continue  # guard against zero/negative-length segments

        root_pc = PITCH_CLASSES.index(seg.root)
        base_pitch = 60 + root_pc  # Octave 4 (Middle C)
        intervals = QUALITY_INTERVALS.get(seg.quality, [0, 4, 7])

        # Slash bass: place the inversion bass note one octave below middle C
        # so voicings sit above it (e.g. G/B -> B2 under a G triad).
        if seg.bass in PITCH_CLASSES:
            bass_pc = PITCH_CLASSES.index(seg.bass)
            if bass_pc != root_pc:
                bass_pitch = max(21, min(108, 48 + bass_pc))
                chord_inst.notes.append(
                    pretty_midi.Note(
                        velocity=90,
                        pitch=int(bass_pitch),
                        start=float(seg.start),
                        end=float(seg.end),
                    )
                )

        # Limit to 5 chord voicing notes
        selected_intervals = intervals[:5]
        for interval in selected_intervals:
            pitch = base_pitch + interval
            pitch = max(21, min(108, pitch))  # Standard 88-key piano range
            note = pretty_midi.Note(
                velocity=80,
                pitch=int(pitch),
                start=float(seg.start),
                end=float(seg.end),
            )
            chord_inst.notes.append(note)

    pm.instruments.append(chord_inst)

    # Track 2: Bassline (Electric Bass finger, Program 33)
    bass_inst = pretty_midi.Instrument(program=33, is_drum=False, name="Bassline")
    for bn in bassline:
        if bn.end <= bn.start:
            continue  # guard against zero/negative-length notes

        pitch = int(bn.midi)
        # Transpose into standard bass guitar octave 2 (E1 ~ 28 to F3 ~ 53)
        while pitch > 53:
            pitch -= 12
        while pitch < 28:
            pitch += 12

        note = pretty_midi.Note(
            velocity=95,
            pitch=int(pitch),
            start=float(bn.start),
            end=float(bn.end),
        )
        bass_inst.notes.append(note)

    pm.instruments.append(bass_inst)

    # Track 3: Beat Click (Standard Drum channel / is_drum=True)
    click_inst = pretty_midi.Instrument(program=0, is_drum=True, name="Beat Click")
    for bp in beats:
        if bp.is_downbeat:
            pitch = 34  # Metronome Bell
            velocity = 115
        else:
            pitch = 37  # Side Stick
            velocity = 100

        note = pretty_midi.Note(
            velocity=velocity,
            pitch=pitch,
            start=float(bp.timestamp),
            end=float(bp.timestamp + 0.05),
        )
        click_inst.notes.append(note)

    pm.instruments.append(click_inst)

    pm.write(str(midi_path))
    return midi_path
