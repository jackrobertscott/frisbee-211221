//! Port of `server/src/db/table.test.ts`.

use super::*;
use crate::columns;
use crate::db::migrations::sync_indexes_into;
use crate::db::schema::{compile_index, Collation, Direction::*, IndexDef};
use crate::db::{Db, Query};
use crate::io_schema;
use crate::shared::torva::io;
use crate::tables::{default_id, default_now};
use crate::utils::random::generate_id;
use serde::Deserialize;
use serde_json::json;

io_schema! {
    fn io_widget() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("name", io::string().trim()),
            ("size", io::optional(io::number())),
            ("colour", io::optional(io::string())),
        ])
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Widget {
    id: String,
    created_on: String,
    updated_on: String,
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    colour: Option<String>,
}

columns!(Widget {
    ID: String = "id" / "id" (Text),
    CREATED_ON: String = "createdOn" / "created_on" (Text),
    UPDATED_ON: String = "updatedOn" / "updated_on" (Text),
    NAME: String = "name" / "name" (Text),
    SIZE: f64 = "size" / "size" (Real),
    COLOUR: String = "colour" / "colour" (Text),
});

static WIDGET_TABLE: TableDef = TableDef {
    key: "tableTestWidget",
    sql: "table_test_widget",
    columns: &[Widget::ID.def, Widget::CREATED_ON.def, Widget::UPDATED_ON.def, Widget::NAME.def, Widget::SIZE.def, Widget::COLOUR.def],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("name", Asc), ("size", Desc)]),
        IndexDef::new(&[("colour", Asc)]).named("by_colour"),
    ],
    schema: io_widget,
    defaults: &[("id", default_id), ("createdOn", default_now), ("updatedOn", default_now)],
};

impl Record for Widget {
    fn table() -> &'static TableDef {
        &WIDGET_TABLE
    }
}

const WIDGET: Table<Widget> = Table::new();

fn widget_db() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(dir.path().join("test.sqlite")).unwrap();
    db.call_blocking(|c| {
        c.execute_batch(
            r#"CREATE TABLE "table_test_widget" ("_seq" INTEGER PRIMARY KEY, "id", "created_on", "updated_on", "name", "size", "colour")"#,
        )?;
        sync_indexes_into(c, &[&WIDGET_TABLE], &mut Vec::new())
    })
    .unwrap();
    (dir, db)
}

fn names(widgets: &[Widget]) -> Vec<String> {
    widgets.iter().map(|w| w.name.clone()).collect()
}

mod db_table {
    use super::*;

    #[test]
    fn names_indexes_from_their_keys_unless_named_explicitly() {
        assert_eq!(WIDGET.key(), "tableTestWidget");
        assert_eq!(WIDGET.validator().type_name(), "object");
        let names: Vec<String> = WIDGET_TABLE.compiled_indexes().unwrap().into_iter().map(|i| i.name).collect();
        assert_eq!(names, ["id_asc", "name_asc__size_desc", "by_colour"]);
    }

    #[test]
    fn rejects_duplicate_index_names_and_empty_index_keys() {
        static DUPLICATE: TableDef = TableDef {
            key: "duplicate",
            sql: "duplicate",
            columns: WIDGET_TABLE.columns,
            legacy_columns: &[],
            indexes: &[IndexDef::new(&[("name", Asc)]), IndexDef::new(&[("size", Asc)]).named("name_asc")],
            schema: io_widget,
            defaults: &[],
        };
        assert_eq!(DUPLICATE.compiled_indexes().unwrap_err(), "Duplicate index name \"name_asc\" on table \"duplicate\".");
        assert_eq!(compile_index(&WIDGET_TABLE, &IndexDef::new(&[])).unwrap_err(), "Index requires at least one field.");
    }

    #[tokio::test]
    async fn validates_and_normalises_values_on_create() {
        let (_dir, db) = widget_db();
        let widget = WIDGET.create_one(&db, json!({"name": "  Spanner  ", "size": 3})).await.unwrap();
        assert_eq!(widget.name, "Spanner");
        assert_eq!(widget.size, Some(3.0));
        // every value is validated before any is written
        assert!(WIDGET.create_many(&db, vec![json!({"name": "ok"}), json!({"name": "   "})]).await.is_err());
        assert_eq!(WIDGET.count(&db, Widget::NAME.eq("ok")).await.unwrap(), 0);
    }

