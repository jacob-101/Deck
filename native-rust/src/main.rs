use image::{DynamicImage, ImageFormat, RgbaImage};
use std::env;
use std::io::{self, Cursor, Read, Write};

const MAX_INPUT: u64 = 20 * 1024 * 1024;
const MAX_DIMENSION: u32 = 4096;
const MAX_PIXELS: u64 = 16_000_000;
const PADDING: u32 = 10;

fn prepare_signature(mut image: RgbaImage, remove_white: bool) -> Result<RgbaImage, String> {
    let (width, height) = image.dimensions();
    if width == 0
        || height == 0
        || width > MAX_DIMENSION
        || height > MAX_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err("Image dimensions exceed the 4096×4096 / 16-megapixel limit.".into());
    }

    let mut bounds: Option<(u32, u32, u32, u32)> = None;
    for (index, pixel) in image.pixels_mut().enumerate() {
        if remove_white && pixel[0] > 230 && pixel[1] > 230 && pixel[2] > 230 {
            pixel[3] = 0;
        }
        if pixel[3] <= 10 {
            continue;
        }
        let x = index as u32 % width;
        let y = index as u32 / width;
        bounds = Some(match bounds {
            Some((min_x, min_y, max_x, max_y)) => {
                (min_x.min(x), min_y.min(y), max_x.max(x), max_y.max(y))
            }
            None => (x, y, x, y),
        });
    }
    let (min_x, min_y, max_x, max_y) =
        bounds.ok_or_else(|| "The imported image appears to be blank.".to_string())?;
    let left = min_x.saturating_sub(PADDING);
    let top = min_y.saturating_sub(PADDING);
    let right = max_x.saturating_add(PADDING + 1).min(width);
    let bottom = max_y.saturating_add(PADDING + 1).min(height);
    let output_width = right - left;
    let output_height = bottom - top;
    if output_width < 5 || output_height < 5 {
        return Err("The imported image appears to be blank.".into());
    }
    Ok(image::imageops::crop_imm(&image, left, top, output_width, output_height).to_image())
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    if args.next().as_deref() != Some("signature") {
        return Err("Usage: openpdf-native signature [--keep-background]".into());
    }
    let remove_white = !args.any(|value| value == "--keep-background");
    let mut encoded = Vec::new();
    io::stdin()
        .take(MAX_INPUT + 1)
        .read_to_end(&mut encoded)
        .map_err(|error| format!("Could not read image: {error}"))?;
    if encoded.is_empty() || encoded.len() as u64 > MAX_INPUT {
        return Err("Choose a PNG or JPEG image no larger than 20 MB.".into());
    }
    let decoded = image::load_from_memory(&encoded)
        .map_err(|_| "Could not decode this PNG or JPEG image.".to_string())?;
    let prepared = prepare_signature(decoded.to_rgba8(), remove_white)?;
    let mut output = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(prepared)
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|error| format!("Could not encode signature: {error}"))?;
    io::stdout()
        .write_all(output.get_ref())
        .map_err(|error| format!("Could not write signature: {error}"))
}

fn main() {
    if let Err(message) = run() {
        eprintln!("openpdf-native: {message}");
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn removes_white_and_trims_with_padding() {
        let mut image = RgbaImage::from_pixel(100, 60, Rgba([255, 255, 255, 255]));
        for y in 25..35 {
            for x in 30..70 {
                image.put_pixel(x, y, Rgba([15, 20, 18, 255]));
            }
        }
        let output = prepare_signature(image, true).unwrap();
        assert_eq!(output.dimensions(), (60, 30));
        assert_eq!(output.get_pixel(0, 0)[3], 0);
        assert_eq!(output.get_pixel(30, 15)[3], 255);
    }

    #[test]
    fn rejects_blank_transparent_output() {
        let image = RgbaImage::from_pixel(20, 20, Rgba([255, 255, 255, 255]));
        assert!(prepare_signature(image, true).is_err());
    }
}
