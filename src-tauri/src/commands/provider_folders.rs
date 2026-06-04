use crate::provider::ProviderFolder;
use crate::store::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct SortOrderUpdate {
    pub id: String,
    #[serde(rename = "sortIndex")]
    pub sort_index: i64,
}

#[tauri::command]
pub fn get_provider_folders(
    app_type: String,
    state: State<'_, AppState>,
) -> Result<Vec<ProviderFolder>, String> {
    state
        .db
        .get_provider_folders(&app_type)
        .map_err(|e| format!("Failed to get folders: {e}"))
}

#[tauri::command]
pub fn create_provider_folder(
    name: String,
    app_type: String,
    state: State<'_, AppState>,
) -> Result<ProviderFolder, String> {
    let id = Uuid::new_v4().to_string();
    state
        .db
        .create_provider_folder(&id, &name, &app_type)
        .map_err(|e| format!("Failed to create folder: {e}"))
}

#[tauri::command]
pub fn rename_provider_folder(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .rename_provider_folder(&id, &name)
        .map_err(|e| format!("Failed to rename folder: {e}"))
}

#[tauri::command]
pub fn delete_provider_folder(
    id: String,
    app_type: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .delete_provider_folder(&id, &app_type)
        .map_err(|e| format!("Failed to delete folder: {e}"))
}

#[tauri::command]
pub fn update_provider_folder_sort_order(
    updates: Vec<SortOrderUpdate>,
    app_type: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pairs: Vec<(String, i64)> = updates.into_iter().map(|u| (u.id, u.sort_index)).collect();
    state
        .db
        .update_provider_folder_sort_order(&pairs, &app_type)
        .map_err(|e| format!("Failed to update folder sort order: {e}"))
}

#[tauri::command]
pub fn move_provider_to_folder(
    #[allow(non_snake_case)] provider_id: String,
    app_type: String,
    folder_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .move_provider_to_folder(&provider_id, &app_type, folder_id.as_deref())
        .map_err(|e| format!("Failed to move provider: {e}"))
}
