#!/usr/bin/env python3
"""Offline PP-OCRv6_medium worker packaged as the official reference sidecar."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "true")
os.environ.setdefault("NO_PROXY", "*")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--models", required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--job-id")
    parser.add_argument("--serve", action="store_true")
    return parser.parse_args()


def model_path(root: Path, name: str) -> str:
    path = root / name
    if not path.is_dir():
        raise RuntimeError(f"missing model directory: {name}")
    return str(path)


def create_pipeline(models: Path):
    from paddleocr import PaddleOCR

    return PaddleOCR(
        doc_orientation_classify_model_dir=model_path(models, "document-orientation"),
        doc_unwarping_model_dir=model_path(models, "document-unwarping"),
        textline_orientation_model_dir=model_path(models, "textline-orientation"),
        text_detection_model_dir=model_path(models, "text-detection"),
        text_recognition_model_dir=model_path(models, "text-recognition"),
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        use_textline_orientation=True,
        device="cpu",
        enable_mkldnn=False,
    )


def result_payload(result: Any) -> dict[str, Any]:
    raw = getattr(result, "json", result)
    if callable(raw):
        raw = raw()
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, dict):
        raise RuntimeError("unexpected PaddleOCR result")
    value = raw.get("res", raw)
    return value if isinstance(value, dict) else raw


def bounding_box(box: Any) -> dict[str, float]:
    values = box.tolist() if hasattr(box, "tolist") else box
    if len(values) == 4 and all(isinstance(value, (int, float)) for value in values):
        x1, y1, x2, y2 = values
    else:
        points = [point for point in values if len(point) >= 2]
        xs = [float(point[0]) for point in points]
        ys = [float(point[1]) for point in points]
        x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
    return {
        "x": float(x1),
        "y": float(y1),
        "width": max(0.0, float(x2) - float(x1)),
        "height": max(0.0, float(y2) - float(y1)),
    }


def recognize(pipeline: Any, input_path: str, job_id: str) -> dict[str, Any]:
    predictions = list(pipeline.predict(input=input_path))
    blocks: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    for prediction in predictions:
        payload = result_payload(prediction)
        texts = payload.get("rec_texts") or payload.get("texts") or []
        scores = payload.get("rec_scores") or payload.get("scores") or []
        boxes = payload.get("rec_boxes") or payload.get("rec_polys") or []
        for index, text in enumerate(texts):
            if not str(text).strip() or index >= len(boxes):
                continue
            score = float(scores[index]) if index < len(scores) else 0.0
            blocks.append(
                {
                    "text": str(text),
                    "confidence": max(0.0, min(1.0, score)),
                    "boundingBox": bounding_box(boxes[index]),
                }
            )
    text = "\n".join(block["text"] for block in blocks)
    return {
        "schemaVersion": 1,
        "jobId": job_id,
        "text": text,
        "pages": [
            {
                "pageNumber": 1,
                "source": "ocr",
                "width": 0,
                "height": 0,
                "text": text,
                "blocks": blocks,
                "warnings": warnings,
            }
        ],
        "warnings": warnings,
    }


def main() -> int:
    args = parse_args()
    models = Path(args.models).resolve(strict=True)
    pipeline = create_pipeline(models)
    if args.serve:
        return serve(pipeline)
    if not args.input or not args.output or not args.job_id:
        raise RuntimeError("--input, --output and --job-id are required outside server mode")
    write_result(pipeline, args.input, args.output, args.job_id)
    return 0


def write_result(pipeline: Any, input_value: str, output_value: str, job_id: str) -> None:
    input_path = str(Path(input_value).resolve(strict=True))
    output_path = Path(output_value).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = recognize(pipeline, input_path, job_id)
    temporary = output_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    temporary.replace(output_path)


def serve(pipeline: Any) -> int:
    send_message({"type": "ready", "schemaVersion": 1})
    for line in sys.stdin:
        request: Any = {}
        try:
            request = json.loads(line)
            job_id = str(request["jobId"])
            write_result(pipeline, str(request["input"]), str(request["output"]), job_id)
            send_message({"type": "completed", "jobId": job_id})
        except Exception as error:  # The supervisor restarts the worker after failures.
            send_message({
                "type": "failed",
                "jobId": str(request.get("jobId", "")) if isinstance(request, dict) else "",
                "message": str(error)[:800],
            })
    return 0


def send_message(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    raise SystemExit(main())