    #[tokio::test]
    async fn pages_sorts_and_collates_many() {
        let (_dir, db) = widget_db();
        let values: Vec<Value> = ["b", "A", "c", "D"].iter().map(|name| json!({"name": name, "colour": "page"})).collect();
        WIDGET.create_many(&db, values).await.unwrap();
        let page = WIDGET
            .get_many(
                &db,
                Widget::COLOUR.eq("page"),
                Query::new().sort([Widget::NAME.asc().collate(Collation::CaseInsensitive)]).skip(1).limit(2),
            )
            .await
            .unwrap();
        assert_eq!(names(&page), ["b", "c"]);
        // an empty sort keeps the natural order
        let unsorted = WIDGET.get_many(&db, Widget::COLOUR.eq("page"), Query::new().sort([])).await.unwrap();
        assert_eq!(names(&unsorted), ["b", "A", "c", "D"]);
    }

    #[tokio::test]
    async fn refuses_to_sort_by_id() {
        let (_dir, db) = widget_db();
        let result = WIDGET.get_many(&db, Filter::all(), Query::new().sort([Widget::ID.asc()])).await;
        assert_eq!(result.unwrap_err().message, "Sorting by \"id\" is not allowed.");
    }

    #[tokio::test]
    async fn only_writes_the_fields_an_update_changes() {
        let (_dir, db) = widget_db();
        let widget = WIDGET.create_one(&db, json!({"name": "Partial", "size": 1, "colour": "red"})).await.unwrap();
        // a concurrent write to another field survives the update
        let id = widget.id.clone();
        db.call_blocking(move |c| Ok(c.execute("UPDATE table_test_widget SET colour = 'blue' WHERE id = ?", [id])?)).unwrap();

        let updated = WIDGET
            .update_one(&db, Widget::ID.eq(&widget.id), Patch::new().set(Widget::SIZE, 2.0).set(Widget::ID, "ignored"))
            .await
            .unwrap();
        assert_eq!(updated.size, Some(2.0));
        let stored = WIDGET.get_one(&db, Widget::ID.eq(&widget.id)).await.unwrap();
        assert_eq!((stored.id.as_str(), stored.size, stored.colour.as_deref()), (widget.id.as_str(), Some(2.0), Some("blue")));

        // unset clears a field, and an empty update writes nothing
        WIDGET.update_one(&db, Widget::ID.eq(&widget.id), Patch::new().unset(Widget::SIZE)).await.unwrap();
        assert_eq!(WIDGET.get_one(&db, Widget::ID.eq(&widget.id)).await.unwrap().size, None);
        WIDGET.update_one(&db, Widget::ID.eq(&widget.id), Patch::new()).await.unwrap();
        assert_eq!(WIDGET.get_one(&db, Widget::ID.eq(&widget.id)).await.unwrap().colour.as_deref(), Some("blue"));
    }

    #[tokio::test]
    async fn rejects_updates_to_missing_or_into_invalid_documents() {
        let (_dir, db) = widget_db();
        let missing = WIDGET.update_one(&db, Widget::ID.eq(generate_id()), Patch::new().set(Widget::SIZE, 1.0)).await;
        assert_eq!(missing.unwrap_err().error_code, "db.record_not_found");
        let widget = WIDGET.create_one(&db, json!({"name": "Valid"})).await.unwrap();
        assert!(WIDGET.update_one(&db, Widget::ID.eq(&widget.id), Patch::new().set(Widget::NAME, "")).await.is_err());
        assert_eq!(WIDGET.get_one(&db, Widget::ID.eq(&widget.id)).await.unwrap().name, "Valid");
    }

    #[tokio::test]
    async fn updates_many_with_sets_and_unsets_skipping_ids() {
        let (_dir, db) = widget_db();
        let values: Vec<Value> = ["m1", "m2"].iter().map(|name| json!({"name": name, "colour": "many", "size": 5})).collect();
        WIDGET.create_many(&db, values).await.unwrap();
        let many = || Widget::COLOUR.eq("many");
        assert_eq!(WIDGET.update_many(&db, many(), Patch::new()).await.unwrap(), 0);
        assert_eq!(WIDGET.update_many(&db, many(), Patch::new().set(Widget::ID, "x")).await.unwrap(), 0);
        assert_eq!(WIDGET.update_many(&db, many(), Patch::new().unset(Widget::SIZE)).await.unwrap(), 2);
        assert_eq!(
            WIDGET.update_many(&db, many(), Patch::new().set(Widget::SIZE, 9.0).set(Widget::NAME, "same")).await.unwrap(),
            2
        );
        let widgets = WIDGET.get_many(&db, many(), Query::new()).await.unwrap();
        let pairs: Vec<(String, Option<f64>)> = widgets.iter().map(|w| (w.name.clone(), w.size)).collect();
        assert_eq!(pairs, [("same".to_string(), Some(9.0)), ("same".to_string(), Some(9.0))]);
        assert!(widgets.iter().all(|w| w.id != "x"));
    }

