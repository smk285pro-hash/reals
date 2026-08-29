from __future__ import annotations

import asyncio
import gc
from pathlib import Path
from typing import Dict

import numpy as np
import soundfile as sf

from app.core.audio_processor import get_duration
from app.core.bass_engine import extract_bassline
from app.core.chord_viterbi import decode_chords
from app.core.config import SAMPLE_RATE, SETTINGS
from app.core.harmony_engine import extract_harmony
from app.core.midi_exporter import export_midi
from app.core.rhythm_engine import analyze_rhythm
from app.core.schemas import (
    DeepAnalysisResponse,
    STEM_COLORS,
    StemInfo,
    StemManifest,
    TelemetryData,
)
from app.core.stem_extractor import extract_stems
from app.core.task_manager import TaskManager


class UnifiedDeepAnalyzer:
    """End-to-end multi-stage DSP deep audio analysis orchestrator."""

    def __init__(self, task_id: str, audio_path: Path, stem_mode: str = "4") -> None:
        self.task_id = task_id
        self.audio_path = audio_path
        self.stem_mode = stem_mode if stem_mode in ("2", "4", "6", "8") else "4"

    async def run(self, tm: TaskManager) -> None:
        """Execute the full deep analysis pipeline with real-time stage & percentage tracking."""
        try:
            # Stage 1: 5% Normalize Input Audio
            tm.update(self.task_id, status="RUNNING", stage="Chuẩn hóa audio đầu vào", percent=5)
            master_dir = SETTINGS.upload_dir / self.task_id
            master_stereo = master_dir / "master_44k_stereo.wav"
            master_mono = master_dir / "master_mono.wav"

            if not master_stereo.exists():
                raise FileNotFoundError(f"Master audio not found for task {self.task_id}")

            # Stage 2: 10% - 45% Stem Separation
            tm.update(
                self.task_id,
                stage=f"Tách nguồn âm AI (mode {self.stem_mode})...",
                percent=10,
            )

            def _stem_progress_cb(sub_pct: float) -> None:
                # Interpolate Demucs progress from 10% to 42%
                overall_pct = 10 + int(sub_pct * 0.32)
                tm.update(
                    self.task_id,
                    stage=f"Đang tách stem AI ({int(sub_pct)}%)...",
                    percent=overall_pct,
                )

            stem_res = await asyncio.to_thread(
                extract_stems,
                master_stereo,
                self.task_id,
                self.stem_mode,
                progress_cb=_stem_progress_cb,
            )

            # Stage 3: 45% Rhythm & Downbeat Tracking
            tm.update(self.task_id, stage="Dò nhịp & downbeat", percent=45)
            drums_path = stem_res.stem_paths.get("drums", master_mono)
            rhythm_res = await asyncio.to_thread(
                analyze_rhythm,
                drums_path,
                master_mono,
            )

            # Stage 4: 60% Bass f0 & Harmonic Chroma Extraction
            tm.update(self.task_id, stage="Trích xuất bass f0 & chroma hòa âm", percent=60)
            bass_path = stem_res.stem_paths.get("bass", master_mono)
            other_path = stem_res.stem_paths.get("other", stem_res.stem_paths.get("instrumental", master_mono))

            # Extract bass notes and harmony in worker threads
            bass_notes = await asyncio.to_thread(extract_bassline, bass_path)
            beats_arr = np.array([bp.timestamp for bp in rhythm_res.beats], dtype=np.float64)

            harmony_features = await asyncio.to_thread(
                extract_harmony,
                other_path,
                master_mono,
                beats_arr,
                rhythm_res.bpm,
                bass_path,
            )

            # Stage 5: 78% Viterbi HMM Chord Progression Decoding
            tm.update(self.task_id, stage="Giải mã hợp âm Viterbi HMM", percent=78)
            mono_data, _ = sf.read(str(master_mono), dtype="float32")
            duration = get_duration(mono_data, SAMPLE_RATE)

            decode_res = await asyncio.to_thread(
                decode_chords,
                harmony_features,
                bass_notes,
                duration,
            )

            # Stage 6: 92% MIDI Export & Manifest Construction
            tm.update(self.task_id, stage="Xuất MIDI & hoàn tất manifest", percent=92)
            await asyncio.to_thread(
                export_midi,
                self.task_id,
                decode_res.chords,
                bass_notes,
                rhythm_res.beats,
                rhythm_res.bpm,
            )

            # Assemble StemManifest
            stems_dict: Dict[str, StemInfo] = {}
            for name in stem_res.stem_paths:
                stems_dict[name] = StemInfo(
                    url=f"/api/stems/{self.task_id}/{name}",
                    color=STEM_COLORS.get(name, "#94a3b8"),
                    default_gain_db=0.0,
                )

            manifest = StemManifest(
                mode=stem_res.mode_used,  # type: ignore[arg-type]
                stems=stems_dict,
            )

            telemetry = TelemetryData(
                bpm=rhythm_res.bpm,
                master_key=decode_res.master_key,
                scale_mode=decode_res.scale_mode,  # type: ignore[arg-type]
                time_signature=rhythm_res.time_signature,
                duration=round(duration, 3),
            )

            all_warnings = stem_res.warnings + rhythm_res.warnings
            final_response = DeepAnalysisResponse(
                task_id=self.task_id,
                telemetry=telemetry,
                beats=rhythm_res.beats,
                chords=decode_res.chords,
                stems=manifest,
                warnings=all_warnings,
            )

            # Stage 7: 100% Complete
            # Store result including raw bass notes so a later dynamic MIDI
            # re-export can rebuild the full multi-track file (chords+bass+click).
            result_payload = final_response.model_dump()
            result_payload["bassline"] = [
                {
                    "start": float(bn.start),
                    "end": float(bn.end),
                    "midi": int(bn.midi),
                    "confidence": float(bn.confidence),
                }
                for bn in bass_notes
            ]
            tm.attach_result(self.task_id, result_payload)
            tm.update(self.task_id, status="COMPLETE", stage="Hoàn tất", percent=100)

        except Exception as e:
            tm.set_failed(self.task_id, f"{type(e).__name__}: {str(e)}")
        finally:
            gc.collect()
