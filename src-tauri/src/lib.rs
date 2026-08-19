use dirs::home_dir;
use keyring::{Entry, Error as KeyringError};
use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use tempfile::{Builder as TempFileBuilder, NamedTempFile};
use uuid::Uuid;

const APP_DIRECTORY: &str = ".panduola";
const KEYRING_SERVICE: &str = "com.panduola.app";
const KEYRING_ACCOUNT: &str = "stronghold-vault-key";
const MAX_SPACE_BYTES: u64 = 2 * 1024 * 1024 + 256 * 1024;
const MAX_RECOVERY_BYTES: u64 = 11 * 1024 * 1024;
const MAX_DEVICE_BYTES: u64 = 64 * 1024;
const STRONGHOLD_SALT_BYTES: usize = 32;

static KEYRING_INITIALIZATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadFileResult {
    data: String,
    quarantined: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_data_file,
            read_legacy_data_file,
            save_data_file,
            read_space_file,
            save_space_file,
            create_space_file_if_absent,
            read_recovery_file,
            save_recovery_file,
            read_device_file,
            save_device_file,
            quarantine_data_file,
            get_or_create_stronghold_password
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let stronghold_result = (|| -> Result<(), String> {
                let salt_path = app
                    .path()
                    .app_local_data_dir()
                    .map(|path| path.join("stronghold-salt"))
                    .map_err(|error| error.to_string())?;
                if let Some(parent) = salt_path.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                prepare_stronghold_salt(&salt_path)?;
                app.handle()
                    .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())
                    .map_err(|error| error.to_string())
            })();
            if let Err(error) = stronghold_result {
                log::warn!("Secure session storage is unavailable: {error}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn app_data_dir() -> Result<PathBuf, String> {
    home_dir()
        .map(|home| home.join(APP_DIRECTORY))
        .ok_or_else(|| "LOCAL_STORAGE_FAILED: home directory is unavailable".to_string())
}

fn validate_owner_key(owner_key: &str) -> Result<String, String> {
    if owner_key == "guest" {
        return Ok("guest".to_string());
    }

    let user_id = owner_key
        .strip_prefix("user:")
        .ok_or_else(|| "INVALID_OWNER_KEY: expected guest or user:<uuid>".to_string())?;
    let uuid = Uuid::parse_str(user_id)
        .map_err(|_| "INVALID_OWNER_KEY: user id must be a UUID".to_string())?;
    let canonical_user_id = uuid.hyphenated().to_string();
    if canonical_user_id != user_id.to_ascii_lowercase() {
        return Err("INVALID_OWNER_KEY: user id must use canonical UUID format".to_string());
    }
    Ok(format!("user-{canonical_user_id}"))
}

fn space_path(base_dir: &Path, owner_key: &str) -> Result<PathBuf, String> {
    Ok(base_dir
        .join("spaces")
        .join(format!("{}.json", validate_owner_key(owner_key)?)))
}

fn recovery_path(base_dir: &Path, owner_key: &str) -> Result<PathBuf, String> {
    Ok(base_dir
        .join("recoveries")
        .join(format!("{}.json", validate_owner_key(owner_key)?)))
}

fn device_path(base_dir: &Path) -> PathBuf {
    base_dir.join("device.json")
}

fn legacy_data_path(base_dir: &Path) -> PathBuf {
    base_dir.join("data.json")
}

fn read_text_file(path: &Path, max_bytes: u64) -> Result<String, String> {
    if !path.exists() {
        return Ok(String::new());
    }

    let file = File::open(path)
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to open file: {error}"))?;
    let mut bytes = Vec::with_capacity(max_bytes.min(256 * 1024) as usize);
    file.take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to read file: {error}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "LOCAL_DATA_CORRUPTED: file exceeds {max_bytes} bytes"
        ));
    }
    String::from_utf8(bytes)
        .map_err(|error| format!("LOCAL_DATA_CORRUPTED: file is not UTF-8: {error}"))
}

fn contains_session_token(value: &Value) -> bool {
    match value {
        Value::Object(entries) => entries.iter().any(|(key, child)| {
            matches!(
                key.to_ascii_lowercase().as_str(),
                "access_token" | "refresh_token" | "provider_token" | "provider_refresh_token"
            ) || contains_session_token(child)
        }),
        Value::Array(items) => items.iter().any(contains_session_token),
        _ => false,
    }
}

