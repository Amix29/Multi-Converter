//! Experimental OpenCV-compatible OCR perspective crop.
//! Based on the OpenCV 4.10 interpolation conventions; see OpenCV-BSD-NOTICE.
use crate::core::OCRError;
use crate::processors::Point;
use image::{RgbImage, imageops};
use nalgebra::{DMatrix, DVector, Matrix3};
use rayon::prelude::*;
use std::sync::OnceLock;

fn invalid(message: &str) -> OCRError {
    OCRError::InvalidInput {
        message: message.into(),
    }
}

/// Same four-point order, truncation, interpolation and border policy as
/// PaddleX CropByPolys.get_rotate_crop_image. No initial integer bounding crop:
/// that changes the replicated border for fractional quadrilaterals.
pub fn get_rotate_crop_image(image: &RgbImage, points: &[Point]) -> Result<RgbImage, OCRError> {
    if points.len() != 4
        || image.width() == 0
        || image.height() == 0
        || points.iter().any(|p| !p.x.is_finite() || !p.y.is_finite())
    {
        return Err(invalid("Invalid perspective crop"));
    }
    let distance =
        |a: usize, b: usize| (points[a].x - points[b].x).hypot(points[a].y - points[b].y);
    let width = distance(0, 1).max(distance(2, 3)) as u32;
    let height = distance(0, 3).max(distance(1, 2)) as u32;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > 120_000_000 {
        return Err(invalid("Invalid perspective crop dimensions"));
    }
    let destinations = [
        (0.0, 0.0),
        (f64::from(width), 0.0),
        (f64::from(width), f64::from(height)),
        (0.0, f64::from(height)),
    ];
    let mut a = DMatrix::<f64>::zeros(8, 8);
    let mut b = DVector::<f64>::zeros(8);
    for i in 0..4 {
        let (x, y) = (f64::from(points[i].x), f64::from(points[i].y));
        let (u, v) = destinations[i];
        for (j, value) in [x, y, 1.0, 0.0, 0.0, 0.0, -x * u, -y * u]
            .into_iter()
            .enumerate()
        {
            a[(i, j)] = value;
        }
        for (j, value) in [0.0, 0.0, 0.0, x, y, 1.0, -x * v, -y * v]
            .into_iter()
            .enumerate()
        {
            a[(i + 4, j)] = value;
        }
        b[i] = u;
        b[i + 4] = v;
    }
    let h = a
        .lu()
        .solve(&b)
        .ok_or_else(|| invalid("Singular perspective crop"))?;
    let matrix = Matrix3::new(h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0);
    let inverse = matrix
        .try_inverse()
        .ok_or_else(|| invalid("Singular perspective matrix"))?;
    let weights = cubic_table();
    let mut result = RgbImage::new(width, height);
    result
        .as_mut()
        .par_chunks_mut(width as usize * 3)
        .enumerate()
        .for_each(|(y, row)| {
            for x in 0..width as usize {
                let (xf, yf) = (x as f64, y as f64);
                let denominator = inverse[(2, 0)] * xf + inverse[(2, 1)] * yf + inverse[(2, 2)];
                let scale = if denominator == 0.0 {
                    0.0
                } else {
                    32.0 / denominator
                };
                let qx = ((inverse[(0, 0)] * xf + inverse[(0, 1)] * yf + inverse[(0, 2)]) * scale)
                    .round_ties_even() as i32;
                let qy = ((inverse[(1, 0)] * xf + inverse[(1, 1)] * yf + inverse[(1, 2)]) * scale)
                    .round_ties_even() as i32;
                let (sx, sy) = (qx >> 5, qy >> 5);
                let table = &weights[((qy & 31) * 32 + (qx & 31)) as usize];
                let mut channels = [0i32; 3];
                for j in 0..4 {
                    let source_y = (sy + j - 1).clamp(0, image.height() as i32 - 1) as u32;
                    for i in 0..4 {
                        let source_x = (sx + i - 1).clamp(0, image.width() as i32 - 1) as u32;
                        let pixel = image.get_pixel(source_x, source_y);
                        let weight = i32::from(table[(j * 4 + i) as usize]);
                        for c in 0..3 {
                            channels[c] += i32::from(pixel[c]) * weight;
                        }
                    }
                }
                for c in 0..3 {
                    row[x * 3 + c] = ((channels[c] + (1 << 14)) >> 15).clamp(0, 255) as u8;
                }
            }
        });
    Ok(if height as f32 / width as f32 >= 1.5 {
        imageops::rotate270(&result)
    } else {
        result
    })
}

fn cubic_table() -> &'static [[i16; 16]; 1024] {
    static TABLE: OnceLock<[[i16; 16]; 1024]> = OnceLock::new();
    TABLE.get_or_init(|| {
        let coefficients = |x: f32| {
            const A: f32 = -0.75;
            let first = ((A * (x + 1.0) - 5.0 * A) * (x + 1.0) + 8.0 * A) * (x + 1.0) - 4.0 * A;
            let second = ((A + 2.0) * x - (A + 3.0)) * x * x + 1.0;
            let y = 1.0 - x;
            let third = ((A + 2.0) * y - (A + 3.0)) * y * y + 1.0;
            [first, second, third, 1.0 - first - second - third]
        };
        let mut result = [[0i16; 16]; 1024];
        for y in 0..32 {
            for x in 0..32 {
                let wx = coefficients(x as f32 / 32.0);
                let wy = coefficients(y as f32 / 32.0);
                let table = &mut result[y * 32 + x];
                let mut sum = 0;
                for j in 0..4 {
                    for i in 0..4 {
                        let value = (wy[j] * wx[i] * 32768.0)
                            .round_ties_even()
                            .clamp(-32768.0, 32767.0) as i16;
                        table[j * 4 + i] = value;
                        sum += i32::from(value);
                    }
                }
                // OpenCV normalizes the signed 15-bit two-dimensional table.
                let difference = sum - 32768;
                if difference != 0 {
                    let (mut minimum, mut maximum) = (10, 10);
                    for j in 2..4 {
                        for i in 2..4 {
                            let index = j * 4 + i;
                            if table[index] < table[minimum] {
                                minimum = index;
                            } else if table[index] > table[maximum] {
                                maximum = index;
                            }
                        }
                    }
                    let index = if difference < 0 { maximum } else { minimum };
                    table[index] = (i32::from(table[index]) - difference) as i16;
                }
            }
        }
        result
    })
}