    #[tokio::test]
    async fn applies_bulk_updates_after_validating_every_task() {
        let (_dir, db) = widget_db();
        let a = WIDGET.create_one(&db, json!({"name": "bulk-a", "size": 1})).await.unwrap();
        let b = WIDGET.create_one(&db, json!({"name": "bulk-b", "size": 1})).await.unwrap();
        WIDGET
            .update_bulk(
                &db,
                vec![(Widget::ID.eq(&a.id), Patch::new().set(Widget::SIZE, 10.0)), (Widget::ID.eq(&b.id), Patch::new())],
            )
            .await
            .unwrap();
        assert_eq!(WIDGET.get_one(&db, Widget::ID.eq(&a.id)).await.unwrap().size, Some(10.0));
        assert_eq!(WIDGET.get_one(&db, Widget::ID.eq(&b.id)).await.unwrap().size, Some(1.0));

        let failed = WIDGET
            .update_bulk(
                &db,
                vec![
                    (Widget::ID.eq(&b.id), Patch::new().set(Widget::SIZE, 20.0)),
                    (Widget::ID.eq(generate_id()), Patch::new().set(Widget::SIZE, 20.0)),
                ],
            )
            .await;
        assert_eq!(failed.unwrap_err().error_code, "db.record_not_found");
        // nothing is written when any task fails
        assert_eq!(WIDGET.get_one(&db, Widget::ID.eq(&b.id)).await.unwrap().size, Some(1.0));
        assert!(WIDGET.update_bulk(&db, vec![]).await.is_ok());
    }

    #[tokio::test]
    async fn updates_atomically_with_upserts_and_either_document_version() {
        let (_dir, db) = widget_db();
        let id = generate_id();
        let now = crate::js::date::now_iso();
        let set_size = AtomicUpdate { set: Patch::new().set(Widget::SIZE, 1.0), ..Default::default() };
        assert_eq!(
            WIDGET.find_one_and_update(&db, Widget::ID.eq(&id), set_size, false, ReturnDocument::After).await.unwrap(),
            None
        );
        let created = WIDGET
            .find_one_and_update(
                &db,
                Widget::ID.eq(&id),
                AtomicUpdate {
                    set_on_insert: Patch::new()
                        .set(Widget::CREATED_ON, now.clone())
                        .set(Widget::UPDATED_ON, now.clone())
                        .set(Widget::NAME, "upserted"),
                    inc: vec![(Widget::SIZE.def, 1.0)],
                    ..Default::default()
                },
                true,
                ReturnDocument::After,
            )
            .await
            .unwrap();
        assert_eq!(
            created,
            Some(Widget {
                id: id.clone(),
                created_on: now.clone(),
                updated_on: now.clone(),
                name: "upserted".into(),
                size: Some(1.0),
                colour: None
            })
        );
        let before = WIDGET
            .find_one_and_update(
                &db,
                Widget::ID.eq(&id),
                AtomicUpdate { inc: vec![(Widget::SIZE.def, 1.0)], ..Default::default() },
                false,
                ReturnDocument::Before,
            )
            .await
            .unwrap();
        assert_eq!(before.and_then(|w| w.size), Some(1.0));
        assert_eq!(WIDGET.get_one(&db, Widget::ID.eq(&id)).await.unwrap().size, Some(2.0));
    }

    #[tokio::test]
    async fn aggregates_scans_and_deletes() {
        let (_dir, db) = widget_db();
        let values: Vec<Value> =
            [1, 2, 3].iter().map(|size| json!({"name": format!("scan-{size}"), "size": size, "colour": "scan"})).collect();
        WIDGET.create_many(&db, values).await.unwrap();
        assert_eq!(WIDGET.sum(&db, Widget::SIZE, Widget::COLOUR.eq("scan")).await.unwrap(), 6.0);

        let seen = WIDGET.scan_stored(&db, Widget::COLOUR.eq("scan")).await.unwrap();
        assert_eq!(seen.len(), 3);
        assert!(seen.iter().all(|value| !value.contains_key("_seq") && !value.contains_key("_id")));

        assert_eq!(WIDGET.delete_one(&db, Widget::COLOUR.eq("scan")).await.unwrap(), 1);
        assert_eq!(WIDGET.delete_many(&db, Widget::COLOUR.eq("scan")).await.unwrap(), 2);
        assert_eq!(WIDGET.maybe_one(&db, Widget::COLOUR.eq("scan")).await.unwrap(), None);
        let error = WIDGET.get_one(&db, Widget::COLOUR.eq("scan")).await.unwrap_err();
        assert_eq!(error.error_code, "db.record_not_found");
        assert_eq!(error.meta, Some(json!({"table": "tableTestWidget"}).as_object().cloned().unwrap()));
    }
}