fn validate_json_without_session(data: &str, max_bytes: u64) -> Result<(), String> {
    if data.len() as u64 > max_bytes {
        return Err(format!(
            "LOCAL_STORAGE_FAILED: data exceeds {max_bytes} bytes"
        ));
    }
    let value: Value = serde_json::from_str(data)
        .map_err(|error| format!("LOCAL_DATA_CORRUPTED: invalid JSON: {error}"))?;
    if contains_session_token(&value) {
        return Err(
            "LOCAL_STORAGE_FAILED: session credentials cannot be written to business data files"
                .to_string(),
        );
    }
    Ok(())
}

fn create_same_directory_temp_file(path: &Path) -> Result<NamedTempFile, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "LOCAL_STORAGE_FAILED: destination has no parent".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to create directory: {error}"))?;
    TempFileBuilder::new()
        .prefix(".panduola-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to create temp file: {error}"))
}

fn validate_stronghold_salt(path: &Path) -> Result<(), String> {
    let salt = fs::read(path)
        .map_err(|error| format!("CREDENTIAL_STORAGE_UNAVAILABLE: failed to read salt: {error}"))?;
    if salt.len() != STRONGHOLD_SALT_BYTES {
        return Err(format!(
            "CREDENTIAL_STORAGE_UNAVAILABLE: salt must be {STRONGHOLD_SALT_BYTES} bytes"
        ));
    }
    Ok(())
}

fn prepare_stronghold_salt(path: &Path) -> Result<(), String> {
    if path.exists() {
        return validate_stronghold_salt(path);
    }

    let mut salt = [0_u8; STRONGHOLD_SALT_BYTES];
    getrandom::fill(&mut salt).map_err(|error| {
        format!("CREDENTIAL_STORAGE_UNAVAILABLE: failed to generate salt: {error}")
    })?;
    let mut temp_file = create_same_directory_temp_file(path)?;
    temp_file.write_all(&salt).map_err(|error| {
        format!("CREDENTIAL_STORAGE_UNAVAILABLE: failed to write salt: {error}")
    })?;
    temp_file
        .as_file()
        .sync_all()
        .map_err(|error| format!("CREDENTIAL_STORAGE_UNAVAILABLE: failed to sync salt: {error}"))?;
    match temp_file.persist_noclobber(path) {
        Ok(_) => {
            #[cfg(unix)]
            if let Some(parent) = path.parent() {
                File::open(parent)
                    .and_then(|directory| directory.sync_all())
                    .map_err(|error| {
                        format!(
                            "CREDENTIAL_STORAGE_UNAVAILABLE: failed to sync salt directory: {error}"
                        )
                    })?;
            }
            Ok(())
        }
        Err(_error) if path.exists() => validate_stronghold_salt(path),
        Err(error) => Err(format!(
            "CREDENTIAL_STORAGE_UNAVAILABLE: failed to persist salt: {}",
            error.error
        )),
    }
}

fn atomic_write(path: &Path, data: &str, max_bytes: u64) -> Result<(), String> {
    validate_json_without_session(data, max_bytes)?;
    let mut temp_file = create_same_directory_temp_file(path)?;
    temp_file
        .write_all(data.as_bytes())
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to write temp file: {error}"))?;
    temp_file
        .flush()
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to flush temp file: {error}"))?;
    temp_file
        .as_file()
        .sync_all()
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to sync temp file: {error}"))?;
    temp_file.persist(path).map_err(|error| {
        format!(
            "LOCAL_STORAGE_FAILED: failed to replace file: {}",
            error.error
        )
    })?;

    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        if let Err(error) = File::open(parent).and_then(|directory| directory.sync_all()) {
            log::warn!("Atomic file replacement committed but directory sync failed: {error}");
        }
    }
    Ok(())
}

