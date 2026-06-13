use minisign_verify::{PublicKey, Signature};
use std::env;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let public_key_path = next_arg(&mut args, "--public-key")?;
    let file_path = next_arg(&mut args, "--file")?;
    let signature_path = next_arg(&mut args, "--signature")?;
    if args.next().is_some() {
        return Err("Unexpected extra arguments.".to_string());
    }

    let public_key = PublicKey::from_file(public_key_path)
        .map_err(|error| format!("Unable to read updater public key: {error}"))?;
    let signature = Signature::from_file(signature_path)
        .map_err(|error| format!("Unable to read updater signature: {error}"))?;
    let mut verifier = public_key
        .verify_stream(&signature)
        .map_err(|error| format!("Unable to create updater signature verifier: {error}"))?;
    let mut file = File::open(&file_path).map_err(|error| {
        format!(
            "Unable to read signed updater asset {}: {error}",
            file_path.display()
        )
    })?;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            format!(
                "Unable to read signed updater asset {}: {error}",
                file_path.display()
            )
        })?;
        if read == 0 {
            break;
        }
        verifier.update(&buffer[..read]);
    }
    verifier
        .finalize()
        .map_err(|error| format!("Updater signature verification failed: {error}"))?;
    Ok(())
}

fn next_arg(args: &mut impl Iterator<Item = String>, name: &str) -> Result<PathBuf, String> {
    let actual = args.next().ok_or_else(|| format!("Missing {name}."))?;
    if actual != name {
        return Err(format!("Expected {name}, got {actual}."));
    }
    args.next()
        .map(PathBuf::from)
        .ok_or_else(|| format!("Missing value for {name}."))
}
