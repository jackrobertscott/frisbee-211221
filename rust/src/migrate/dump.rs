//! Reads `mongodump` output: a dump directory (`dump/<db>/<collection>.bson`,
//! optionally `--gzip`ped to `.bson.gz`) or an `--archive` file (optionally
//! gzipped as a whole).

use bson::Document;
use flate2::read::GzDecoder;
use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufReader, ErrorKind, Read};
use std::path::{Path, PathBuf};

/// Magic number at the start of a `mongodump --archive` file.
const ARCHIVE_MAGIC: u32 = 0x8199_e26d;
/// Ends the prelude and each namespace segment of an archive.
const TERMINATOR: i32 = -1;
/// Databases `mongodump` includes in a full dump that never hold app data.
const SYSTEM_DATABASES: [&str; 3] = ["admin", "config", "local"];

/// One collection's documents, in dump (natural) order.
#[derive(Debug, Default)]
pub struct DumpCollection {
    pub name: String,
    pub documents: Vec<Document>,
}

/// The selected database of a dump.
#[derive(Debug)]
pub struct Dump {
    pub database: String,
    /// Collections sorted by name.
    pub collections: Vec<DumpCollection>,
}

/// Reads the dump at `path`, selecting database `db` (required when the dump
/// holds several app databases).
pub fn read_dump(path: &Path, db: Option<&str>) -> Result<Dump, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("Cannot read dump {}: {error}", path.display()))?;
    let databases = if metadata.is_dir() {
        read_directory(path)?
    } else {
        read_archive(path)?
    };
    select_database(databases, db)
}

type Databases = BTreeMap<String, BTreeMap<String, Vec<Document>>>;

fn select_database(mut databases: Databases, db: Option<&str>) -> Result<Dump, String> {
    let name = match db {
        Some(name) => {
            if !databases.contains_key(name) {
                return Err(format!(
                    "Database \"{name}\" is not in the dump (found: {}).",
                    list(databases.keys())
                ));
            }
            name.to_string()
        }
        None => {
            let candidates: Vec<&String> = databases
                .keys()
                .filter(|name| !SYSTEM_DATABASES.contains(&name.as_str()))
                .collect();
            match candidates.as_slice() {
                [only] => (*only).clone(),
                [] => {
                    return Err(if databases.is_empty() {
                        "The dump contains no collections.".to_string()
                    } else {
                        format!(
                            "The dump contains no application database (found: {}); pass --db.",
                            list(databases.keys())
                        )
                    });
                }
                several => {
                    return Err(format!(
                        "The dump contains several databases ({}); choose one with --db.",
                        list(several.iter().copied())
                    ));
                }
            }
        }
    };
    let collections = databases
        .remove(&name)
        .unwrap_or_default()
        .into_iter()
        .map(|(name, documents)| DumpCollection { name, documents })
        .collect();
    Ok(Dump {
        database: name,
        collections,
    })
}

fn list<'a>(names: impl Iterator<Item = &'a String>) -> String {
    let names: Vec<&str> = names.map(String::as_str).collect();
    if names.is_empty() {
        "none".into()
    } else {
        names.join(", ")
    }
}

/// `(collection name, gzipped)` for a dump file name, or `None` for other files.
fn collection_file(name: &str) -> Option<(String, bool)> {
    if let Some(stem) = name.strip_suffix(".bson.gz") {
        return Some((stem.to_string(), true));
    }
    name.strip_suffix(".bson")
        .map(|stem| (stem.to_string(), false))
}

fn bson_files(dir: &Path) -> Result<Vec<(String, bool, PathBuf)>, String> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(dir)
        .map_err(|error| format!("Cannot read directory {}: {error}", dir.display()))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if let Some((name, gzipped)) = collection_file(&file_name) {
            files.push((name, gzipped, path));
        }
    }
    files.sort();
    Ok(files)
}

/// A dump root (`dump/`, one sub-directory per database) or a database
/// directory (`dump/<db>/`) itself.
fn read_directory(path: &Path) -> Result<Databases, String> {
    let mut databases = Databases::new();
    let direct = bson_files(path)?;
    if !direct.is_empty() {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        databases.insert(name, read_collection_files(direct)?);
        return Ok(databases);
    }
    let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|error| format!("Cannot read directory {}: {error}", path.display()))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect();
    entries.sort();
    for dir in entries {
        let files = bson_files(&dir)?;
        if files.is_empty() {
            continue;
        }
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        databases.insert(name, read_collection_files(files)?);
    }
    Ok(databases)
}

