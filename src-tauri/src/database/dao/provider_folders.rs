use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::provider::ProviderFolder;
use rusqlite::params;

impl Database {
    /// 获取指定 app 下的所有文件夹（按 sort_index 排序）
    pub fn get_provider_folders(&self, app_type: &str) -> Result<Vec<ProviderFolder>, AppError> {
        let conn = lock_conn!(self.conn);
        let mut stmt = conn
            .prepare(
                "SELECT id, name, app_type, sort_index
                 FROM provider_folders
                 WHERE app_type = ?1
                 ORDER BY sort_index ASC, name ASC",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![app_type], |row| {
                Ok(ProviderFolder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    app_type: row.get(2)?,
                    sort_index: row.get(3)?,
                })
            })
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut folders = Vec::new();
        for row in rows {
            folders.push(row.map_err(|e| AppError::Database(e.to_string()))?);
        }
        Ok(folders)
    }

    /// 创建新文件夹（sort_index 自动设为当前最大 + 1）
    pub fn create_provider_folder(
        &self,
        id: &str,
        name: &str,
        app_type: &str,
    ) -> Result<ProviderFolder, AppError> {
        let conn = lock_conn!(self.conn);
        let max_sort: Option<i64> = conn
            .query_row(
                "SELECT MAX(sort_index) FROM provider_folders WHERE app_type = ?1",
                params![app_type],
                |row| row.get(0),
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        let sort_index = max_sort.map(|v| v + 1).unwrap_or(0);

        conn.execute(
            "INSERT INTO provider_folders (id, name, app_type, sort_index) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, app_type, sort_index],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(ProviderFolder {
            id: id.to_string(),
            name: name.to_string(),
            app_type: app_type.to_string(),
            sort_index,
        })
    }

    /// 重命名文件夹
    pub fn rename_provider_folder(&self, id: &str, name: &str) -> Result<(), AppError> {
        let conn = lock_conn!(self.conn);
        let affected = conn
            .execute(
                "UPDATE provider_folders SET name = ?1 WHERE id = ?2",
                params![name, id],
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        if affected == 0 {
            return Err(AppError::Database(format!("文件夹 {id} 不存在")));
        }
        Ok(())
    }

    /// 删除文件夹，并将该文件夹下的所有 provider 的 meta.folderId 清掉
    pub fn delete_provider_folder(&self, id: &str, app_type: &str) -> Result<(), AppError> {
        let mut conn = lock_conn!(self.conn);
        let tx = conn
            .transaction()
            .map_err(|e| AppError::Database(e.to_string()))?;

        // 先确认文件夹存在
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM provider_folders WHERE id = ?1)",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        if !exists {
            return Err(AppError::Database(format!("文件夹 {id} 不存在")));
        }

        // 查出所有该 app_type 下的 provider，如果 meta.folderId == id，则置空
        let provider_updates: Vec<(String, String)> = {
            let mut stmt = tx
                .prepare("SELECT id, meta FROM providers WHERE app_type = ?1")
                .map_err(|e| AppError::Database(e.to_string()))?;

            let rows = stmt
                .query_map(params![app_type], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| AppError::Database(e.to_string()))?;

            let mut updates = Vec::new();
            for row in rows {
                let (provider_id, meta_str) = row.map_err(|e| AppError::Database(e.to_string()))?;
                if let Ok(mut meta_val) = serde_json::from_str::<serde_json::Value>(&meta_str) {
                    if meta_val
                        .get("folderId")
                        .and_then(|v| v.as_str())
                        .map(|v| v == id)
                        .unwrap_or(false)
                    {
                        meta_val.as_object_mut().and_then(|o| o.remove("folderId"));
                        if let Ok(cleaned) = serde_json::to_string(&meta_val) {
                            updates.push((provider_id, cleaned));
                        }
                    }
                }
            }
            updates
        }; // stmt dropped here

        for (provider_id, new_meta) in &provider_updates {
            tx.execute(
                "UPDATE providers SET meta = ?1 WHERE id = ?2 AND app_type = ?3",
                params![new_meta, provider_id, app_type],
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        // 删除文件夹
        tx.execute("DELETE FROM provider_folders WHERE id = ?1", params![id])
            .map_err(|e| AppError::Database(e.to_string()))?;

        tx.commit().map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    /// 更新文件夹排序
    pub fn update_provider_folder_sort_order(
        &self,
        updates: &[(String, i64)],
        app_type: &str,
    ) -> Result<(), AppError> {
        let mut conn = lock_conn!(self.conn);
        let tx = conn
            .transaction()
            .map_err(|e| AppError::Database(e.to_string()))?;

        for (folder_id, new_index) in updates {
            tx.execute(
                "UPDATE provider_folders SET sort_index = ?1 WHERE id = ?2 AND app_type = ?3",
                params![new_index, folder_id, app_type],
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        tx.commit().map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    /// 移动供应商到指定文件夹（更新 meta JSON 中的 folderId）
    pub fn move_provider_to_folder(
        &self,
        provider_id: &str,
        app_type: &str,
        folder_id: Option<&str>,
    ) -> Result<(), AppError> {
        let conn = lock_conn!(self.conn);
        let meta_str: String = conn
            .query_row(
                "SELECT meta FROM providers WHERE id = ?1 AND app_type = ?2",
                params![provider_id, app_type],
                |row| row.get(0),
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut meta_val: serde_json::Value = serde_json::from_str(&meta_str).unwrap_or_default();

        match folder_id {
            Some(fid) if !fid.is_empty() => {
                // 校验文件夹存在
                let folder_exists: bool = conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM provider_folders WHERE id = ?1 AND app_type = ?2)",
                        params![fid, app_type],
                        |row| row.get(0),
                    )
                    .map_err(|e| AppError::Database(e.to_string()))?;
                if !folder_exists {
                    return Err(AppError::Database(format!("文件夹 {fid} 不存在")));
                }
                meta_val["folderId"] = serde_json::Value::String(fid.to_string());
            }
            _ => {
                // 置空 = 从未分配
                meta_val.as_object_mut().and_then(|o| o.remove("folderId"));
            }
        }

        let new_meta = serde_json::to_string(&meta_val)
            .map_err(|e| AppError::Database(format!("JSON serialize failed: {e}")))?;

        conn.execute(
            "UPDATE providers SET meta = ?1 WHERE id = ?2 AND app_type = ?3",
            params![new_meta, provider_id, app_type],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::database::Database;
    use crate::provider::Provider;
    use serde_json::json;

    #[test]
    fn folder_crud_and_sort_order() {
        let db = Database::memory().expect("memory db");

        // 创建两个文件夹，sort_index 自增
        let a = db
            .create_provider_folder("fa", "Folder A", "claude")
            .expect("create a");
        let b = db
            .create_provider_folder("fb", "Folder B", "claude")
            .expect("create b");
        assert_eq!(a.sort_index, 0);
        assert_eq!(b.sort_index, 1);

        // 另一个 app 的文件夹互不影响
        db.create_provider_folder("fc", "Folder C", "codex")
            .expect("create c");

        let claude_folders = db.get_provider_folders("claude").expect("get claude");
        assert_eq!(claude_folders.len(), 2);
        let codex_folders = db.get_provider_folders("codex").expect("get codex");
        assert_eq!(codex_folders.len(), 1);

        // 重命名
        db.rename_provider_folder("fa", "Renamed A")
            .expect("rename");
        let folders = db.get_provider_folders("claude").expect("get");
        assert_eq!(
            folders.iter().find(|f| f.id == "fa").unwrap().name,
            "Renamed A"
        );

        // 排序更新
        db.update_provider_folder_sort_order(
            &[("fa".to_string(), 5), ("fb".to_string(), 1)],
            "claude",
        )
        .expect("sort");
        let folders = db.get_provider_folders("claude").expect("get");
        // 排序后 fb(1) 在前，fa(5) 在后
        assert_eq!(folders[0].id, "fb");
        assert_eq!(folders[1].id, "fa");
    }

    #[test]
    fn delete_folder_clears_provider_folder_id() {
        let db = Database::memory().expect("memory db");
        db.create_provider_folder("f1", "F1", "claude")
            .expect("create folder");

        // 建一个 provider 并归入 f1
        let mut provider = Provider::with_id(
            "p1".to_string(),
            "P1".to_string(),
            json!({ "env": {} }),
            None,
        );
        provider.meta = Some(crate::provider::ProviderMeta {
            folder_id: Some("f1".to_string()),
            ..Default::default()
        });
        db.save_provider("claude", &provider).expect("save");

        // 删除文件夹后，provider 的 folderId 被清掉
        db.delete_provider_folder("f1", "claude")
            .expect("delete folder");
        assert!(db.get_provider_folders("claude").unwrap().is_empty());

        let reloaded = db
            .get_provider_by_id("p1", "claude")
            .expect("query")
            .expect("provider exists");
        assert!(reloaded.meta.unwrap().folder_id.is_none());
    }

    #[test]
    fn move_provider_to_folder_sets_and_clears() {
        let db = Database::memory().expect("memory db");
        db.create_provider_folder("f1", "F1", "claude")
            .expect("create folder");
        let provider = Provider::with_id(
            "p1".to_string(),
            "P1".to_string(),
            json!({ "env": {} }),
            None,
        );
        db.save_provider("claude", &provider).expect("save");

        // 移入 f1
        db.move_provider_to_folder("p1", "claude", Some("f1"))
            .expect("move in");
        let p = db.get_provider_by_id("p1", "claude").unwrap().unwrap();
        assert_eq!(p.meta.unwrap().folder_id.as_deref(), Some("f1"));

        // 移出（None）
        db.move_provider_to_folder("p1", "claude", None)
            .expect("move out");
        let p = db.get_provider_by_id("p1", "claude").unwrap().unwrap();
        assert!(p.meta.unwrap().folder_id.is_none());

        // 移入不存在的文件夹应报错
        assert!(db
            .move_provider_to_folder("p1", "claude", Some("ghost"))
            .is_err());
    }
}
