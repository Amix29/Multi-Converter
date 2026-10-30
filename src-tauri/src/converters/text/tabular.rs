use super::*;

pub(super) fn json_to_csv(content: &str) -> Result<String> {
    let value: serde_json::Value = serde_json::from_str(content)?;
    let rows = match value {
        serde_json::Value::Array(rows) => rows,
        serde_json::Value::Object(_) => vec![value],
        _ => return Err(tabular_error()),
    };
    if rows.is_empty() || rows.iter().any(|row| !row.is_object()) {
        return Err(tabular_error());
    }
    let headers: std::collections::BTreeSet<String> = rows
        .iter()
        .filter_map(serde_json::Value::as_object)
        .flat_map(|row| row.keys().cloned())
        .collect();
    if headers.is_empty() {
        return Err(tabular_error());
    }
    let mut writer = csv::Writer::from_writer(Vec::new());
    writer.write_record(&headers)?;
    for row in &rows {
        let cells: Result<Vec<String>> = headers
            .iter()
            .map(|header| match row.get(header) {
                Some(serde_json::Value::String(value)) => Ok(value.clone()),
                Some(serde_json::Value::Bool(value)) => Ok(value.to_string()),
                Some(serde_json::Value::Number(value)) => Ok(value.to_string()),
                Some(serde_json::Value::Null) | None => Ok(String::new()),
                _ => Err(tabular_error()),
            })
            .collect();
        writer.write_record(cells?)?;
    }
    let bytes = writer
        .into_inner()
        .map_err(|error| ConvertError::Message(error.to_string()))?;
    String::from_utf8(bytes).map_err(|error| ConvertError::Message(error.to_string()))
}

fn tabular_error() -> ConvertError {
    ConvertError::Message(
        "JSON vers CSV : utilisez un objet plat ou une liste non vide d’objets plats. Les structures imbriquées ne sont pas aplaties automatiquement.".to_string()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_records_keep_all_columns_and_significant_values() {
        let csv = json_to_csv(
            r#"[{"name":" Alice, « oui » ","count":42},{"note":"façade\nété","enabled":true}]"#,
        )
        .unwrap();
        let mut reader = csv::Reader::from_reader(csv.as_bytes());
        assert_eq!(
            reader.headers().unwrap().iter().collect::<Vec<_>>(),
            ["count", "enabled", "name", "note"]
        );
        let rows: Vec<_> = reader.records().map(|row| row.unwrap()).collect();
        assert_eq!(&rows[0][0], "42");
        assert_eq!(&rows[0][2], " Alice, « oui » ");
        assert_eq!(&rows[1][1], "true");
        assert_eq!(&rows[1][3], "façade\nété");
    }

    #[test]
    fn nested_or_non_tabular_json_is_rejected_instead_of_flattened() {
        for source in [
            r#"[{"a":{"nested":1}}]"#,
            r#"[{"a":[1,2]}]"#,
            "[]",
            "[1,2]",
            "true",
        ] {
            assert!(json_to_csv(source).is_err(), "{source}");
        }
    }
}
