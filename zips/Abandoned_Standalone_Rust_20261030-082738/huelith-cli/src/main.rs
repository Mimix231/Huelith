use anyhow::{bail, Context, Result};
use huelith_core::Effect;
use std::path::Path;
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("catalog") => {
            for e in huelith_effects::CATALOG {
                println!("{}\t{}\t{}", e.id, e.name, e.module);
            }
        }
        Some("render") => {
            let input = Path::new(
                args.get(1)
                    .context("Usage: huelith-cli render INPUT OUTPUT [EFFECT_ID AMOUNT]")?,
            );
            let output = Path::new(args.get(2).context("Output filename required")?);
            let mut doc = if [Some("huelith"), Some("spectrum")]
                .contains(&input.extension().and_then(|v| v.to_str()))
            {
                huelith_io::read_project(input)?
            } else {
                huelith_io::import_image(input)?
            };
            if let Some(kind) = args.get(3) {
                let amount = args.get(4).context("Effect amount required")?.parse()?;
                doc.layers
                    .last_mut()
                    .context("No layer")?
                    .effects
                    .push(Effect::new(kind, amount));
            }
            let now = std::time::Instant::now();
            let image = huelith_io::render(&doc)?;
            huelith_io::export(output, &image)?;
            println!(
                "Rendered {}x{} to {} in {:.1} ms",
                image.width,
                image.height,
                output.display(),
                now.elapsed().as_secs_f64() * 1000.
            );
        }
        Some("roundtrip") => {
            let input = Path::new(args.get(1).context("Input project required")?);
            let output = Path::new(args.get(2).context("Output project required")?);
            if input == output {
                bail!("Choose a different output path to preserve the original");
            }
            huelith_io::save_project(output, &huelith_io::read_project(input)?)?;
        }
        _ => bail!(
            "Commands: catalog | render INPUT OUTPUT [EFFECT_ID AMOUNT] | roundtrip INPUT OUTPUT"
        ),
    }
    Ok(())
}