fn read_collection_files(
    files: Vec<(String, bool, PathBuf)>,
) -> Result<BTreeMap<String, Vec<Document>>, String> {
    let mut collections = BTreeMap::new();
    for (name, gzipped, path) in files {
        if collections.contains_key(&name) {
            return Err(format!(
                "Collection \"{name}\" appears both gzipped and plain in {}.",
                path.parent().unwrap_or(&path).display()
            ));
        }
        let file = File::open(&path)
            .map_err(|error| format!("Cannot open {}: {error}", path.display()))?;
        let mut reader: Box<dyn Read> = if gzipped {
            Box::new(GzDecoder::new(BufReader::new(file)))
        } else {
            Box::new(BufReader::new(file))
        };
        let documents = read_bson_stream(&mut reader)
            .map_err(|error| format!("Cannot read {}: {error}", path.display()))?;
        collections.insert(name, documents);
    }
    Ok(collections)
}

/// Reads a little-endian `i32`; `None` at a clean end of input.
fn read_i32(reader: &mut dyn Read) -> Result<Option<i32>, String> {
    let mut bytes = [0u8; 4];
    let mut filled = 0;
    while filled < 4 {
        match reader.read(&mut bytes[filled..]) {
            Ok(0) if filled == 0 => return Ok(None),
            Ok(0) => return Err("unexpected end of data".into()),
            Ok(n) => filled += n,
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(Some(i32::from_le_bytes(bytes)))
}

/// Reads the rest of a document whose length prefix was already read.
fn read_document_body(reader: &mut dyn Read, length: i32) -> Result<Document, String> {
    if length < 5 {
        return Err(format!("invalid BSON document length {length}"));
    }
    let length = length as usize;
    let mut bytes = vec![0u8; length];
    bytes[..4].copy_from_slice(&(length as i32).to_le_bytes());
    reader
        .read_exact(&mut bytes[4..])
        .map_err(|error| format!("truncated BSON document: {error}"))?;
    Document::from_reader(bytes.as_slice())
        .map_err(|error| format!("invalid BSON document: {error}"))
}

/// Concatenated BSON documents (a `.bson` file).
pub fn read_bson_stream(reader: &mut dyn Read) -> Result<Vec<Document>, String> {
    let mut documents = Vec::new();
    while let Some(length) = read_i32(reader)? {
        documents.push(read_document_body(reader, length)?);
    }
    Ok(documents)
}

/// Documents up to the next terminator.
fn read_until_terminator(reader: &mut dyn Read) -> Result<Vec<Document>, String> {
    let mut documents = Vec::new();
    loop {
        match read_i32(reader)? {
            None => return Err("unexpected end of archive".into()),
            Some(TERMINATOR) => return Ok(documents),
            Some(length) => documents.push(read_document_body(reader, length)?),
        }
    }
}

fn string_field(document: &Document, key: &str) -> Result<String, String> {
    document
        .get_str(key)
        .map(str::to_string)
        .map_err(|_| format!("archive header without \"{key}\""))
}

/// A `mongodump --archive` file (gzipped or not).
fn read_archive(path: &Path) -> Result<Databases, String> {
    let open =
        || File::open(path).map_err(|error| format!("Cannot open {}: {error}", path.display()));
    let mut head = [0u8; 2];
    let gzipped = open()?.read_exact(&mut head).is_ok() && head == [0x1f, 0x8b];
    let file = BufReader::new(open()?);
    let mut reader: Box<dyn Read> = if gzipped {
        Box::new(GzDecoder::new(file))
    } else {
        Box::new(file)
    };
    parse_archive(&mut reader)
        .map_err(|error| format!("Cannot read archive {}: {error}", path.display()))
}

/// Parses the archive format: magic number, prelude (archive header and
/// collection metadata, terminated), then namespace segments: a header
/// `{db, collection, EOF, CRC}` followed by documents and a terminator.
pub fn parse_archive(reader: &mut dyn Read) -> Result<Databases, String> {
    match read_i32(reader)? {
        Some(magic) if magic as u32 == ARCHIVE_MAGIC => {}
        _ => {
            return Err(
                "not a mongodump archive (pass a dump directory or a file made with --archive)"
                    .into(),
            );
        }
    }
    let mut databases = Databases::new();
    for metadata in read_until_terminator(reader)? {
        // the first prelude document is the archive header (no collection)
        if let (Ok(db), Ok(collection)) = (metadata.get_str("db"), metadata.get_str("collection")) {
            databases
                .entry(db.to_string())
                .or_default()
                .entry(collection.to_string())
                .or_default();
        }
    }
    while let Some(length) = read_i32(reader)? {
        if length == TERMINATOR {
            continue;
        }
        let header = read_document_body(reader, length)?;
        let db = string_field(&header, "db")?;
        let collection = string_field(&header, "collection")?;
        let documents = read_until_terminator(reader)?;
        let eof = header.get_bool("EOF").unwrap_or(false);
        if eof && !documents.is_empty() {
            return Err(format!("documents after the end of {db}.{collection}"));
        }
        databases
            .entry(db)
            .or_default()
            .entry(collection)
            .or_default()
            .extend(documents);
    }
    Ok(databases)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bson::doc;
    use flate2::{Compression, write::GzEncoder};
    use std::io::Write;

    fn bytes(documents: &[Document]) -> Vec<u8> {
        documents.iter().flat_map(|d| d.to_vec().unwrap()).collect()
    }

    fn archive(segments: &[(&str, &str, Vec<Document>)]) -> Vec<u8> {
        let mut out = ARCHIVE_MAGIC.to_le_bytes().to_vec();
        out.extend(bytes(&[
            doc! {"concurrent_collections": 4, "version": "0.1"},
        ]));
        for (db, collection, _) in segments {
            out.extend(bytes(&[
                doc! {"db": *db, "collection": *collection, "metadata": "{}", "size": 0},
            ]));
        }
        out.extend(TERMINATOR.to_le_bytes());
        for (db, collection, documents) in segments {
            // two segments per namespace to exercise interleaving
            for chunk in documents.chunks(1) {
                out.extend(bytes(&[
                    doc! {"db": *db, "collection": *collection, "EOF": false, "CRC": 0_i64},
                ]));
                out.extend(bytes(chunk));
                out.extend(TERMINATOR.to_le_bytes());
            }
            out.extend(bytes(&[
                doc! {"db": *db, "collection": *collection, "EOF": true, "CRC": 0_i64},
            ]));
            out.extend(TERMINATOR.to_le_bytes());
        }
        out
    }

    #[test]
    fn reads_concatenated_bson() {
        let data = bytes(&[doc! {"a": 1}, doc! {"b": "two"}]);
        let documents = read_bson_stream(&mut data.as_slice()).unwrap();
        assert_eq!(documents, vec![doc! {"a": 1}, doc! {"b": "two"}]);
        let truncated = &data[..data.len() - 2];
        assert!(read_bson_stream(&mut &truncated[..]).is_err());
    }

    #[test]
    fn parses_archives_with_empty_and_interleaved_collections() {
        let data = archive(&[
            ("league", "team", vec![doc! {"id": "t1"}, doc! {"id": "t2"}]),
            ("league", "session", vec![]),
        ]);
        let databases = parse_archive(&mut data.as_slice()).unwrap();
        let league = &databases["league"];
        assert_eq!(league["team"], vec![doc! {"id": "t1"}, doc! {"id": "t2"}]);
        assert!(league["session"].is_empty());
    }

    #[test]
    fn rejects_files_that_are_not_archives() {
        let data = bytes(&[doc! {"a": 1}]);
        assert!(
            parse_archive(&mut data.as_slice())
                .unwrap_err()
                .contains("not a mongodump archive")
        );
    }

    #[test]
    fn reads_directories_plain_and_gzipped_and_selects_the_database() {
        let dir = tempfile::tempdir().unwrap();
        let league = dir.path().join("league");
        std::fs::create_dir_all(&league).unwrap();
        std::fs::create_dir_all(dir.path().join("admin")).unwrap();
        std::fs::write(league.join("team.bson"), bytes(&[doc! {"id": "t1"}])).unwrap();
        std::fs::write(league.join("team.metadata.json"), "{}").unwrap();
        let mut gz = GzEncoder::new(Vec::new(), Compression::default());
        gz.write_all(&bytes(&[doc! {"id": "u1"}])).unwrap();
        std::fs::write(league.join("user.bson.gz"), gz.finish().unwrap()).unwrap();
        std::fs::write(
            dir.path().join("admin/system.version.bson"),
            bytes(&[doc! {"_id": "x"}]),
        )
        .unwrap();

        let dump = read_dump(dir.path(), None).unwrap();
        assert_eq!(dump.database, "league");
        let names: Vec<&str> = dump.collections.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["team", "user"]);
        assert_eq!(dump.collections[1].documents, vec![doc! {"id": "u1"}]);

        // pointing at the database directory works too
        assert_eq!(read_dump(&league, None).unwrap().database, "league");
        assert!(
            read_dump(dir.path(), Some("other"))
                .unwrap_err()
                .contains("not in the dump")
        );

        std::fs::create_dir_all(dir.path().join("second")).unwrap();
        std::fs::write(dir.path().join("second/team.bson"), bytes(&[])).unwrap();
        assert!(read_dump(dir.path(), None).unwrap_err().contains("--db"));
        assert_eq!(
            read_dump(dir.path(), Some("second"))
                .unwrap()
                .collections
                .len(),
            1
        );
    }
}
