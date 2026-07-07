#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![read_data_file, save_data_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use dirs::home_dir;

#[tauri::command]
fn read_data_file() -> Result<String, String> {
    let data_path = get_data_path();
    let path = Path::new(&data_path);
    if path.exists() {
        let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        Ok(contents)
    } else {
        Ok(String::from(""))
    }
}

#[tauri::command]
fn save_data_file(data: String) -> Result<(), String> {
    let data_path = get_data_path();
    let path = Path::new(&data_path);
    let mut file = File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

fn get_data_path() -> String {
    if let Some(home) = home_dir() {
        let data_dir = home.join(".panduola");
        if !data_dir.exists() {
            let _ = fs::create_dir_all(&data_dir);
        }
        data_dir.join("data.json").to_string_lossy().to_string()
    } else {
        "./data.json".to_string()
    }
}
