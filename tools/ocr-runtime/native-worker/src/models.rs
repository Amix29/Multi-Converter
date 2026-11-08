use oar_ocr::core::ModelSource;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const MAGIC: &[u8; 8] = b"MCOSHF01";

#[derive(Deserialize)]
struct Source {
    id: String,
    files: Vec<SourceFile>,
}

#[derive(Deserialize)]
struct SourceFile {
    rfilename: String,
    size: u64,
    lfs: Option<Lfs>,
}

#[derive(Deserialize)]
struct Lfs {
    sha256: String,
    size: u64,
}

/// Decode a bounded, lossless storage transform before ONNX sees the model.
/// The original digest is compiled from pinned official provenance, never read
/// from the encoded file. Raw development models are checked against it too.
pub fn load(root: &Path, id: &str) -> Result<ModelSource, String> {
    let sources: Vec<Source> = serde_json::from_str(include_str!("../model-sources.json"))
        .map_err(|error| format!("Invalid compiled model provenance: {error}"))?;
    let source = sources
        .iter()
        .find(|source| source.id == id)
        .ok_or_else(|| format!("Unknown OCR model: {id}"))?;
    let file = source
        .files
        .iter()
        .find(|file| file.rfilename == "inference.onnx")
        .ok_or_else(|| format!("Missing model provenance: {id}"))?;
    let lfs = file.lfs.as_ref().ok_or("Missing model digest")?;
    if lfs.size != file.size || file.size > 80 * 1024 * 1024 {
        return Err("Invalid model size lock".into());
    }
    let path = root.join(id).join("inference.onnx");
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || ![file.size, file.size + 16].contains(&metadata.len()) {
        return Err(format!("Unexpected model size or type: {id}"));
    }
    let mut encoded = Vec::new();
    fs::File::open(path)
        .map_err(|error| error.to_string())?
        .take(file.size + 17)
        .read_to_end(&mut encoded)
        .map_err(|error| error.to_string())?;
    let decoded = if encoded.starts_with(MAGIC) {
        unshuffle(&encoded, file.size as usize)?
    } else {
        encoded
    };
    if decoded.len() as u64 != file.size || format!("{:x}", Sha256::digest(&decoded)) != lfs.sha256
    {
        return Err(format!("Restored OCR model digest mismatch: {id}"));
    }
    Ok(decoded.into())
}

pub fn dictionary(root: &Path) -> Result<PathBuf, String> {
    let path = root.join("characters.txt");
    let mut bytes = Vec::new();
    fs::File::open(&path)
        .map_err(|error| error.to_string())?
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if format!("{:x}", Sha256::digest(bytes))
        != "769e7fa79bb297b5f18d8dbd149e364a45bc61f2b3f574e5ea836f0b261c23a6"
    {
        return Err("OCR dictionary differs from the reference".into());
    }
    Ok(path)
}

fn unshuffle(encoded: &[u8], expected: usize) -> Result<Vec<u8>, String> {
    if encoded.len() != expected + 16
        || !encoded.starts_with(MAGIC)
        || u64::from_le_bytes(encoded[8..16].try_into().map_err(|_| "Invalid header")?)
            != expected as u64
    {
        return Err("Invalid shuffled model framing".into());
    }
    let payload = &encoded[16..];
    let aligned = expected / 4 * 4;
    let stride = aligned / 4;
    let mut result = vec![0; expected];
    for channel in 0..4 {
        for index in 0..stride {
            result[index * 4 + channel] = payload[channel * stride + index];
        }
    }
    result[aligned..].copy_from_slice(&payload[aligned..]);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byte_shuffle_restores_every_byte_including_unaligned_tails() {
        for size in 0..133 {
            let original: Vec<u8> = (0..size).map(|index| (index * 37 + 19) as u8).collect();
            let aligned = size / 4 * 4;
            let mut encoded = MAGIC.to_vec();
            encoded.extend_from_slice(&(size as u64).to_le_bytes());
            for channel in 0..4 {
                encoded.extend(original[channel.min(aligned)..aligned].iter().step_by(4));
            }
            encoded.extend_from_slice(&original[aligned..]);
            assert_eq!(unshuffle(&encoded, size).unwrap(), original);
            encoded[8] ^= 1;
            assert!(unshuffle(&encoded, size).is_err());
        }
    }
}
