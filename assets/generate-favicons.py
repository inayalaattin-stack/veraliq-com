#!/usr/bin/env python3
"""
assets/generate-favicons.py

VERALIQ favicon/logo PNG üretici — 2026-08-25.

Neden bu dosya var: sandbox ortamında ImageMagick'in SVG delegate'i
(rsvg-convert) kurulu değil, PIL/cairosvg/sharp gibi kütüphaneler de
paket kaydına (npm/pip) erişim engeli yüzünden kurulamıyor. Bu yüzden
assets/veraliq-mark.svg'deki basit vektör şekli (yuvarlak köşeli kare +
"V" darbesi + iki daire), SADECE Python standart kütüphanesi (zlib,
struct — üçüncü parti YOK) kullanılarak elle bir PNG rasterize edici ile
üretiliyor. Şekiller basit olduğu için (dikdörtgen, kalın çizgi, daire)
kaba bir "point-in-shape" tarama (her pikselde şekillerin içinde mi diye
bakan supersample'lı bir rasterizer) yeterli kalitede sonuç veriyor.

Kaynak tek doğruluk: assets/veraliq-mark.svg. Bu script'teki koordinatlar
ve renkler o dosyayla senkron tutulmalı (64x64 viewBox, aynı hex'ler).

Kullanım: python3 assets/generate-favicons.py
Üretir: favicon-16.png, favicon-32.png, apple-touch-icon.png (180x180)
"""
import struct
import zlib
import math
import os

# --- assets/veraliq-mark.svg ile birebir aynı olmalı ---
INK = (0x08, 0x0A, 0x0A)          # --ink
ACCENT = (0xBF, 0xA1, 0x6A)       # --accent (Champagne)
GREEN = (0x7E, 0xE0, 0xB2)        # --green (AI Mint)
VIEWBOX = 64.0
RECT_RX = 14.0
STROKE_W = 6.5
V_POINTS = [(16, 17), (32, 47), (48, 17)]
DOT_C = (48, 16)
DOT_R = 5.5
RING_R = 9.0
RING_W = 2.0

SS = 4  # supersample factor for antialiasing


def dist_point_to_segment(px, py, ax, ay, bx, by):
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab2 = abx * abx + aby * aby
    t = 0.0 if ab2 == 0 else max(0.0, min(1.0, (apx * abx + apy * aby) / ab2))
    cx, cy = ax + t * abx, ay + t * aby
    return math.hypot(px - cx, py - cy)


def in_rounded_rect(x, y, w, h, r):
    if x < r and y < r:
        return math.hypot(x - r, y - r) <= r
    if x > w - r and y < r:
        return math.hypot(x - (w - r), y - r) <= r
    if x < r and y > h - r:
        return math.hypot(x - r, y - (h - r)) <= r
    if x > w - r and y > h - r:
        return math.hypot(x - (w - r), y - (h - r)) <= r
    return 0 <= x <= w and 0 <= y <= h


def pixel_color(x, y):
    if not in_rounded_rect(x, y, VIEWBOX, VIEWBOX, RECT_RX):
        return None  # transparent outside the rounded square
    color = INK

    half = STROKE_W / 2.0
    for i in range(len(V_POINTS) - 1):
        ax, ay = V_POINTS[i]
        bx, by = V_POINTS[i + 1]
        if dist_point_to_segment(x, y, ax, ay, bx, by) <= half:
            color = ACCENT

    dxr, dyr = x - DOT_C[0], y - DOT_C[1]
    rr = math.hypot(dxr, dyr)
    if RING_R - RING_W / 2.0 <= rr <= RING_R + RING_W / 2.0:
        if color == INK:
            color = tuple(int(INK[i] * 0.65 + GREEN[i] * 0.35) for i in range(3))

    if rr <= DOT_R:
        color = GREEN

    return color


def render(size):
    img = [[None] * size for _ in range(size)]
    scale = VIEWBOX / size
    for py in range(size):
        for px in range(size):
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(SS):
                for sx in range(SS):
                    vx = (px + (sx + 0.5) / SS) * scale
                    vy = (py + (sy + 0.5) / SS) * scale
                    c = pixel_color(vx, vy)
                    if c is not None:
                        r_acc += c[0]
                        g_acc += c[1]
                        b_acc += c[2]
                        a_acc += 255
            n = SS * SS
            if a_acc == 0:
                img[py][px] = (0, 0, 0, 0)
            else:
                cov = a_acc / (n * 255)
                img[py][px] = (
                    int(r_acc / n / cov) if cov > 0 else 0,
                    int(g_acc / n / cov) if cov > 0 else 0,
                    int(b_acc / n / cov) if cov > 0 else 0,
                    int(255 * cov),
                )
    return img


def write_png(path, img):
    size = len(img)
    raw = bytearray()
    for row in img:
        raw.append(0)  # filter type: none
        for (r, g, b, a) in row:
            raw += bytes((r, g, b, a))
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(sig)
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', compressed))
        f.write(chunk(b'IEND', b''))


if __name__ == '__main__':
    out_dir = os.path.dirname(os.path.abspath(__file__))
    targets = [(16, 'favicon-16.png'), (32, 'favicon-32.png'), (180, 'apple-touch-icon.png')]
    for size, name in targets:
        write_png(os.path.join(out_dir, name), render(size))
        print('wrote', name, f'{size}x{size}')