fn atomic_write_if_absent(path: &Path, data: &str, max_bytes: u64) -> Result<bool, String> {
    validate_json_without_session(data, max_bytes)?;
    let mut temp_file = create_same_directory_temp_file(path)?;
    temp_file
        .write_all(data.as_bytes())
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to write temp file: {error}"))?;
    temp_file
        .flush()
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to flush temp file: {error}"))?;
    temp_file
        .as_file()
        .sync_all()
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to sync temp file: {error}"))?;
    match temp_file.persist_noclobber(path) {
        Ok(_) => {
            #[cfg(unix)]
            if let Some(parent) = path.parent() {
                if let Err(error) = File::open(parent).and_then(|directory| directory.sync_all()) {
                    log::warn!("New file committed but directory sync failed: {error}");
                }
            }
            Ok(true)
        }
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
        Err(error) => Err(format!(
            "LOCAL_STORAGE_FAILED: failed to create file: {}",
            error.error
        )),
    }
}

fn quarantine_existing_file(
    base_dir: &Path,
    owner_key: &str,
    kind: &str,
    source_path: &Path,
) -> Result<(), String> {
    let owner_name = validate_owner_key(owner_key)?;
    let quarantine_dir = base_dir.join("quarantine");
    fs::create_dir_all(&quarantine_dir).map_err(|error| {
        format!("LOCAL_STORAGE_FAILED: failed to create quarantine directory: {error}")
    })?;
    let destination =
        quarantine_dir.join(format!("{owner_name}-{kind}-{}.quarantine", Uuid::new_v4()));
    fs::rename(source_path, destination)
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: failed to quarantine file: {error}"))
}

async fn run_blocking<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("LOCAL_STORAGE_FAILED: blocking task failed: {error}"))?
}

