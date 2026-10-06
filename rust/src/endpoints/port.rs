//! Port of `server/src/endpoints/Port.ts` — endpoints for
//! `shared/src/endpoints/PortDef.ts` (`crate::shared::contract::port`).

use crate::db::Filter;
use crate::http::capture::Reply;
use crate::http::endpoint::{Ctx, Endpoint};
use crate::http::uploads::{UploadOptions, digest_request, filepath_buffer};
use crate::services::csv_import::assert_member_import_headings;
use crate::services::export_archive::{ExportFileType, create_export_archive};
use crate::services::gameday_import_config::{
    GamedayImportSavePayload, load_gameday_import_state, run_manual_gameday_import,
    save_gameday_import_config,
};
use crate::services::member_import::import_member_objects;
use crate::services::mock_data::generate_mock_season_data;
use crate::shared::contract::port::{
    PORT_DELETE_ALL_MOCK_DATA, PORT_EXPORT, PORT_GAMEDAY_IMPORT, PORT_GAMEDAY_IMPORT_LOAD,
    PORT_GAMEDAY_IMPORT_SAVE, PORT_IMPORT, PORT_MOCK_GENERATE,
};
use crate::shared::errors::{AppError, AppResult, ErrorOptions, bad_request_error};
use crate::shared::schemas::{Member, Report, Season, Team, User};
use crate::tables::{MEMBER, REPORT, SEASON, TEAM, USER};
use crate::utils::csv::parse_csv_string;
use axum::body::Body;
use axum::http::{Response, header};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportPayload {
    file_type: ExportFileType,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeasonIdPayload {
    season_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MockGeneratePayload {
    season_id: String,
    teams: f64,
    users_per_team: f64,
}

fn season_id_missing() -> AppError {
    bad_request_error(
        "Season id missing from request.",
        ErrorOptions::code("season.id_missing"),
    )
}

async fn import(mut ctx: Ctx) -> AppResult<()> {
    ctx.require_access().await?;
    let body = ctx.take_body().unwrap_or_default();
    let (raw_files, fields) = digest_request(&ctx.headers, body, &UploadOptions::default()).await?;
    let season_id = fields
        .get("seasonId")
        .filter(|id| !crate::js::trim(id).is_empty())
        .ok_or_else(season_id_missing)?;
    let season = SEASON.get_one(ctx.db(), Season::ID.eq(season_id)).await?;
    let Some(file) = raw_files.first() else {
        return Err(bad_request_error(
            "No file was present on the request.",
            ErrorOptions::code("upload.file_missing"),
        ));
    };
    if file.mimetype != "text/csv" {
        return Err(bad_request_error(
            "Failed: import file type must be a CSV.",
            ErrorOptions::code("upload.invalid_file_type"),
        ));
    }
    let buffer = filepath_buffer(&file.filepath).await?;
    let objects = parse_csv_string(&String::from_utf8_lossy(&buffer));
    assert_member_import_headings(&objects)?;
    import_member_objects(ctx.db(), &ctx.config().jwt_secret, objects, &season.id).await?;
    Ok(())
}

/// `encodeURIComponent(value)`.
fn encode_uri_component(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

async fn export(payload: ExportPayload, ctx: Ctx) -> AppResult<Reply> {
    ctx.require_access().await?;
    let archive = create_export_archive(ctx.db(), payload.file_type).await?;
    let filename = &archive.filename;
    let response = Response::builder()
        .status(200)
        .header(header::CACHE_CONTROL, "no-store, max-age=0")
        .header(
            header::CONTENT_DISPOSITION,
            format!(
                "attachment; filename=\"{filename}\"; filename*=UTF-8''{}",
                encode_uri_component(filename)
            ),
        )
        .header(header::CONTENT_LENGTH, archive.buffer.len().to_string())
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::PRAGMA, "no-cache")
        .header(header::EXPIRES, "0")
        .header("x-content-type-options", "nosniff")
        .body(Body::from(archive.buffer))
        .map_err(AppError::internal_from)?;
    Ok(Reply::Response(response))
}

async fn mock_generate(payload: MockGeneratePayload, ctx: Ctx) -> AppResult<()> {
    ctx.require_access().await?;
    if crate::js::trim(&payload.season_id).is_empty() {
        return Err(season_id_missing());
    }
    let season = SEASON
        .get_one(ctx.db(), Season::ID.eq(&payload.season_id))
        .await?;
    // the payload schema bounds both counts to small positive integers
    let data = generate_mock_season_data(
        &season.id,
        payload.teams as usize,
        payload.users_per_team as usize,
    );
    ctx.db()
        .transaction(move |c| {
            MEMBER.tx(c).create_many(&data.members)?;
            TEAM.tx(c).create_many(&data.teams)?;
            USER.tx(c).create_many(&data.users)?;
            Ok(())
        })
        .await
}

async fn delete_all_mock_data(ctx: Ctx) -> AppResult<()> {
    ctx.require_access().await?;
    ctx.db()
        .transaction(|c| {
            let mock_team_ids: Vec<String> = TEAM
                .tx(c)
                .get_many(&Team::IS_MOCK.eq(true), &crate::db::Query::new())?
                .into_iter()
                .map(|team| team.id)
                .collect();
            MEMBER.tx(c).delete_many(&Member::IS_MOCK.eq(true))?;
            TEAM.tx(c).delete_many(&Team::IS_MOCK.eq(true))?;
            USER.tx(c).delete_many(&User::IS_MOCK.eq(true))?;
            REPORT.tx(c).delete_many(&Filter::or([
                Report::TEAM_ID.is_in(mock_team_ids.clone()),
                Report::TEAM_AGAINST_ID.is_in(mock_team_ids),
            ]))?;
            Ok(())
        })
        .await
}

/// The Port endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&PORT_IMPORT, |_: (), ctx: Ctx| import(ctx)),
        Endpoint::raw(&PORT_EXPORT, export),
        Endpoint::new(
            &PORT_GAMEDAY_IMPORT_LOAD,
            |payload: SeasonIdPayload, ctx: Ctx| async move {
                ctx.require_access().await?;
                load_gameday_import_state(&ctx.state, &payload.season_id).await
            },
        ),
        Endpoint::new(
            &PORT_GAMEDAY_IMPORT_SAVE,
            |payload: GamedayImportSavePayload, ctx: Ctx| async move {
                ctx.require_access().await?;
                save_gameday_import_config(&ctx.state, payload).await
            },
        ),
        Endpoint::new(
            &PORT_GAMEDAY_IMPORT,
            |payload: SeasonIdPayload, ctx: Ctx| async move {
                ctx.require_access().await?;
                run_manual_gameday_import(&ctx.state, &payload.season_id).await
            },
        ),
        Endpoint::new(&PORT_MOCK_GENERATE, mock_generate),
        Endpoint::new(&PORT_DELETE_ALL_MOCK_DATA, |_: (), ctx: Ctx| {
            delete_all_mock_data(ctx)
        }),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_like_encode_uri_component() {
        assert_eq!(
            encode_uri_component("frisbee-export-csv-2024-01-01T00-00-00-000Z.zip"),
            "frisbee-export-csv-2024-01-01T00-00-00-000Z.zip"
        );
        assert_eq!(encode_uri_component("a b/é"), "a%20b%2F%C3%A9");
    }
}
