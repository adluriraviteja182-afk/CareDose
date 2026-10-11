"""Recreates the demo tablet pictures if they are missing (for example after replacing folders).
Safe to run any time. It never touches the database or your own uploaded photos.
    python restore_demo_images.py
"""
import os
from PIL import Image, ImageDraw
from app.db import DATA_DIR

folder = DATA_DIR / "uploads"
folder.mkdir(parents=True, exist_ok=True)


def tablet(name, color, capsule=False):
    path = folder / name
    if path.exists():
        print("already there:", name)
        return
    img = Image.new("RGB", (400, 400), (235, 235, 235))
    d = ImageDraw.Draw(img)
    if capsule:
        d.rounded_rectangle((90, 150, 310, 250), 50, fill=color)
    else:
        d.ellipse((100, 100, 300, 300), fill=color)
    img.save(path)
    print("created:", name)


tablet("metformin.png", (250, 250, 250))
tablet("vitd.png", (230, 140, 20), True)
tablet("amox.png", (200, 60, 60), True)
print("Done. Images are in", folder)