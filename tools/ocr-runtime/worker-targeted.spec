# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

ROOT = Path.cwd()
WORKER = ROOT / "tools" / "ocr-runtime" / "worker.py"

datas = []
datas += collect_data_files("paddleocr", include_py_files=False)
datas += collect_data_files("paddlex", include_py_files=False)

binaries = collect_dynamic_libs("paddle")

hiddenimports = []
hiddenimports += collect_submodules("paddle")
hiddenimports += collect_submodules("paddleocr")
hiddenimports += collect_submodules("paddlex")

excluded_optional_modules = [
    "IPython",
    "bce_python_sdk",
    "fastapi",
    "flask",
    "gradio",
    "matplotlib",
    "notebook",
    "tkinter",
    "uvicorn",
]

a = Analysis(
    [str(WORKER)],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excluded_optional_modules,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ocr-worker",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="ocr-worker",
)
