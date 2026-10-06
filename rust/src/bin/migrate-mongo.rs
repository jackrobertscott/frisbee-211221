//! Imports a `mongodump` of the TS server's database into the SQLite file
//! the Rust server uses. See "Migrating from MongoDB" in `README.md`.

use frisbee::migrate::{Options, migrate};
use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "Usage: migrate-mongo --dump <path> --sqlite <path> [--db <name>] [--force] [--strict] [--report <file.json>]

  --dump <path>     mongodump output: a dump directory (plain or --gzip) or an
                    --archive file (plain or --gzip)
  --sqlite <path>   the SQLite database to create (the server's SQLITE_PATH)
  --db <name>       the Mongo database to import, when the dump holds several
  --force           replace the data of a SQLite database that is not empty
  --strict          import nothing if any document fails schema validation
  --report <file>   write every warning and note, with values, as JSON";

fn parse(args: Vec<String>) -> Result<Options, String> {
    let mut options = Options::default();
    let mut dump = None;
    let mut sqlite = None;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let mut value = |name: &str| {
            args.next()
                .filter(|v| !v.starts_with("--"))
                .ok_or_else(|| format!("{name} needs a value."))
        };
        match arg.as_str() {
            "--dump" => dump = Some(PathBuf::from(value("--dump")?)),
            "--sqlite" => sqlite = Some(PathBuf::from(value("--sqlite")?)),
            "--db" => options.db = Some(value("--db")?),
            "--report" => options.report = Some(PathBuf::from(value("--report")?)),
            "--force" => options.force = true,
            "--strict" => options.strict = true,
            other => return Err(format!("Unknown argument \"{other}\".")),
        }
    }
    options.dump = dump.ok_or("--dump is required.")?;
    options.sqlite = sqlite.ok_or("--sqlite is required.")?;
    Ok(options)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("{USAGE}");
        return ExitCode::SUCCESS;
    }
    let options = match parse(args) {
        Ok(options) => options,
        Err(error) => {
            eprintln!("{error}\n\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    match migrate(&options) {
        Ok(outcome) => {
            for line in outcome.summary_lines(20) {
                println!("{line}");
            }
            println!(
                "Done: {} documents imported into {} with {} warnings.",
                outcome
                    .collections
                    .iter()
                    .map(|c| c.imported)
                    .sum::<usize>(),
                options.sqlite.display(),
                outcome.warning_count()
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("Import failed: {error}");
            ExitCode::FAILURE
        }
    }
}