fn read_with_quarantine(
    base_dir: &Path,
    owner_key: &str,
    kind: &str,
    path: &Path,
    max_bytes: u64,
) -> Result<ReadFileResult, String> {
    match read_text_file(path, max_bytes) {
        Ok(data) => Ok(ReadFileResult {
            data,
            quarantined: false,
        }),
        Err(error) if error.starts_with("LOCAL_DATA_CORRUPTED:") => {
            quarantine_existing_file(base_dir, owner_key, kind, path)?;
            Ok(ReadFileResult {
                data: String::new(),
                quarantined: true,
            })
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
async fn read_data_file() -> Result<String, String> {
    run_blocking(|| {
        let base_dir = app_data_dir()?;
        read_text_file(&legacy_data_path(&base_dir), MAX_SPACE_BYTES)
    })
    .await
}

#[tauri::command]
async fn read_legacy_data_file() -> Result<ReadFileResult, String> {
    run_blocking(|| {
        let base_dir = app_data_dir()?;
        let path = legacy_data_path(&base_dir);
        read_with_quarantine(&base_dir, "guest", "legacy", &path, MAX_SPACE_BYTES)
    })
    .await
}

#[tauri::command]
async fn save_data_file(data: String) -> Result<(), String> {
    run_blocking(move || {
        let base_dir = app_data_dir()?;
        atomic_write(&legacy_data_path(&base_dir), &data, MAX_SPACE_BYTES)
    })
    .await
}

#[tauri::command]
async fn read_space_file(owner_key: String) -> Result<ReadFileResult, String> {
    run_blocking(move || {
        let base_dir = app_data_dir()?;
        let path = space_path(&base_dir, &owner_key)?;
        read_with_quarantine(&base_dir, &owner_key, "space", &path, MAX_SPACE_BYTES)
    })
    .await
}

#[tauri::command]
async fn save_space_file(owner_key: String, data: String) -> Result<(), String> {
    run_blocking(move || {
        let base_dir = app_data_dir()?;
        atomic_write(&space_path(&base_dir, &owner_key)?, &data, MAX_SPACE_BYTES)
    })
    .await
}

#[tauri::command]
async fn create_space_file_if_absent(owner_key: String, data: String) -> Result<bool, String> {
    run_blocking(move || {
        let base_dir = app_data_dir()?;
        atomic_write_if_absent(&space_path(&base_dir, &owner_key)?, &data, MAX_SPACE_BYTES)
    })
    .await
}

#[tauri::command]
async fn read_recovery_file(owner_key: String) -> Result<ReadFileResult, String> {
    run_blocking(move || {
        let base_dir = app_data_dir()?;
        let path = recovery_path(&base_dir, &owner_key)?;
        read_with_quarantine(&base_dir, &owner_key, "recovery", &path, MAX_RECOVERY_BYTES)
    })
    .await
}

#[tauri::command]
async fn save_recovery_file(owner_key: String, data: String) -> Result<(), String> {
    run_blocking(move || {
        let base_dir = app_data_dir()?;
        atomic_write(
            &recovery_path(&base_dir, &owner_key)?,
            &data,
            MAX_RECOVERY_BYTES,
        )
    })
    .await
}

#[tauri::command]
async fn read_device_file() -> Result<String, String> {
    run_blocking(|| {
        let base_dir = app_data_dir()?;
        read_text_file(&device_path(&base_dir), MAX_DEVICE_BYTES)
    })
    .await
}

#[tauri::command]
async fn save_device_file(data: String) -> Result<(), String> {
    run_blocking(move || {
        let base_dir = app_data_dir()?;
        atomic_write(&device_path(&base_dir), &data, MAX_DEVICE_BYTES)
    })
    .await
}

#[tauri::command]
async fn quarantine_data_file(owner_key: String, kind: String) -> Result<(), String> {
    run_blocking(move || {
        let base_dir = app_data_dir()?;
        let source_path = match kind.as_str() {
            "space" => space_path(&base_dir, &owner_key)?,
            "recovery" => recovery_path(&base_dir, &owner_key)?,
            "legacy" if owner_key == "guest" => legacy_data_path(&base_dir),
            _ => return Err("INVALID_QUARANTINE_KIND: unsupported kind".to_string()),
        };
        quarantine_existing_file(&base_dir, &owner_key, &kind, &source_path)
    })
    .await
}

fn get_or_create_keyring_password() -> Result<String, String> {
    let initialization_lock = KEYRING_INITIALIZATION_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = initialization_lock
        .lock()
        .map_err(|_| "CREDENTIAL_STORAGE_UNAVAILABLE: initialization lock poisoned".to_string())?;
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("CREDENTIAL_STORAGE_UNAVAILABLE: {error}"))?;
    match entry.get_password() {
        Ok(password) if !password.is_empty() => Ok(password),
        Ok(_) | Err(KeyringError::NoEntry) => {
            let password = Uuid::new_v4().to_string();
            entry
                .set_password(&password)
                .map_err(|error| format!("CREDENTIAL_STORAGE_UNAVAILABLE: {error}"))?;
            Ok(password)
        }
        Err(error) => Err(format!("CREDENTIAL_STORAGE_UNAVAILABLE: {error}")),
    }
}

#[tauri::command]
async fn get_or_create_stronghold_password() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(get_or_create_keyring_password)
        .await
        .map_err(|error| format!("CREDENTIAL_STORAGE_UNAVAILABLE: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn owner_key_validation_prevents_arbitrary_paths() {
        let base = Path::new("/tmp/panduola-test");
        assert_eq!(
            space_path(base, "guest").unwrap(),
            base.join("spaces/guest.json")
        );
        assert_eq!(
            space_path(base, "user:11111111-1111-4111-8111-111111111111").unwrap(),
            base.join("spaces/user-11111111-1111-4111-8111-111111111111.json")
        );
        for invalid in [
            "../guest",
            "user:../../escape",
            "user:not-a-uuid",
            "user:11111111111141118111111111111111",
        ] {
            assert!(space_path(base, invalid).is_err(), "{invalid} was accepted");
        }
    }

    #[test]
    fn atomic_write_uses_same_directory_and_replaces_complete_file() {
        let directory = tempdir().unwrap();
        let destination = directory.path().join("spaces/guest.json");
        let temp_file = create_same_directory_temp_file(&destination).unwrap();
        assert_eq!(temp_file.path().parent(), destination.parent());
        drop(temp_file);

        atomic_write(&destination, r#"{"version":1}"#, MAX_SPACE_BYTES).unwrap();
        assert_eq!(
            fs::read_to_string(&destination).unwrap(),
            r#"{"version":1}"#
        );
        atomic_write(&destination, r#"{"version":2}"#, MAX_SPACE_BYTES).unwrap();
        assert_eq!(
            fs::read_to_string(&destination).unwrap(),
            r#"{"version":2}"#
        );
        assert!(fs::read_dir(destination.parent().unwrap())
            .unwrap()
            .all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")));
    }

    #[test]
    fn business_files_reject_session_tokens_without_overwriting() {
        let directory = tempdir().unwrap();
        let destination = directory.path().join("spaces/guest.json");
        atomic_write(
            &destination,
            r#"{"snapshot":{"links":[]}}"#,
            MAX_SPACE_BYTES,
        )
        .unwrap();
        let original = fs::read_to_string(&destination).unwrap();

        let result = atomic_write(
            &destination,
            r#"{"access_token":"secret","refresh_token":"secret"}"#,
            MAX_SPACE_BYTES,
        );
        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&destination).unwrap(), original);
    }

    #[test]
    fn failed_atomic_write_preserves_existing_data() {
        let directory = tempdir().unwrap();
        let destination = directory.path().join("spaces/guest.json");
        atomic_write(&destination, r#"{"version":1}"#, MAX_SPACE_BYTES).unwrap();

        let oversized = format!(r#"{{"data":"{}"}}"#, "x".repeat(MAX_SPACE_BYTES as usize));
        assert!(atomic_write(&destination, &oversized, MAX_SPACE_BYTES).is_err());
        assert_eq!(
            fs::read_to_string(&destination).unwrap(),
            r#"{"version":1}"#
        );
    }

    #[test]
    fn atomic_write_if_absent_never_replaces_the_winning_space() {
        let directory = tempdir().unwrap();
        let destination = directory.path().join("spaces/user.json");

        assert!(
            atomic_write_if_absent(&destination, r#"{"owner":"first"}"#, MAX_SPACE_BYTES).unwrap()
        );
        assert!(
            !atomic_write_if_absent(&destination, r#"{"owner":"second"}"#, MAX_SPACE_BYTES)
                .unwrap()
        );
        assert_eq!(
            fs::read_to_string(destination).unwrap(),
            r#"{"owner":"first"}"#
        );
    }

    #[test]
    fn stronghold_salt_is_created_once_and_reused() {
        let directory = tempdir().unwrap();
        let salt_path = directory.path().join("secure/stronghold-salt");

        prepare_stronghold_salt(&salt_path).unwrap();
        let first = fs::read(&salt_path).unwrap();
        assert_eq!(first.len(), STRONGHOLD_SALT_BYTES);

        prepare_stronghold_salt(&salt_path).unwrap();
        assert_eq!(fs::read(&salt_path).unwrap(), first);
    }

    #[test]
    fn invalid_stronghold_salt_fails_without_touching_business_data() {
        let directory = tempdir().unwrap();
        let salt_path = directory.path().join("stronghold-salt");
        let business_path = directory.path().join("spaces/guest.json");
        fs::create_dir_all(business_path.parent().unwrap()).unwrap();
        fs::write(&salt_path, b"short").unwrap();
        fs::write(&business_path, r#"{"version":1}"#).unwrap();

        let error = prepare_stronghold_salt(&salt_path).unwrap_err();
        assert!(error.starts_with("CREDENTIAL_STORAGE_UNAVAILABLE:"));
        assert_eq!(fs::read(&salt_path).unwrap(), b"short");
        assert_eq!(
            fs::read_to_string(&business_path).unwrap(),
            r#"{"version":1}"#
        );
    }

    #[test]
    fn oversized_file_is_quarantined_without_copying_its_contents() {
        let directory = tempdir().unwrap();
        let source = space_path(directory.path(), "guest").unwrap();
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        let original = vec![b'x'; 33];
        fs::write(&source, &original).unwrap();

        let result = read_with_quarantine(directory.path(), "guest", "space", &source, 32).unwrap();
        assert!(result.quarantined);
        assert!(result.data.is_empty());
        assert!(!source.exists());

        let quarantine_files = fs::read_dir(directory.path().join("quarantine"))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(quarantine_files.len(), 1);
        assert_eq!(fs::read(quarantine_files[0].path()).unwrap(), original);
    }

    #[test]
    fn non_utf8_file_is_quarantined_and_invalid_kind_is_rejected() {
        let directory = tempdir().unwrap();
        let source = recovery_path(directory.path(), "guest").unwrap();
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::write(&source, [0xff, 0xfe, 0xfd]).unwrap();

        let result =
            read_with_quarantine(directory.path(), "guest", "recovery", &source, 32).unwrap();
        assert!(result.quarantined);
        assert!(!source.exists());
        assert!(validate_owner_key("user:../../escape").is_err());
        assert!(
            quarantine_existing_file(directory.path(), "user:../../escape", "space", &source)
                .is_err()
        );
    }
}
